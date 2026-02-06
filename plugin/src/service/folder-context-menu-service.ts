/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import {
  OperatorProjectDetector,
  OperatorProjectType,
  type OperatorProjectDetectionResult,
} from '@plugin/domain/services/operator-project-detector';
import {
  createProject,
  getProjectByPath,
  getProjectById,
  deleteProject,
  getAllProjects,
  getContainingStandardCustomProject,
  updateStandardCustomOperators,
  type SubOperatorInfo,
} from '@plugin/domain/models/project-model';
import { WorkspaceDetectorService } from './workspace-detector-service';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { projectService } from './project-service';
import { OperatorProjectIconTheme } from '@plugin/class/operator-project-icon-theme';
import { generateStructure } from '@plugin/domain';
import { getOpsByProjectId, getOpByProjectIdAndOpName } from '@plugin/domain/models/model';
import { getConfig, getConfigById, postConfig } from '@plugin/domain/services/configuration';
import { buildService } from './build-service';
import { taskMethods } from '../controller/task-controller';
import {
  COMMAND_FLASH_MS_SANITIZER_RUN_DATA,
  COMMAND_FLASH_PERFORMANCE_RUN_DATA,
} from '@plugin/constants';

/**
 * 根目录下的算子合集白名单
 */
const ROOT_OPERATOR_COLLECTIONS = new Set([
  'image',
  'objdetect',
  'conversion',
  'math',
  'random',
  'activation',
  'control',
  'conv',
  'foreach',
  'index',
  'loss',
  'matmul',
  'norm',
  'optim',
  'pooling',
  'quant',
  'rnn',
  'vfusion',
  'hash',
  'attention',
  'ffn',
  'gmm',
  'mc2',
  'moe',
  'posembedding',
  'select_attention_operators',
]);

/**
 * experimental 目录下的算子合集白名单
 */
const EXPERIMENTAL_OPERATOR_COLLECTIONS = new Set([
  'image',
  'objdetect',
  'conversion',
  'math',
  'npu_ops_math_ext',
  'random',
  'activation',
  'control',
  'conv',
  'foreach',
  'index',
  'loss',
  'matmul',
  'norm',
  'optim',
  'pooling',
  'quant',
  'rnn',
  'vfusion',
  'attention',
  'ffn',
  'gmm',
  'mc2',
  'moe',
  'npu_ops_transformer_ext',
  'posembedding',
  'select_attention_operators',
]);

/**
 * 判断目录是否为标准自定义算子的根目录（含 build.sh 且包含 --genop）
 */
function isStandardCustomRoot(dirPath: string): boolean {
  const buildSh = path.join(dirPath, 'build.sh');

  if (!fs.existsSync(buildSh)) {
    return false;
  }

  try {
    const content = fs.readFileSync(buildSh, 'utf-8');

    return content.includes('--genop');
  } catch {
    return false;
  }
}

/**
 * 判断目录是否为标准自定义算子的子算子（包含 CMakeLists.txt）
 */
function isStandardCustomSubOperator(dirPath: string): boolean {
  const cmakeListsPath = path.join(dirPath, 'CMakeLists.txt');
  return fs.existsSync(cmakeListsPath);
}

/**
 * 向上查找标准自定义算子根目录（含 build.sh --genop），最多查找 5 层
 */
