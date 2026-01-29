import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { ProjectManager } from '@plugin/core/project/project-manager';
import { getSanitizerCommand, getBuildExampleCommand } from '@plugin/domain';
import { configService } from './config-service';
import { buildService } from './build-service';
import { OperatorProjectType, OperatorProjectDetector } from '@plugin/domain/services/operator-project-detector';

const CONFIG_TYPES = { SANITIZER: 'sanitizer' } as const;

export class SanitizerService {
  /**
   * 获取异常检测配置ID
   */
  async getSanitizerConfigIdInternal(): Promise<number | undefined> {
    try {
      const configData = await configService.getSanitizerConfigsList();

      return configData.find((v) => v.config_type === CONFIG_TYPES.SANITIZER)
        ?.config_id;
    }
    catch {
      return undefined;
    }
  }

  /**
   * 运行异常检测
   */
  async runSanitizer(params: { operatorNames?: string } = {}): Promise<void> {
    try {
      // 异常检测前编译
      const sanitizerConfigId: number | undefined =
        await this.getSanitizerConfigIdInternal();
      const buildCommand = getBuildOpCommand(
        Number(sanitizerConfigId),
        '',
        params.operatorNames,
      );
      const buildExecutor = ProjectManager.getInstance()
        .getExecutor();
      const buildRes = await buildExecutor.execute(
        buildCommand,
        [],
        [],
        {},
        true,
      );

      if (buildRes.code !== 0) {
        vscode.window.showErrorMessage(`编译算子失败 ${buildRes.output}`);

        return;
      }

      // 如果是标准自定义算子，需要编译 example
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders && workspaceFolders.length > 0) {
        const workspacePath = workspaceFolders[0].uri.fsPath;
        try {
          const rootDetection = await OperatorProjectDetector.detectOperatorProject(workspacePath);
          const isRootStandardCustom = rootDetection.isOperatorProject && rootDetection.projectType === OperatorProjectType.STANDARD_CUSTOM;

          if (isRootStandardCustom) {
            const exConfigId = await buildService.getBuildExampleConfigId();
            const exampleCompileOption = '';
            const exampleBuildCommand = getBuildExampleCommand(
              Number(exConfigId),
              exampleCompileOption,
              params.operatorNames,
            );
            const exampleBuildExecutor = ProjectManager.getInstance()
              .getExecutor();
            const exampleBuildRes = await exampleBuildExecutor.execute(
              exampleBuildCommand,
              [],
              [],
              {},
              true,
            );

            console.log('example buildRes', exampleBuildRes);

            if (exampleBuildRes.code !== 0) {
              vscode.window.showErrorMessage(`编译示例失败 ${exampleBuildRes.output}`);
              return;
            }
          }
        }
        catch (error) {
          console.warn('[runSanitizer] 检测项目类型失败:', error);
        }
      }

      // 创建文件夹
      if (workspaceFolders && workspaceFolders.length > 0) {
        const workspacePath = workspaceFolders[0].uri.fsPath;
        const logPath = path.join(
          workspacePath,
          '.vscode',
          'mindstudio_sanitizer_log',
        );

        if (!fs.existsSync(logPath)) {
          fs.mkdirSync(logPath, { mode: 0o750 });
        }
      }

      // 开启异常检测
      const exampleConfigId: number | undefined | string =
        await buildService.getBuildExampleConfigId();

      const sanitizerCommand =
        getSanitizerCommand(
          Number(sanitizerConfigId),
          Number(exampleConfigId),
          params.operatorNames,
        ) || '';
      const executor = ProjectManager.getInstance()
        .getExecutor();
      const res = await executor.execute(sanitizerCommand, [], [], {}, true);

      if (res.code !== 0) {
        vscode.window.showErrorMessage(`异常检测失败 ${res.output}`);

        return;
      }

      vscode.window.showInformationMessage('异常检测成功');

      // 执行完检测后，获取最新的列表数据
      await vscode.commands.executeCommand('msSanitizerSidebarView.focus');
      await vscode.commands.executeCommand('huawei-op-devtools.flashMsSanitizerRunData');
    }
    catch (e: unknown) {
      vscode.window.showErrorMessage(`异常检测失败: ${(e as Error).message}`);
    }
  }
}

// Helper for importing getBuildOpCommand which is not exported by autogen-server directly in all cases or needs import
import { getBuildOpCommand } from '@plugin/domain';

export const sanitizerService = new SanitizerService();
