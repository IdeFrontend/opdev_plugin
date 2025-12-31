import * as vscode from 'vscode';
import * as path from 'path';

import { ApiGroup } from 'plugin:/core/ApiServer';
import { CommandExecutor } from 'plugin:/class/CommandOptions';
import { OpsAPI } from '../helpers/OpsAPI';
import { RemoteConfig } from '../helpers/RemoteConfig';
import { CreatedProjectParams } from 'shared:/api-types';

// 辅助函数：获取 extension context
function getExtensionContext(): vscode.ExtensionContext {
  return (globalThis as any).extensionContext;
}

export const welcomeApis: ApiGroup = {
  webview: {
    // 创建项目
    async createdProject(params: CreatedProjectParams): Promise<void> {
      const context = getExtensionContext();
      // 缓存 projectPath 到远程服务器
      const originalProjectPath = params.projectPath;
      RemoteConfig.setLastProjectPath(originalProjectPath);

      // 标准算子projectPath需增加 /ops-math/math路径
      let originPath;
      if (params.createOperatorProjectDictoryFileType === 2) {
        originPath = params.projectPath;
        params.projectPath += '/ops-math/math';
      }
      vscode.window.showInformationMessage(`初始化中`);

      const executor = new CommandExecutor();

      // 标准算子解压缩
      if (params.createOperatorProjectDictoryFileType === 2) {
        await executor.execute(`mkdir -p ${originPath}`, ['File exists']);
        const zipUrl = path.resolve(context.extensionPath, `out/templates/code_template/op-math/ops-math.zip`);
        await executor.execute(`unzip -o ${zipUrl} -d ${originPath}`);
      }
      await executor.execute(`mkdir -p ${params.projectPath}/${params.projectName}`, ['File exists']);
      if (params.projectSH) {
        await executor.execute(`chmod +x ${params.projectSH}`);
        await executor.execute(`${params.projectSH}`);
      }
      await OpsAPI.init({
        accendEnvScript: params.projectSH,
        projectPath: params.projectPath,
        projectName: params.projectName
      });
      await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(`${params.projectPath}/${params.projectName}`));
      // 规范化路径
      const normalizedProjectPath = path.normalize(params.projectPath);
      const normalizedProjectName = path.normalize(params.projectName);
      const fullProjectPath = path.join(normalizedProjectPath, normalizedProjectName);

      context.globalState.update('runCommand', 'huawei-op-devtools.createDictory');
      context.globalState.update('runCommand-param', params.createOperatorProjectDictoryFileType);

      // 在远程环境中，我们可以直接打开本地路径（相对于远程系统）
      const localUri = vscode.Uri.file(fullProjectPath);
      console.log('vscode.openFolder，打开新目录', localUri);

      // 询问用户是在当前窗口打开还是新窗口打开
      const choice = await vscode.window.showInformationMessage(
        '选择打开方式',
        { modal: true },
        '当前窗口',
        '新窗口'
      );

      // 如果用户取消了选择，则不执行打开操作
      if (!choice) {
        return;
      }

      const forceNewWindow = choice === '新窗口';

      // 如果用户取消了选择，则不打开文件夹
      try {
        await vscode.commands.executeCommand('vscode.openFolder', localUri, {
          forceNewWindow: forceNewWindow,
        });
        vscode.window.showInformationMessage(`打开算子工程目录成功`);
      } catch (e) {
        vscode.window.showInformationMessage(`打开算子工程目录失败: ${e}`);
      }
    },
  },
};

