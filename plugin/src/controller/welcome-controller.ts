import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { CommandExecutor } from '@plugin/class/command-options';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { projectService } from '@plugin/service/project-service';
import {
  CreateOpsParams,
  CreateOpsByPrototypeParams,
  CreatedProjectParams,
  OpenProjectParams
} from '@shared/api-types';
import {
  generateStructure
} from '@plugin/domain';
import { viewIdToProjectType } from '../domain/utils/project-utils'
import {
  OperatorProjectDetector,
  OperatorProjectType,
} from '@plugin/domain/services/operator-project-detector';
import { 
  getProjectByPath,
  updateStandardCustomOperators,
  type SubOperatorInfo,
  type OperatorCollectionInfo,
} from '@plugin/domain/models/project-model';

// 辅助函数：获取 extension context
function getExtensionContext(): vscode.ExtensionContext {
  return (globalThis as unknown as { extensionContext: vscode.ExtensionContext })
    .extensionContext;
}

export const welcomeMethods = {
  /**
   * 创建算子工程
   * @param params - 参数
   * @returns 结果
   */
  async createOps(params: CreateOpsParams): Promise<string> {
    await ProjectManager.getInstance()
      .initProject();

    return await projectService.createOps(params);
  },

  /**
   * 通过原型创建算子
   * @param params - 参数
   */
  async createOpsByPrototype(params: CreateOpsByPrototypeParams): Promise<void> {
    await ProjectManager.getInstance()
      .initProject();
    await projectService.createOpsByPrototype(params);
  },

  /**
   * 创建项目 (webview/createdProject)
   * @param params - 参数
   */
  async createdProject(params: CreatedProjectParams): Promise<void> {
    try {
      const context = getExtensionContext();
      // 缓存 projectPath 到 globalState
      const originalProjectPath = params.projectPath;

      context.globalState.update('lastProjectPath', originalProjectPath);

      vscode.window.showInformationMessage('初始化中');

      const executor = new CommandExecutor();

      try {
        // 使用 fs.mkdirSync 创建目录（跨平台兼容）
        const projectDir = path.join(params.projectPath, params.projectName);

        if (!fs.existsSync(projectDir)) {
          fs.mkdirSync(projectDir, { recursive: true });
        }
      }
      catch (error) {
        throw new Error(`创建工程目录失败: ${error instanceof Error ? error.message : String(error)}`);
      }

      if (params.projectSH) {
        try {
          await executor.execute(`chmod +x ${params.projectSH}`);
          await executor.execute(`${params.projectSH}`);
        }
        catch (error) {
          console.warn(`执行环境变量脚本失败: ${error instanceof Error ? error.message : String(error)}`);
          // 环境变量脚本执行失败不影响项目创建，只记录警告
        }
      }

      // 调用 projectService.init (对应旧代码的 OpsAPI.init)
      try {
        await projectService.init({
          ascendEnvScript: params.projectSH,
          projectPath: params.projectPath,
          projectName: params.projectName,
          templateName: params.templateName,
          projectType: viewIdToProjectType(params.createOperatorProjectDictoryFileType)
        });
      }
      catch (error) {
        throw new Error(`初始化算子工程失败: ${error instanceof Error ? error.message : String(error)}`);
      }

      try {
        await vscode.commands.executeCommand(
          'revealInExplorer',
          vscode.Uri.file(`${params.projectPath}/${params.projectName}`),
        );
      }
      catch (error) {
        console.warn(`在资源管理器中显示失败: ${error instanceof Error ? error.message : String(error)}`);
        // 这个失败不影响项目创建，只记录警告
      }

      // 规范化路径
      const normalizedProjectPath = path.normalize(params.projectPath);
      const normalizedProjectName = path.normalize(params.projectName);
      const fullProjectPath = path.join(
        normalizedProjectPath,
        normalizedProjectName,
      );

      // 在远程环境中，我们可以直接打开本地路径（相对于远程系统）
      const localUri = vscode.Uri.file(fullProjectPath);

      console.log('vscode.openFolder，打开新目录', localUri);

      // 显示创建成功消息
      vscode.window.showInformationMessage(`算子工程创建成功: ${params.projectName}`);

      // 保存 templateName 到 globalState，以便后续使用
      if (params.templateName) {
        context.globalState.update('templateName', params.templateName);
      }

      // 执行创建算子文件命令
      console.log('createdProject: 准备执行创建算子文件命令');
      console.log('createdProject: createOperatorProjectDictoryFileType:', params.createOperatorProjectDictoryFileType);
      console.log('createdProject: templateName:', params.templateName);

      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: '开始创建算子文件...',
            cancellable: false,
          },
          async (progress) => {
            progress.report({
              increment: 0,
              message: '准备创建算子文件...',
            });
            console.log('createdProject: 执行命令 huawei-op-devtools.createDictory');
            console.log('createdProject: 命令参数:', { createOperatorProjectDirectoryFileType: params.createOperatorProjectDictoryFileType });
            const result = await vscode.commands.executeCommand(
              'huawei-op-devtools.createDictory',
              {
                createOperatorProjectDirectoryFileType:
                  params.createOperatorProjectDictoryFileType,
              },
              progress,
            );

            console.log('createdProject: 命令执行完成，结果:', result);
          },
        );
        console.log('createdProject: 创建算子文件命令执行成功');
      }
      catch (error) {
        console.error('createdProject: 执行创建算子文件命令失败:', error);
        console.error('createdProject: 错误详情:', error instanceof Error ? error.stack : String(error));
        // 即使创建算子文件失败，项目目录已经创建成功
        vscode.window.showWarningMessage(`算子工程目录已创建，但创建算子文件时出错: ${error instanceof Error ? error.message : String(error)}`);
      }

      // 询问用户是在当前窗口打开还是新窗口打开
      const choice = await vscode.window.showInformationMessage(
        '选择打开方式',
        { modal: true },
        '当前窗口',
        '新窗口',
      );

      // 如果用户取消了选择，则不执行打开操作，但已经创建成功
      if (!choice) {
        return;
      }

      const forceNewWindow = choice === '新窗口';

      // 打开文件夹
      try {
        await vscode.commands.executeCommand('vscode.openFolder', localUri, { forceNewWindow: forceNewWindow });
        vscode.window.showInformationMessage('打开算子工程目录成功');
      }
      catch (e) {
        vscode.window.showErrorMessage(`打开算子工程目录失败: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      vscode.window.showErrorMessage(`创建算子工程失败: ${errorMessage}`);
      throw error; // 重新抛出错误，让 API 服务器能够捕获并返回给前端
    }
  },

  /**
   * 打开算子工程 (webview/openProject)
   * @param params - 参数
   */
  async openProject(params: OpenProjectParams): Promise<void> {
    try {
      // 首先检查项目是否已在用户的配置数据中
      const existingProject = getProjectByPath(params.projectPath);

      if (existingProject) {
        console.log(`[openProject] 项目已在配置中: ${existingProject.project_name} (${existingProject.project_path})`);

        // 如果是标准自定义算子，触发工作区检测服务来更新算子信息
        if (existingProject.project_type === OperatorProjectType.STANDARD_CUSTOM) {
          try {
            const { WorkspaceDetectorService } = await import('../service/workspace-detector-service.js');

            await WorkspaceDetectorService.detectAndRegisterWorkspace(params.projectPath)
              .catch((error) => {
                console.warn(`[openProject] 检测并更新算子信息失败: ${error instanceof Error ? error.message : String(error)}`);
              });
          }
          catch (error) {
            console.warn(`[openProject] 导入工作区检测服务失败: ${error instanceof Error ? error.message : String(error)}`);
          }
        }

        // 如果项目已存在，直接打开目录
        const localUri = vscode.Uri.file(params.projectPath);

        // 询问用户是在当前窗口打开还是新窗口打开
        const choice = await vscode.window.showInformationMessage(
          '选择打开方式',
          { modal: true },
          '当前窗口',
          '新窗口',
        );

        // 如果用户取消了选择，则不执行打开操作
        if (!choice) {
          return;
        }

        const forceNewWindow = choice === '新窗口';

        // 打开文件夹
        try {
          await vscode.commands.executeCommand('vscode.openFolder', localUri, { forceNewWindow: forceNewWindow });
          vscode.window.showInformationMessage('打开算子工程目录成功');
        }
        catch (e) {
          vscode.window.showErrorMessage(`打开算子工程目录失败: ${e instanceof Error ? e.message : String(e)}`);
        }

        return; // 退出函数，不再执行后续初始化操作
      }

      // 如果项目不存在于配置中，继续执行初始化流程
      // 如果没有提供 projectName，从路径中提取
      if (!params.projectName) {
        params.projectName = path.basename(params.projectPath);
        console.log(`[openProject] 未提供项目名称，从路径提取: ${params.projectName}`);

        // 截断 projectPath，移除项目名称部分
        const dirPath = path.dirname(params.projectPath);
        params.projectPath = dirPath;
        console.log(`[openProject] 更新 projectPath (移除项目名称后): ${params.projectPath}`);
      }

      const context = getExtensionContext();

      const executor = new CommandExecutor();

      // 处理环境变量配置脚本
      if (params.projectSH) {
        try {
          await executor.execute(`chmod +x ${params.projectSH}`);
          await executor.execute(`${params.projectSH}`);
        }
        catch (error) {
          console.warn(`执行环境变量脚本失败: ${error instanceof Error ? error.message : String(error)}`);
          // 环境变量脚本执行失败不影响项目创建，只记录警告
        }
      }

      // 检测算子工程类型
      vscode.window.showInformationMessage('正在检测算子工程类型...');
      const projectFullPath = path.join(params.projectPath, params.projectName);
      const rootDetection = await OperatorProjectDetector.detectOperatorProject(projectFullPath);

      // 将配置写入project.json文件
      try {
        await projectService.init({
          ascendEnvScript: params.projectSH,
          projectPath: params.projectPath,
          projectName: params.projectName,
          templateName: '',
          projectType: viewIdToProjectType(rootDetection.projectType)
        });
      }
      catch (error) {
        throw new Error(`初始化算子工程失败: ${error instanceof Error ? error.message : String(error)}`);
      }

      try {
        await vscode.commands.executeCommand(
          'revealInExplorer',
          vscode.Uri.file(projectFullPath),
        );
      }
      catch (error) {
        console.warn(`在资源管理器中显示失败: ${error instanceof Error ? error.message : String(error)}`);
        // 这个失败不影响项目创建，只记录警告
      }

      // 处理配置文件
      const pm = ProjectManager.getInstance();
      const projectId = Number(pm.projectId);
      await generateStructure(
        {
          ops_prototype_file: '',
          project_id: projectId,
          // cann ascend pyasc
          op_type: viewIdToProjectType(rootDetection.projectType),
          template_name: '',
        },
        context.extensionPath,
        true
      );
      await pm.checkVscode();
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

      // 如果是标准自定义算子，检测并存储算子合集和算子
      if (rootDetection.projectType === OperatorProjectType.STANDARD_CUSTOM) {
        try {
          console.log('[openProject] 检测到标准自定义算子，开始扫描算子合集和算子...');
          
          // 1. 扫描第一层目录，找到算子合集（如 common、math、experimental 等）
          const opsMeet: OperatorCollectionInfo[] = [];
          const opsList: SubOperatorInfo[] = [];
          const experimentalOpsList: SubOperatorInfo[] = [];

          const entries = fs.readdirSync(projectFullPath, { withFileTypes: true });
          
          for (const entry of entries) {
            // 只处理目录
            if (!entry.isDirectory()) {
              continue;
            }

            // 跳过隐藏目录和常见非算子工程目录
            const dirName = entry.name;
            if (
              dirName.startsWith('.')
              || dirName === 'node_modules'
              || dirName === 'out'
              || dirName === 'build'
            ) {
              continue;
            }

            const collectionPath = path.join(projectFullPath, dirName);
            
            // 2. 扫描算子合集下的子目录，找到算子（如 abs、add 等）
            let hasOperators = false;
            const isExperimentalCollection = dirName.toLowerCase() === 'experimental';
            
            try {
              const subEntries = fs.readdirSync(collectionPath, { withFileTypes: true });

              for (const subEntry of subEntries) {
                if (!subEntry.isDirectory() || subEntry.name.startsWith('.')) {
                  continue;
                }

                const operatorPath = path.join(collectionPath, subEntry.name);
                
                // 检查是否是算子（有 CMakeLists.txt）
                const operatorCmakeListsPath = path.join(operatorPath, 'CMakeLists.txt');
                if (fs.existsSync(operatorCmakeListsPath)) {
                  hasOperators = true; // 标记这个目录包含算子
                  
                  // 检查是否已编译（检查是否有 build 目录或 out 目录）
                  const buildDir = path.join(operatorPath, 'build');
                  const outDir = path.join(operatorPath, 'out');
                  const isCompiled = fs.existsSync(buildDir) || fs.existsSync(outDir);

                  const operatorInfo: SubOperatorInfo = {
                    name: subEntry.name,
                    path: operatorPath,
                    isCompiled,
                  };

                  if (isExperimentalCollection) {
                    experimentalOpsList.push(operatorInfo);
                  } else {
                    opsList.push(operatorInfo);
                  }
                }
              }
            } catch (error) {
              console.warn(`[openProject] 扫描算子合集 ${dirName} 下的算子失败: ${error instanceof Error ? error.message : String(error)}`);
            }

            // 算子合集：只有包含算子的目录才作为算子合集，放到 ops_meet
            if (hasOperators) {
              opsMeet.push({
                name: dirName,
                path: collectionPath,
              });
            }
            }

          // 更新项目的算子信息
          console.log(`[openProject] 准备更新项目算子信息: ${projectFullPath}`);
          console.log(`[openProject] 算子合集列表:`, opsMeet.map(m => m.name));
          console.log(`[openProject] 普通算子列表:`, opsList.map(o => o.name));
          console.log(`[openProject] experimental算子列表:`, experimentalOpsList.map(o => o.name));
          
          await updateStandardCustomOperators(projectFullPath, opsMeet, opsList, experimentalOpsList);
          console.log(`[openProject] 已检测并存储 ${opsMeet.length} 个算子合集, ${opsList.length} 个普通算子, ${experimentalOpsList.length} 个experimental算子`);
        } catch (error) {
          console.warn(`[openProject] 检测算子信息失败: ${error instanceof Error ? error.message : String(error)}`);
          // 不影响主流程，只记录警告
        }
      }

      // 规范化路径
      const normalizedProjectPath = path.normalize(params.projectPath);
      const normalizedProjectName = path.normalize(params.projectName);
      const fullProjectPath = path.join(normalizedProjectPath, normalizedProjectName);
      // 在远程环境中，我们可以直接打开本地路径（相对于远程系统）
      const localUri = vscode.Uri.file(fullProjectPath);

      // 询问用户是在当前窗口打开还是新窗口打开
      const choice = await vscode.window.showInformationMessage(
        '选择打开方式',
        { modal: true },
        '当前窗口',
        '新窗口',
      );

      // 如果用户取消了选择，则不执行打开操作，但已经创建成功
      if (!choice) {
        return;
      }

      const forceNewWindow = choice === '新窗口';

      // 打开文件夹
      try {
        await vscode.commands.executeCommand('vscode.openFolder', localUri, { forceNewWindow: forceNewWindow });
        vscode.window.showInformationMessage('打开算子工程目录成功');
      }
      catch (e) {
        vscode.window.showErrorMessage(`打开算子工程目录失败: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      vscode.window.showErrorMessage(`打开算子工程失败: ${errorMessage}`);
      throw error; // 重新抛出错误，让 API 服务器能够捕获并返回给前端
    }
  }
};