function findStandardCustomRoot(startPath: string): string | null {
  let dir = path.normalize(startPath);
  for (let i = 0; i < 5; i++) {
    if (isStandardCustomRoot(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * 检查标准自定义算子是否支持异常检测与调优
 * 通过检查根目录的 build.sh 是否包含 --bisheng_flags
 */
function checkSupportsSanitizerAndTuning(rootPath: string): boolean {
  const buildShPath = path.join(rootPath, 'build.sh');
  if (!fs.existsSync(buildShPath)) return false;
  try {
    const content = fs.readFileSync(buildShPath, 'utf-8');
    return content.includes('--bisheng_flags');
  } catch {
    return false;
  }
}

/**
 * 文件夹右键菜单服务
 * 处理文件夹右键菜单的相关操作
 */
export class FolderContextMenuService {
  /**
   * 标记文件夹为算子工程
   * 1. 仅根目录（含 build.sh --genop）可记为标准自定义算子，并在 projects 中新建一项。
   * 2. 算子集合、子算子不再在 projects 中新建；其信息存于根项目的 ops_meet、ops_list、experimental_ops_list。
   */
  static async markAsOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;

    try {
      // 1. 找到根目录（标准自定义算子）
      const rootPath = findStandardCustomRoot(folderPath);
      if (!rootPath) {
        vscode.window.showWarningMessage('未找到标准自定义算子根目录，请先对包含 build.sh 的根目录执行「标记为算子工程」');
        return;
      }

      // 2. 获取项目信息（项目默认已创建）
      const rootProject = getProjectByPath(rootPath);
      if (!rootProject) {
        vscode.window.showErrorMessage('未找到项目信息');
        return;
      }

      // 3. 检查选中的目录是否为算子文件（包含CMakeLists.txt）
      if (!isStandardCustomSubOperator(folderPath)) {
        vscode.window.showWarningMessage('该目录不是算子文件（不包含 CMakeLists.txt）');
        return;
      }

      // 4. 判断是否在experimental目录下
      const normalizedFolderPath = path.normalize(folderPath).replace(/\\/g, '/').toLowerCase();
      const normalizedRootPath = path.normalize(rootPath).replace(/\\/g, '/').toLowerCase();
      const relativePath = normalizedFolderPath.replace(normalizedRootPath, '').replace(/^[/\\]/, '');
      const isExperimental = relativePath.toLowerCase().startsWith('experimental/');

      // 5. 获取当前项目信息
      const currentOpsList = rootProject.ops_list || [];
      const currentExperimentalOpsList = rootProject.experimental_ops_list || [];
      const operatorName = path.basename(folderPath);

      // 6. 检查是否已存在
      const targetList = isExperimental ? currentExperimentalOpsList : currentOpsList;
      const existing = targetList.find((op) => op.path === folderPath || op.name === operatorName);
      if (existing) {
        vscode.window.showInformationMessage('该算子已标记');
        return;
      }

      // 7. 检查编译状态
      const buildDir = path.join(folderPath, 'build');
      const outDir = path.join(folderPath, 'out');
      const isCompiled = fs.existsSync(buildDir) || fs.existsSync(outDir);

      // 8. 创建算子信息
      const operatorInfo: SubOperatorInfo = {
        name: operatorName,
        path: folderPath,
        isCompiled,
      };

      // 9. 添加到对应的列表
      if (isExperimental) {
        currentExperimentalOpsList.push(operatorInfo);
      } else {
        currentOpsList.push(operatorInfo);
      }

      // 10. 更新项目信息（保持ops_meet不变）
      await updateStandardCustomOperators(
        rootPath,
        rootProject.ops_meet || [],
        currentOpsList,
        currentExperimentalOpsList,
      );

      // 11. 更新文件夹图标装饰
      const ctx = (globalThis as unknown as { extensionContext: vscode.ExtensionContext })
        .extensionContext;
      if (ctx) {
        OperatorProjectIconTheme.getInstance(ctx).fireDecorationUpdate(uri);
      }

      vscode.window.showInformationMessage(`已标记为算子: ${operatorName}`);
    } catch (error) {
      vscode.window.showErrorMessage(
        `标记为算子失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 标记文件夹为算子工程集合
   * 不再为算子集合或子算子在 projects 中新建项目；只从根目录全量扫描，更新根项目的 ops_meet、ops_list、experimental_ops_list。
   */
  static async markAsMultiOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;

    try {
      // 1. 找到根目录（标准自定义算子）
      const rootPath = findStandardCustomRoot(folderPath);
      if (!rootPath) {
        vscode.window.showWarningMessage('未找到标准自定义算子根目录，请先对包含 build.sh 的根目录执行「标记为算子工程」');
        return;
      }

      // 2. 获取项目信息（项目默认已创建）
      const rootProject = getProjectByPath(rootPath);
      if (!rootProject) {
        vscode.window.showErrorMessage('未找到项目信息');
        return;
      }

      // 3. 判断选中的目录是否为算子合集（在白名单中）
      const normalizedFolderPath = path.normalize(folderPath).replace(/\\/g, '/').toLowerCase();
      const normalizedRootPath = path.normalize(rootPath).replace(/\\/g, '/').toLowerCase();
      const relativePath = normalizedFolderPath.replace(normalizedRootPath, '').replace(/^[/\\]/, '');

      let collectionName: string;
      let collectionPath: string;
      let isExperimental: boolean;

      // 判断是根目录下的算子合集还是experimental目录下的算子合集
      if (relativePath.toLowerCase().startsWith('experimental/')) {
        // experimental目录下的算子合集
        const parts = relativePath.split('/');
        if (parts.length < 2) {
          vscode.window.showWarningMessage('该目录不是有效的算子合集');
          return;
        }
        collectionName = parts[1];
        collectionPath = folderPath;
        isExperimental = true;

        // 检查是否在experimental算子合集白名单中
        if (!EXPERIMENTAL_OPERATOR_COLLECTIONS.has(collectionName)) {
          vscode.window.showWarningMessage(`该目录不在experimental算子合集白名单中: ${collectionName}`);
          return;
        }
      } else {
        // 根目录下的算子合集
        collectionName = path.basename(folderPath);
        collectionPath = folderPath;
        isExperimental = false;

        // 检查是否在根目录算子合集白名单中
        if (!ROOT_OPERATOR_COLLECTIONS.has(collectionName)) {
          vscode.window.showWarningMessage(`该目录不在算子合集白名单中: ${collectionName}`);
          return;
        }
      }

      // 4. 扫描该目录下的算子
      const operators: SubOperatorInfo[] = [];
      let hasOperators = false;

      try {
        const subEntries = fs.readdirSync(collectionPath, { withFileTypes: true });

        for (const subEntry of subEntries) {
          if (!subEntry.isDirectory() || subEntry.name.startsWith('.')) {
            continue;
          }

          const operatorPath = path.join(collectionPath, subEntry.name);
          const operatorCmakeListsPath = path.join(operatorPath, 'CMakeLists.txt');

          if (!fs.existsSync(operatorCmakeListsPath)) {
            continue;
          }

          hasOperators = true;
          const buildDir = path.join(operatorPath, 'build');
          const outDir = path.join(operatorPath, 'out');
          const isCompiled = fs.existsSync(buildDir) || fs.existsSync(outDir);
          const operatorInfo: SubOperatorInfo = {
            name: subEntry.name,
            path: operatorPath,
            isCompiled,
          };

          operators.push(operatorInfo);
        }
      } catch {
        // 忽略扫描失败
      }

      if (!hasOperators) {
        vscode.window.showWarningMessage('该目录下没有找到算子（不包含 CMakeLists.txt 的子目录）');
        return;
      }

      // 5. 获取当前项目信息
      const currentOpsMeet = rootProject.ops_meet || [];
      const currentOpsList = rootProject.ops_list || [];
      const currentExperimentalOpsList = rootProject.experimental_ops_list || [];

      // 6. 检查算子合集是否已存在
      const meetName = isExperimental ? `experimental/${collectionName}` : collectionName;
      const existingMeet = currentOpsMeet.find((m) => m.path === collectionPath || m.name === meetName);
      if (existingMeet) {
        vscode.window.showInformationMessage('该算子合集已标记');
        return;
      }

      // 7. 添加到算子合集列表
      currentOpsMeet.push({
        name: meetName,
        path: collectionPath,
      });

      // 8. 添加算子到对应的列表（保留已有算子的编译状态）
      const updatedOpsList = [...currentOpsList];
      const updatedExperimentalOpsList = [...currentExperimentalOpsList];

      operators.forEach((op) => {
        const targetList = isExperimental ? updatedExperimentalOpsList : updatedOpsList;
        const existing = targetList.find((existingOp) => existingOp.path === op.path || existingOp.name === op.name);
        if (!existing) {
          targetList.push(op);
        } else {
          // 保留已有算子的编译状态
          if (existing.isCompiled) {
            op.isCompiled = true;
          }
          // 更新路径（如果路径变化）
          const index = targetList.indexOf(existing);
          targetList[index] = op;
        }
      });

      // 9. 更新项目信息
      await updateStandardCustomOperators(
        rootPath,
        currentOpsMeet,
        updatedOpsList,
        updatedExperimentalOpsList,
      );

      // 10. 更新文件夹图标装饰
      const ctx = (globalThis as unknown as { extensionContext: vscode.ExtensionContext })
        .extensionContext;
      if (ctx) {
        const urisToUpdate: vscode.Uri[] = [uri];
        operators.forEach((op) => {
          if (op.path) {
            urisToUpdate.push(vscode.Uri.file(op.path));
          }
        });
        OperatorProjectIconTheme.getInstance(ctx).fireDecorationUpdate(urisToUpdate);
      }

      vscode.window.showInformationMessage(
        `已标记为算子合集: ${meetName}（包含 ${operators.length} 个算子）`,
      );
    } catch (error) {
      vscode.window.showErrorMessage(
        `标记为算子合集失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 取消标记为算子工程
   */
  static async unmarkAsOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;

    try {
      // 1. 找到根目录（标准自定义算子）
      const rootPath = findStandardCustomRoot(folderPath);
      if (!rootPath) {
        vscode.window.showWarningMessage('未找到标准自定义算子根目录');
        return;
      }

      // 2. 校验根目录是否为标准自定义算子
      if (!isStandardCustomRoot(rootPath)) {
        vscode.window.showWarningMessage('根目录不是标准自定义算子');
        return;
      }

      // 3. 获取项目信息（项目默认已创建）
      const rootProject = getProjectByPath(rootPath);
      if (!rootProject) {
        vscode.window.showErrorMessage('未找到项目信息');
        return;
      }

      // 4. 检查该目录是否被标记为算子
      const currentOpsList = rootProject.ops_list || [];
      const currentExperimentalOpsList = rootProject.experimental_ops_list || [];
      const operatorName = path.basename(folderPath);

      // 在ops_list中查找
      const opsListIndex = currentOpsList.findIndex(
        (op) => op.path === folderPath || op.name === operatorName,
      );
      // 在experimental_ops_list中查找
      const experimentalOpsListIndex = currentExperimentalOpsList.findIndex(
        (op) => op.path === folderPath || op.name === operatorName,
      );

      if (opsListIndex === -1 && experimentalOpsListIndex === -1) {
        vscode.window.showInformationMessage('该目录未被标记为算子');
        return;
      }

      // 5. 从对应的列表中移除
      if (opsListIndex !== -1) {
        currentOpsList.splice(opsListIndex, 1);
      }

      if (experimentalOpsListIndex !== -1) {
        currentExperimentalOpsList.splice(experimentalOpsListIndex, 1);
      }

      // 6. 更新项目信息（保持ops_meet不变）
      await updateStandardCustomOperators(
        rootPath,
        rootProject.ops_meet || [],
        currentOpsList,
        currentExperimentalOpsList,
      );

      // 7. 更新文件夹图标装饰
      const ctx = (globalThis as unknown as { extensionContext: vscode.ExtensionContext })
        .extensionContext;
      if (ctx) {
        OperatorProjectIconTheme.getInstance(ctx).fireDecorationUpdate(uri);
      }

      vscode.window.showInformationMessage(`已取消标记为算子: ${operatorName}`);
    } catch (error) {
      vscode.window.showErrorMessage(
        `取消标记失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 取消标记为算子工程集合
   * 同时取消标记目录下所有已标记为算子的目录
   */
  static async unmarkAsMultiOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;

    try {
      // 1. 找到根目录（标准自定义算子）
      const rootPath = findStandardCustomRoot(folderPath);
      if (!rootPath) {
        vscode.window.showWarningMessage('未找到标准自定义算子根目录');
        return;
      }

      // 2. 校验根目录是否为标准自定义算子
      if (!isStandardCustomRoot(rootPath)) {
        vscode.window.showWarningMessage('根目录不是标准自定义算子');
        return;
      }

      // 3. 获取项目信息（项目默认已创建）
      const rootProject = getProjectByPath(rootPath);
      if (!rootProject) {
        vscode.window.showErrorMessage('未找到项目信息');
        return;
      }

      // 4. 检查该目录是否被标记为算子合集
      const currentOpsMeet = rootProject.ops_meet || [];
      const meetIndex = currentOpsMeet.findIndex((m) => m.path === folderPath);

      if (meetIndex === -1) {
        vscode.window.showInformationMessage('该目录未被标记为算子合集');
        return;
      }

      const meetInfo = currentOpsMeet[meetIndex];
      const normalizedFolderPath = path.normalize(folderPath)
        .replace(/\\/g, '/')
        .toLowerCase();

      // 5. 从算子合集列表中移除
      currentOpsMeet.splice(meetIndex, 1);

      // 6. 移除该合集下的所有算子
      const currentOpsList = rootProject.ops_list || [];
      const currentExperimentalOpsList = rootProject.experimental_ops_list || [];

      // 过滤掉该合集下的算子
      const updatedOpsList = currentOpsList.filter((op) => {
        const normalizedOpPath = path.normalize(op.path)
          .replace(/\\/g, '/')
          .toLowerCase();

        return !normalizedOpPath.startsWith(normalizedFolderPath + '/');
      });

      const updatedExperimentalOpsList = currentExperimentalOpsList.filter((op) => {
        const normalizedOpPath = path.normalize(op.path)
          .replace(/\\/g, '/')
          .toLowerCase();

        return !normalizedOpPath.startsWith(normalizedFolderPath + '/');
      });

      // 7. 更新项目信息
      await updateStandardCustomOperators(
        rootPath,
        currentOpsMeet,
        updatedOpsList,
        updatedExperimentalOpsList,
      );

      // 8. 更新文件夹图标装饰
      const ctx = (globalThis as unknown as { extensionContext: vscode.ExtensionContext })
        .extensionContext;
      if (ctx) {
        OperatorProjectIconTheme.getInstance(ctx).fireDecorationUpdate(uri);
      }

      vscode.window.showInformationMessage(`已取消标记为算子合集: ${meetInfo.name}`);
    } catch (error) {
      vscode.window.showErrorMessage(
        `取消标记失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 编译部署算子工程（运行验证）
   * 1. 如果选中的是文件夹，且当前项目根目录是标准自定义算子，则执行编译example操作
   * 2. 如果选中的是 .py 文件，且当前项目根目录是 pyasc 算子，则执行 pyasc 相关操作（暂时留空）
   * 3. 其他情况提示用户
   * @param uri 右键目标（文件夹或文件）
   */
  static async buildOperatorProject(uri: vscode.Uri): Promise<void> {
    // 获取当前打开工程的根目录
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage('未打开工作区，无法运行验证');
      return;
    }
    const workspaceRootPath = workspaceFolders[0].uri.fsPath;

    // 判断当前选中的是文件夹还是文件
    let isFolder = false;
    let isPyFile = false;
    try {
      const stat = fs.statSync(uri.fsPath);
      isFolder = stat.isDirectory();
      if (!isFolder) {
        isPyFile = uri.fsPath.endsWith('.py');
      }
    } catch {
      isFolder = false;
      isPyFile = false;
    }

    // 判断当前项目的根目录是否为标准自定义算子或 pyasc 算子
    // 使用 OperatorProjectDetector.detectOperatorProject 来判断
    const rootDetection = await OperatorProjectDetector.detectOperatorProject(workspaceRootPath);
    const isStandardCustom = rootDetection.isOperatorProject
      && rootDetection.projectType === OperatorProjectType.STANDARD_CUSTOM;
    const isPyasc = rootDetection.isOperatorProject
      && rootDetection.projectType === OperatorProjectType.PYASC;

    // 情况1: 选中的是文件夹，且当前项目根目录是标准自定义算子
    if (isFolder && isStandardCustom) {
      // 获取用户选中的文件夹名称作为 operatorNames
      const operatorNames = path.basename(uri.fsPath);

      // 判断是否在experimental目录下
      const normalizedUriPath = path.normalize(uri.fsPath).replace(/\\/g, '/').toLowerCase();
      const normalizedRootPath = path.normalize(workspaceRootPath).replace(/\\/g, '/').toLowerCase();
      const relativePath = normalizedUriPath.replace(normalizedRootPath, '').replace(/^[/\\]/, '');
      const isExperimental = relativePath.toLowerCase().startsWith('experimental/');

      // 从根目录找到对应的 projectId
      let projectId: number | undefined;
      const containingProject = getContainingStandardCustomProject(uri.fsPath);
      if (containingProject) {
        projectId = containingProject.id;
      } else {
        // 如果找不到包含的项目，尝试直接通过根目录查找
        const rootProject = getProjectByPath(workspaceRootPath);
        if (rootProject) {
          projectId = rootProject.id;
        }
      }

      if (!projectId) {
        vscode.window.showErrorMessage('未找到对应的项目ID，请先标记为算子工程');
        return;
      }

      // 如果在experimental目录下，添加 --experimental 参数
      const compileOption = isExperimental ? '--experimental' : undefined;

      // 调用 startBuild，传入 operatorNames、operatorType、projectId 和 compileOption
      await buildService.startBuild({
        operatorNames,
        operatorType: 'standard-custom',
        projectId,
        compileOption,
      });
      return;
    }

    // 情况2: 选中的是 .py 文件，且当前项目根目录是 pyasc 算子
    if (isPyFile && isPyasc) {
      // 暂时留空，后续实现 pyasc 相关操作
      console.log('[buildOperatorProject] pyasc 算子运行验证功能暂未实现');
      return;
    }

    // 其他情况：提示用户
    vscode.window.showWarningMessage('该文件/文件夹无算子可运行验证');
  }

  /**
   * 运行验证算子工程
   * 如果是标准自定义算子，则执行编译example的逻辑；其他算子执行运行验证的现有逻辑
   */
  static async runOperatorProject(uri: vscode.Uri): Promise<void> {
    // 获取当前打开工程的根目录
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage('未打开工作区，无法运行验证');
      return;
    }
    const workspaceRootPath = workspaceFolders[0].uri.fsPath;

    // 判断当前选中的是文件夹还是文件
    let isFolder = false;
    let isPyFile = false;
    try {
      const stat = fs.statSync(uri.fsPath);
      isFolder = stat.isDirectory();
      if (!isFolder) {
        isPyFile = uri.fsPath.endsWith('.py');
      }
    } catch {
      isFolder = false;
      isPyFile = false;
    }

    // 判断当前项目的根目录是否为标准自定义算子或 pyasc 算子
    // 使用 OperatorProjectDetector.detectOperatorProject 来判断
    const rootDetection = await OperatorProjectDetector.detectOperatorProject(workspaceRootPath);
    const isStandardCustom = rootDetection.isOperatorProject
      && rootDetection.projectType === OperatorProjectType.STANDARD_CUSTOM;
    const isPyasc = rootDetection.isOperatorProject
      && rootDetection.projectType === OperatorProjectType.PYASC;

    // 情况1: 选中的是文件夹，且当前项目根目录是标准自定义算子
    if (isFolder && isStandardCustom) {
      // 参考 app.vue 运行验证逻辑：operatorNames 为选中的文件夹名，projectId 从根目录在 projects.json 中查找
      const project = getProjectByPath(workspaceRootPath);
      if (!project) {
        vscode.window.showErrorMessage('根目录未在 projects.json 中注册，无法运行验证');
        return;
      }

      // 判断是否在experimental目录下
      const normalizedUriPath = path.normalize(uri.fsPath).replace(/\\/g, '/').toLowerCase();
      const normalizedRootPath = path.normalize(workspaceRootPath).replace(/\\/g, '/').toLowerCase();
      const relativePath = normalizedUriPath.replace(normalizedRootPath, '').replace(/^[/\\]/, '');
      const isExperimental = relativePath.toLowerCase().startsWith('experimental/');

      const operatorNames = path.basename(uri.fsPath);
      const operatorType = 'standard-custom';

      // 如果在experimental目录下，添加 --experimental 参数
      const compileOption = isExperimental ? '--experimental' : undefined;

      await taskMethods.startBuildExample({
        operatorNames,
        operatorType,
        projectId: project.id,
        compileOption,
      });
      return;
    }

    // 情况2: 当前项目根目录是 pyasc 算子
    if (isPyasc) {
      // 如果选择了 .py 文件，更新配置的 target_file
      if (isPyFile) {
        try {
          // 获取 build_op 配置
          const configId = await buildService.getBuildConfigId();
          if (configId) {
            const config = getConfigById(configId);
            if (config) {
              // 获取项目信息
              const project = getProjectByPath(workspaceRootPath);
              if (project) {
                // 获取算子信息以获取运行路径
                const operator = getOpByProjectIdAndOpName(project.id, config.op);
                const runPath = operator?.op_path || project.project_path;
                
                // 计算选择的文件相对于运行路径的相对路径
                const selectedFilePath = uri.fsPath;
                const relativePath = path.relative(runPath, selectedFilePath);
                // 将路径分隔符统一为 /，并确保以 ./ 开头（如果不在根目录）
                const normalizedRelativePath = relativePath.replace(/\\/g, '/');
                const targetPath = normalizedRelativePath.startsWith('.') 
                  ? normalizedRelativePath 
                  : `./${normalizedRelativePath}`;
                
                // 更新 target_file 为 python3 ${相对路径}
                const newTargetFile = `python3 ${targetPath}`;
                
                // 更新配置
                const userOptions = config.user_options as any || {};
                await postConfig('build_op', [{
                  config_id: configId,
                  project_id: project.id,
                  user_options: {
                    ...userOptions,
                    target_file: newTargetFile,
                  },
                }]);
              }
            }
          }
        } catch (error) {
          console.error('[runOperatorProject] 更新配置失败:', error);
          // 即使更新配置失败，也继续执行运行
        }
      }
      
      await taskMethods.startRun();
      return;
    }

    // 其他情况：提示用户
    vscode.window.showWarningMessage('该文件/文件夹无算子可运行验证');
  }

  /**
   * CPU调试算子工程
   */
  static async cpuDebugOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;
    const project = getProjectByPath(folderPath);

    // 检查是否是算子工程
    if (!project) {
      vscode.window.showWarningMessage('该文件夹不是算子工程');
      return;
    }

    await this.switchToProject(uri, async () => {
      // 调用CPU调试，与看板逻辑保持一致
      await taskMethods.runCpuDebug();
    });
  }

  /**
   * NPU调试算子工程
   */
  static async npuDebugOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;
    const project = getProjectByPath(folderPath);

    // 检查是否是算子工程
    if (!project) {
      vscode.window.showWarningMessage('该文件夹不是算子工程');
      return;
    }

    await this.switchToProject(uri, async () => {
      // 调用NPU调试，与看板逻辑保持一致
      await taskMethods.runDebug();
    });
  }

  /**
   * CPU调试配置算子工程
   */
  static async cpuDebugConfigOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;
    const project = getProjectByPath(folderPath);

    // 检查是否是算子工程
    if (!project) {
      vscode.window.showWarningMessage('该文件夹不是算子工程');
      return;
    }

    await this.switchToProject(uri, async () => {
      // 调用CPU调试配置，与看板逻辑保持一致
      await taskMethods.cpuDebugConfig();
    });
  }

  /**
   * NPU调试配置算子工程
   */
  static async npuDebugConfigOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;
    const project = getProjectByPath(folderPath);

    // 检查是否是算子工程
    if (!project) {
      vscode.window.showWarningMessage('该文件夹不是算子工程');
      return;
    }

    await this.switchToProject(uri, async () => {
      // 调用NPU调试配置，与看板逻辑保持一致
      await taskMethods.debugConfig();
    });
  }

  /**
   * 异常检测
   */
  static async sanitizerOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;
    const project = getProjectByPath(folderPath);

    // 检查是否支持异常检测与调优（标准自定义算子需要检查 build.sh 是否包含 --bisheng_flags
    const rootPath = findStandardCustomRoot(folderPath);
    if (rootPath) {
      const supportsSanitizerAndTuning = checkSupportsSanitizerAndTuning(rootPath);
      if (!supportsSanitizerAndTuning) {
        vscode.window.showWarningMessage('暂不支持该功能，请确保 build.sh 中包含 --bisheng_flags');
        return;
      }
    }

    await this.switchToProject(uri, async () => {
      // 打开异常检测配置，与看板逻辑保持一致
      const sanitizerCommand = 'huawei-op-devtools.sanitizerOptions';
      await vscode.commands.executeCommand(sanitizerCommand);
    });
  }

  /**
   * 上板分析
   */
  static async onBoardOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;
    const project = getProjectByPath(folderPath);


    // 检查是否支持异常检测与调优（标准自定义算子需要检查 build.sh 是否包含 --bisheng_flags）
    const rootPath = findStandardCustomRoot(folderPath);
    if (rootPath) {
      const supportsSanitizerAndTuning = checkSupportsSanitizerAndTuning(rootPath);
      if (!supportsSanitizerAndTuning) {
        vscode.window.showWarningMessage('暂不支持该功能，请确保 build.sh 中包含 --bisheng_flags');
        return;
      }
    }

    await this.switchToProject(uri, async () => {
      // 打开上板分析配置，与看板逻辑保持一致
      const onBoardCommand = 'huawei-op-devtools.onBoardOptions';
      await vscode.commands.executeCommand(onBoardCommand);
    });
  }

  /**
   * 仿真分析
   */
  static async simulationOperatorProject(uri: vscode.Uri): Promise<void> {
    const folderPath = uri.fsPath;
    const project = getProjectByPath(folderPath);

    // 检查是否支持异常检测与调优（标准自定义算子需要检查 build.sh 是否包含 --bisheng_flags）
    const rootPath = findStandardCustomRoot(folderPath);
    if (rootPath) {
      const supportsSanitizerAndTuning = checkSupportsSanitizerAndTuning(rootPath);
      if (!supportsSanitizerAndTuning) {
        vscode.window.showWarningMessage('暂不支持该功能，请确保 build.sh 中包含 --bisheng_flags');
        return;
      }
    }

    await this.switchToProject(uri, async () => {
      // 打开仿真分析配置，与看板逻辑保持一致
      const simulationCommand = 'huawei-op-devtools.simulatorOptions';
      await vscode.commands.executeCommand(simulationCommand);
    });
  }

  /**
   * 切换到指定项目并执行操作
   */
  private static async switchToProject(
    uri: vscode.Uri,
    action: () => Promise<void>,
  ): Promise<void> {
    const folderPath = uri.fsPath;
    const project = getProjectByPath(folderPath);

    if (!project) {
      vscode.window.showErrorMessage('该文件夹不是算子工程');
      return;
    }

    try {
      // 设置 ProjectManager 的项目信息
      const pm = ProjectManager.getInstance();
      pm['_projectId'] = String(project.id);
      pm['_projectName'] = project.project_name;
      pm['_projectPath'] = project.project_path;

      // 执行操作
      await action();
    } catch (error) {
      vscode.window.showErrorMessage(
        `操作失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 检查文件夹是否为算子工程
   */
  static async checkIsOperatorProject(uri: vscode.Uri): Promise<{
    isOperatorProject: boolean;
    isMultiProject: boolean;
    projectType?: string;
  }> {
    const folderPath = uri.fsPath;
    const project = getProjectByPath(folderPath);

    if (!project) {
      return {
        isOperatorProject: false,
        isMultiProject: false,
      };
    }

    return {
      isOperatorProject: true,
      isMultiProject: false,
      projectType: project.project_type || undefined,
    };
  }

  /**
   * 初始化算子工程配置
   * @param detection 算子工程检测结果
   * @param projectId 项目ID
   * @param skipVscodeFiles 是否跳过创建 .vscode 和 .arts 文件（默认 false）
   */
  private static async initializeOperatorProject(
    detection: OperatorProjectDetectionResult,
    projectId: number,
    skipVscodeFiles: boolean = false,
  ): Promise<void> {
    if (!detection.isOperatorProject || !detection.projectType) {
      return;
    }

    try {
      const context = (globalThis as unknown as { extensionContext: vscode.ExtensionContext })
        .extensionContext;

      if (!context) {
        return;
      }

      // 根据算子工程类型确定模板名称和类型
      let templateName: string | undefined;
      let opType: string = 'ascend';

      switch (detection.projectType) {
        case OperatorProjectType.ASCEND_C:
          templateName = 'hello_world';
          opType = 'ascend';
          break;
        case OperatorProjectType.TORCH_LIBRARY:
          templateName = 'torch_library_template';
          opType = 'ascend';
          break;
        case OperatorProjectType.PYASC:
          // pyasc算子工程，使用 pyasc_temple 模板
          templateName = 'pyasc_temple';
          opType = 'pyasc';
          console.log(`[FolderContextMenuService] PYASC类型，使用 pyasc_temple 模板`);
          break;
        case OperatorProjectType.STANDARD_CUSTOM:
          opType = 'cann';
          // 标准自定义算子不需要模板
          break;
        default:
          return;
      }

      // 调用 generateStructure 初始化配置
      // 对于标准自定义算子，如果没有模板，跳过模板解压，只创建配置
      const isSkipUnZip = detection.projectType === OperatorProjectType.STANDARD_CUSTOM && !templateName;
      await generateStructure(
        {
          project_id: projectId,
          op_type: opType,
          op_name: detection.projectName,
          template_name: templateName,
          op_path: detection.projectPath,
          skipExisting: true, // 不覆盖已有文件
        } as any,
        context.extensionPath,
        isSkipUnZip, // 标准自定义算子且无模板时，跳过模板解压
        skipVscodeFiles, // 是否跳过创建 .vscode 和 .arts 文件
      );

      // 验证配置是否创建成功
      const ops = getOpsByProjectId(projectId);
      const buildOpConfigs = getConfig(projectId, 'build_op');
    } catch (error) {
      // 初始化失败不应该阻止标记操作，只记录错误
    }
  }

  /**
   * 将文件/文件夹添加到配置的fileMapList
   * @param uri 文件或文件夹URI
   * @param configType 配置类型：'sanitizer' | 'on_board' | 'simulate'
   */
  static async addReportToFileMapList(uri: vscode.Uri, configType: 'sanitizer' | 'on_board' | 'simulate'): Promise<void> {
    try {
      const filePath = uri.fsPath;
      const stat = await vscode.workspace.fs.stat(uri);
      const isFile = stat.type === vscode.FileType.File;
      const isDirectory = stat.type === vscode.FileType.Directory;

      // 异常检测只支持文件
      if (configType === 'sanitizer' && !isFile) {
        vscode.window.showErrorMessage('异常检测只支持文件，请选择文件');
        return;
      }

      // 上板分析和仿真分析支持文件夹
      if ((configType === 'on_board' || configType === 'simulate') && !isDirectory && !isFile) {
        vscode.window.showErrorMessage('请选择文件或文件夹');
        return;
      }

      await ProjectManager.getInstance().initProject();
      const projectId = ProjectManager.getInstance().projectId;
      if (!projectId) {
        vscode.window.showErrorMessage('未找到项目ID');
        return;
      }

      // 获取配置
      const configs = getConfig(Number(projectId), configType);
      if (configs.length === 0) {
        vscode.window.showErrorMessage(`未找到${configType === 'sanitizer' ? '异常检测' : configType === 'on_board' ? '上板分析' : '仿真分析'}配置`);
        return;
      }

      // 使用第一个配置
      const config = configs[0];
      const userOptions = (config.user_options as Record<string, unknown>) || {};
      const fileMapList = (userOptions.fileMapList as Array<{ filePath: string; reportTime: number }>) || [];

      // 检查是否已存在
      const exists = fileMapList.some(item => item.filePath === filePath);
      if (exists) {
        vscode.window.showInformationMessage('该文件/文件夹已存在于配置中');
        return;
      }

      // 添加新的文件映射
      const newFileMap = {
        filePath,
        reportTime: Date.now(),
      };
      fileMapList.push(newFileMap);

      // 更新配置
      const updatedUserOptions = {
        ...userOptions,
        fileMapList,
      };

      await postConfig(configType, [{
        config_id: config.config_id,
        project_id: config.project_id,
        user_options: updatedUserOptions,
      }]);

      vscode.window.showInformationMessage('已添加到报告可视化列表');

      // 刷新对应的面板
      try {
        if (configType === 'sanitizer') {
          // 刷新异常检测面板
          await vscode.commands.executeCommand(COMMAND_FLASH_MS_SANITIZER_RUN_DATA);
        }
        else if (configType === 'on_board' || configType === 'simulate') {
          // 刷新性能调优面板
          await vscode.commands.executeCommand(COMMAND_FLASH_PERFORMANCE_RUN_DATA);
        }
      }
      catch (refreshError) {
        console.error('刷新面板失败:', refreshError);
        // 不显示错误，因为配置已经成功添加
      }
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`添加失败: ${errorMessage}`);
      console.error('addReportToFileMapList error:', error);
    }
  }

}
