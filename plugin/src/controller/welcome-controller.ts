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
  generateStructure,
  completeProjectConfigs
} from '@plugin/domain';
import { viewIdToProjectType, ensureLaunchJsonExists } from '../domain/utils/project-utils'
import {
  OperatorProjectDetector,
  OperatorProjectType
} from '@plugin/domain/services/operator-project-detector';
import {
  getProjectByPath,
  updateStandardCustomOperators,
  createProject,
  SubOperatorInfo
} from '@plugin/domain/models/project-model';
import { WorkspaceDetectorService } from '@plugin/service/workspace-detector-service';
import { OpGeneratorFactory } from '@plugin/domain/services/op-generator-factory';
import { OperatorProjectIconTheme } from '../class/operator-project-icon-theme';

// 辅助函数：获取 extension context
function getExtensionContext(): vscode.ExtensionContext {
  return (globalThis as unknown as { extensionContext: vscode.ExtensionContext })
    .extensionContext;
}

async function openFolderFn(url: string) {
  // 如果项目已存在，直接打开目录
  const localUri = vscode.Uri.file(url);

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
      if (viewIdToProjectType(params.createOperatorProjectDictoryFileType) === 'ascend') {
        // 获取当前 VSCode 中打开的工作区目录
        const currentWorkspaceFolders = vscode.workspace.workspaceFolders;
        const currentExplorerPath = currentWorkspaceFolders && currentWorkspaceFolders.length > 0
          ? currentWorkspaceFolders[0].uri.fsPath
          : undefined;
        console.log('当前资源管理器打开的目录:', currentExplorerPath);

        if (currentExplorerPath?.includes('experimental')) {
          // 根据 currentExplorerPath 在project.json配置数据中查找project，查找到之后插入到它的experimental_ops_list中
          const project = getProjectByPath(currentExplorerPath);
          if (project) {
            console.log('在experimental目录下找到项目:', project);

            // 创建新的子算子信息
            const newSubOperator: SubOperatorInfo = {
              name: params.projectName,
              path: path.join(params.projectPath, params.projectName),
              isCompiled: false
            };

            // 更新项目的experimental_ops_list
            const updatedExperimentalOpsList = [...(project.experimental_ops_list || []), newSubOperator];

            // 更新项目记录
            await createProject({
              project_name: project.project_name,
              project_path: project.project_path,
              experimental_ops_list: updatedExperimentalOpsList,
            });

            console.log('已将新算子添加到experimental_ops_list:', newSubOperator.name);
          } else {
            console.log('在project.json配置中未找到对应项目');
          }
        } else if (currentExplorerPath?.includes('math')) {
          // 根据 currentExplorerPath 在project.json配置数据中查找project，查找到之后插入到它的ops_list中
          const project = getProjectByPath(currentExplorerPath);
          if (project) {
            console.log('在math目录下找到项目:', project);

            // 创建新的子算子信息
            const newSubOperator: SubOperatorInfo = {
              name: params.projectName,
              path: path.join(params.projectPath, params.projectName),
              isCompiled: false
            };

            // 更新项目的ops_list
            const updatedOpsList = [...(project.ops_list || []), newSubOperator];

            // 更新项目记录
            await createProject({
              project_name: project.project_name,
              project_path: project.project_path,
              ops_list: updatedOpsList,
            });

            console.log('已将新算子添加到ops_list:', newSubOperator.name);
          } else {
            console.log('在project.json配置中未找到对应项目');
          }
        } else {
          vscode.window.showInformationMessage('不支持在该位置创建算子工程');
        }
      } else {
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

      if (viewIdToProjectType(params.createOperatorProjectDictoryFileType) === 'ascend') {
        const fullPath = path.join(params.projectPath, params.projectName)
        await ensureLaunchJsonExists(fullPath);
        const generator = OpGeneratorFactory.getGenerator(
          {op_path: fullPath},
          {project_name: params.projectName, project_path: params.projectPath},
          context.extensionPath,
        );
        generator.parseMeta();
        await generator.executeGeneration();
        vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        return
      }

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
  async openProject(params: OpenProjectParams, isFromSystem: boolean = false): Promise<void> {
    try {
      // 首先检查项目是否已在用户的配置数据中
      const existingProject = getProjectByPath(params.projectPath);

      if (existingProject) {
        console.log(`[openProject] 项目已在配置中: ${existingProject.project_name} (${existingProject.project_path})`);

        // 补全配置
        try {
          const projectId = existingProject.id;
          await completeProjectConfigs(projectId);
          console.log(`[openProject] 配置补全完成`);
        } catch (error) {
          console.warn(`[openProject] 补全配置失败: ${error instanceof Error ? error.message : String(error)}`);
        }

        if (!isFromSystem) {
          openFolderFn(params.projectPath)
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

      // 如果是系统打开而且没有环境变量脚本，则默认设置环境变量脚本
      if (isFromSystem && !params.projectSH) {
        params.projectSH = '/etc/profile'
      }

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
      const projectFullPath = path.join(params.projectPath, params.projectName);
      const rootDetection = await OperatorProjectDetector.detectOperatorProject(projectFullPath);

      // 检测到打开的目录并不是算子工程
      if (!rootDetection.projectType) {
        if (!isFromSystem) {
          openFolderFn(projectFullPath)
        }
        return
      }

      // 将配置写入project.json文件
      try {
        await projectService.init({
          ascendEnvScript: params.projectSH,
          projectPath: params.projectPath,
          projectName: params.projectName,
          templateName: rootDetection.projectType === OperatorProjectType.TORCH_LIBRARY ? 'torch_library_template' : '',
          projectType: viewIdToProjectType(rootDetection.projectType)
        });
      }
      catch (error) {
        throw new Error(`初始化算子工程失败: ${error instanceof Error ? error.message : String(error)}`);
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
          template_name: rootDetection.projectType === OperatorProjectType.TORCH_LIBRARY ? 'torch_library_template' : '',
        },
        context.extensionPath,
        true
      );
      await pm.checkVscode();
      if (!isFromSystem) {
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      }

      // 如果是标准自定义算子，扫描算子合集与算子并更新根项目（不为之新建 projects 项）
      if (rootDetection.projectType === OperatorProjectType.STANDARD_CUSTOM) {
        try {
          console.log('[openProject] 检测到标准自定义算子，开始扫描算子合集和算子...');
          const { opsMeet, opsList, experimentalOpsList } = WorkspaceDetectorService.scanOpsMeetAndOpsLists(projectFullPath);
          console.log(`[openProject] 算子合集列表: ${opsMeet.map((m) => m.name).join(', ')}`);
          console.log(`[openProject] 普通算子: ${opsList.length}, experimental算子: ${experimentalOpsList.length}`);
          await updateStandardCustomOperators(projectFullPath, opsMeet, opsList, experimentalOpsList);
          console.log(`[openProject] 已存储 ${opsMeet.length} 个算子合集, ${opsList.length} 个普通算子, ${experimentalOpsList.length} 个experimental算子`);
        }
        catch (error) {
          console.warn(`[openProject] 检测算子信息失败: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // 规范化路径
      const normalizedProjectPath = path.normalize(params.projectPath);
      const normalizedProjectName = path.normalize(params.projectName);
      const fullProjectPath = path.join(normalizedProjectPath, normalizedProjectName);
      if (isFromSystem) {
        // 系统级打开算子工程，只需刷新文件夹装饰
        const iconTheme = OperatorProjectIconTheme.getInstance(context);
        iconTheme.fireDecorationUpdate();
      } else {
        // 通过打开页打开算子工程
        openFolderFn(fullProjectPath)
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
