import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import AdmZip from 'adm-zip';
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

      // 标准算子projectPath需增加 /ops-math/math路径
      let originPath;

      if (params.createOperatorProjectDictoryFileType === 2) {
        originPath = params.projectPath;
        params.projectPath += '/ops-math/math';
      }

      vscode.window.showInformationMessage('初始化中');

      const executor = new CommandExecutor();

      // 标准算子解压缩
      if (params.createOperatorProjectDictoryFileType === 2) {
        try {
          // 使用 fs.mkdirSync 创建目录（跨平台兼容）
          if (!fs.existsSync(originPath)) {
            fs.mkdirSync(originPath, { recursive: true });
          }

          const zipUrl = path.resolve(
            context.extensionPath,
            'out/templates/code_template/op-math/ops-math.zip',
          );

          // 使用 adm-zip 解压缩（跨平台兼容）
          try {
            const zip = new AdmZip(zipUrl);

            zip.extractAllTo(originPath, true);
          }
          catch (zipError) {
            throw new Error(`解压缩失败: ${zipError instanceof Error ? zipError.message : String(zipError)}`);
          }
        }
        catch (error) {
          throw new Error(`创建标准算子目录失败: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

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

      // 将配置写入project.json文件
      try {
        await projectService.init({
          ascendEnvScript: params.projectSH,
          projectPath: params.projectPath,
          projectName: params.projectName,
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

      // 处理配置文件
      const pm = ProjectManager.getInstance();
      const projectId = Number(pm.projectId);
      await generateStructure(
        {
          ops_prototype_file: '',
          project_id: projectId,
          // cann ascend pyasc
          op_type: 'cann',
          template_name: '',
        },
        context.extensionPath,
        true
      );
      await pm.checkVscode();
      // op_type为ascend时，是否需要创建算子工程原型文件
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor'); 

      // 规范化路径
      const normalizedProjectPath = path.normalize(params.projectPath);
      const normalizedProjectName = path.normalize(params.projectName);
      const fullProjectPath = path.join(
        normalizedProjectPath,
        normalizedProjectName,
      );
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
