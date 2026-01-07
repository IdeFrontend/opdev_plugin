import { BuildControllerV2 } from '../build.controller';
import { BuildApplicationService } from '@plugin-v2/application/services/operator/build.application';
import { INotificationService } from '@plugin-v2/application/interfaces/notification.interface';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { ResultUtils } from '@plugin-v2/domain/shared/types/result.type';
import {
  BuildFailedError,
  ConfigNotFoundError,
} from '@plugin-v2/domain/shared/errors/base.error';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// Mock dependencies
jest.mock('vscode');
jest.mock('fs');
jest.mock('path');

describe('BuildControllerV2', () => {
  let controller: BuildControllerV2;
  let mockBuildService: jest.Mocked<BuildApplicationService>;
  let mockNotification: jest.Mocked<INotificationService>;
  let mockProjectManager: jest.Mocked<ProjectManager>;

  beforeEach(() => {
    // Mock BuildApplicationService
    mockBuildService = {
      startBuild: jest.fn(),
      startRun: jest.fn(),
      startBuildExample: jest.fn(),
      startSimulate: jest.fn(),
      startOnBoard: jest.fn(),
      runSanitizer: jest.fn(),
      getBuildConfigId: jest.fn(),
      getBuildExampleConfigId: jest.fn(),
    } as unknown as jest.Mocked<BuildApplicationService>;

    // Mock INotificationService
    mockNotification = {
      showInfo: jest.fn(),
      showError: jest.fn(),
      showWarning: jest.fn(),
    };

    // Mock ProjectManager
    mockProjectManager = {
      initProject: jest.fn(),
      clearExecutor: jest.fn(),
    } as unknown as jest.Mocked<ProjectManager>;

    controller = new BuildControllerV2(
      mockBuildService,
      mockNotification,
      mockProjectManager,
    );

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('startBuild', () => {
    it('should build successfully with configId and compileOption', async () => {
      mockProjectManager.initProject.mockResolvedValue(undefined);
      mockBuildService.startBuild.mockResolvedValue(ResultUtils.ok(undefined));

      await controller.startBuild({
        configId: '123',
        compileOption: '--debug',
      });

      expect(mockProjectManager.initProject)
        .toHaveBeenCalled();
      expect(mockBuildService.startBuild)
        .toHaveBeenCalledWith({
          configId: 123,
          compileOption: '--debug',
        });
      expect(mockNotification.showInfo)
        .toHaveBeenCalledWith('编译算子成功');
      expect(mockProjectManager.clearExecutor)
        .toHaveBeenCalled();
    });

    it('should build successfully with default parameters', async () => {
      mockProjectManager.initProject.mockResolvedValue(undefined);
      mockBuildService.startBuild.mockResolvedValue(ResultUtils.ok(undefined));

      await controller.startBuild();

      expect(mockBuildService.startBuild)
        .toHaveBeenCalledWith({
          configId: undefined,
          compileOption: undefined,
        });
      expect(mockNotification.showInfo)
        .toHaveBeenCalledWith('编译算子成功');
    });

    it('should show error notification when build fails', async () => {
      mockProjectManager.initProject.mockResolvedValue(undefined);
      const error = new BuildFailedError('编译算子失败', {
        command: 'msopgen build',
        exitCode: 1,
        output: 'Build error output',
      });

      mockBuildService.startBuild.mockResolvedValue(ResultUtils.err(error));

      await expect(controller.startBuild({ configId: '456' })).rejects.toThrow(error);

      expect(mockNotification.showError)
        .toHaveBeenCalledWith('编译算子失败: 编译算子失败');
      expect(mockNotification.showInfo).not.toHaveBeenCalled();
      expect(mockProjectManager.clearExecutor)
        .toHaveBeenCalled();
    });

    it('should clear executor even when build fails', async () => {
      mockProjectManager.initProject.mockResolvedValue(undefined);
      const error = new BuildFailedError('编译算子失败', {
        command: 'msopgen build',
        exitCode: 1,
        output: 'Error',
      });

      mockBuildService.startBuild.mockResolvedValue(ResultUtils.err(error));

      await expect(controller.startBuild()).rejects.toThrow(error);

      expect(mockProjectManager.clearExecutor)
        .toHaveBeenCalled();
    });

    it('should convert string configId to number', async () => {
      mockProjectManager.initProject.mockResolvedValue(undefined);
      mockBuildService.startBuild.mockResolvedValue(ResultUtils.ok(undefined));

      await controller.startBuild({ configId: '789' });

      expect(mockBuildService.startBuild)
        .toHaveBeenCalledWith({
          configId: 789,
          compileOption: undefined,
        });
    });
  });

  describe('startRun', () => {
    it('should run successfully', async () => {
      mockProjectManager.initProject.mockResolvedValue(undefined);
      mockBuildService.startRun.mockResolvedValue(ResultUtils.ok(undefined));

      await controller.startRun({ configId: '100' });

      expect(mockProjectManager.initProject)
        .toHaveBeenCalled();
      expect(mockBuildService.startRun)
        .toHaveBeenCalledWith({ configId: 100 });
      expect(mockNotification.showInfo)
        .toHaveBeenCalledWith('运行成功');
      expect(mockProjectManager.clearExecutor)
        .toHaveBeenCalled();
    });

    it('should show error notification when run fails', async () => {
      mockProjectManager.initProject.mockResolvedValue(undefined);
      const error = new BuildFailedError('运行失败', {
        command: 'msopgen run',
        exitCode: 1,
        output: 'Runtime error',
      });

      mockBuildService.startRun.mockResolvedValue(ResultUtils.err(error));

      await expect(controller.startRun()).rejects.toThrow(error);

      expect(mockNotification.showError)
        .toHaveBeenCalledWith('运行失败: 运行失败');
      expect(mockProjectManager.clearExecutor)
        .toHaveBeenCalled();
    });
  });

  describe('startBuildExample', () => {
    it('should build example successfully', async () => {
      mockProjectManager.initProject.mockResolvedValue(undefined);
      mockBuildService.startBuildExample.mockResolvedValue(ResultUtils.ok(undefined));

      await controller.startBuildExample({ configId: '200' });

      expect(mockProjectManager.initProject)
        .toHaveBeenCalled();
      expect(mockBuildService.startBuildExample)
        .toHaveBeenCalledWith({ configId: 200 });
      expect(mockNotification.showInfo)
        .toHaveBeenCalledWith('编译示例成功');
      expect(mockProjectManager.clearExecutor)
        .toHaveBeenCalled();
    });

    it('should show error notification when build example fails', async () => {
      mockProjectManager.initProject.mockResolvedValue(undefined);
      const error = new BuildFailedError('编译示例失败', {
        command: 'msopgen build-example',
        exitCode: 1,
        output: 'Example build error',
      });

      mockBuildService.startBuildExample.mockResolvedValue(ResultUtils.err(error));

      await expect(controller.startBuildExample()).rejects.toThrow(error);

      expect(mockNotification.showError)
        .toHaveBeenCalledWith('编译示例失败: 编译示例失败');
    });
  });

  describe('getBuildConfigId', () => {
    it('should return config ID when successful', async () => {
      mockBuildService.getBuildConfigId.mockResolvedValue(ResultUtils.ok(123));

      const result = await controller.getBuildConfigId();

      expect(result)
        .toBe(123);
      expect(mockBuildService.getBuildConfigId)
        .toHaveBeenCalled();
    });

    it('should return undefined when error occurs', async () => {
      const error = new ConfigNotFoundError('build_op', {});

      mockBuildService.getBuildConfigId.mockResolvedValue(ResultUtils.err(error));

      const result = await controller.getBuildConfigId();

      expect(result)
        .toBeUndefined();
    });
  });

  describe('getBuildExampleConfigId', () => {
    it('should return config ID when successful', async () => {
      mockBuildService.getBuildExampleConfigId.mockResolvedValue(ResultUtils.ok(456));

      const result = await controller.getBuildExampleConfigId();

      expect(result)
        .toBe(456);
    });

    it('should return undefined when error occurs', async () => {
      const error = new ConfigNotFoundError('build_example', {});

      mockBuildService.getBuildExampleConfigId.mockResolvedValue(ResultUtils.err(error));

      const result = await controller.getBuildExampleConfigId();

      expect(result)
        .toBeUndefined();
    });
  });

  describe('startSimulate', () => {
    it('should simulate successfully and refresh UI', async () => {
      mockProjectManager.initProject.mockResolvedValue(undefined);
      mockBuildService.startSimulate.mockResolvedValue(ResultUtils.ok(undefined));
      const mockExecuteCommand = jest.fn()
        .mockResolvedValue(undefined);

      (vscode.commands.executeCommand as jest.Mock) = mockExecuteCommand;

      await controller.startSimulate();

      expect(mockProjectManager.initProject)
        .toHaveBeenCalled();
      expect(mockBuildService.startSimulate)
        .toHaveBeenCalled();
      expect(mockNotification.showInfo)
        .toHaveBeenCalledWith('执行仿真分析成功');

      // Verify UI refresh commands
      expect(mockExecuteCommand)
        .toHaveBeenCalledWith('performanceSidebarView.focus');
      expect(mockExecuteCommand)
        .toHaveBeenCalledWith('huawei-op-devtools.flashPerformanceRunData');
      expect(mockProjectManager.clearExecutor)
        .toHaveBeenCalled();
    });

    it('should show error when simulate fails', async () => {
      mockProjectManager.initProject.mockResolvedValue(undefined);
      const error = new BuildFailedError('仿真分析失败', {
        command: 'msopgen simulate',
        exitCode: 1,
        output: 'Simulation error',
      });

      mockBuildService.startSimulate.mockResolvedValue(ResultUtils.err(error));

      await expect(controller.startSimulate()).rejects.toThrow(error);

      expect(mockNotification.showError)
        .toHaveBeenCalledWith('仿真分析失败: 仿真分析失败');
    });
  });

  describe('startOnBoard', () => {
    it('should execute onBoard successfully and refresh UI', async () => {
      mockProjectManager.initProject.mockResolvedValue(undefined);
      mockBuildService.startOnBoard.mockResolvedValue(ResultUtils.ok(undefined));
      const mockExecuteCommand = jest.fn()
        .mockResolvedValue(undefined);

      (vscode.commands.executeCommand as jest.Mock) = mockExecuteCommand;

      await controller.startOnBoard();

      expect(mockProjectManager.initProject)
        .toHaveBeenCalled();
      expect(mockBuildService.startOnBoard)
        .toHaveBeenCalled();
      expect(mockNotification.showInfo)
        .toHaveBeenCalledWith('执行上板分析成功');

      // Verify UI refresh commands
      expect(mockExecuteCommand)
        .toHaveBeenCalledWith('performanceSidebarView.focus');
      expect(mockExecuteCommand)
        .toHaveBeenCalledWith('huawei-op-devtools.flashPerformanceRunData');
      expect(mockProjectManager.clearExecutor)
        .toHaveBeenCalled();
    });

    it('should show error when onBoard fails', async () => {
      mockProjectManager.initProject.mockResolvedValue(undefined);
      const error = new BuildFailedError('上板分析失败', {
        command: 'msopgen onboard',
        exitCode: 1,
        output: 'OnBoard error',
      });

      mockBuildService.startOnBoard.mockResolvedValue(ResultUtils.err(error));

      await expect(controller.startOnBoard()).rejects.toThrow(error);

      expect(mockNotification.showError)
        .toHaveBeenCalledWith('上板分析失败: 上板分析失败');
    });
  });

  describe('runSanitizer', () => {
    beforeEach(() => {
      // Mock workspace folders
      (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/test/workspace' } }];

      // Mock path.join
      (path.join as jest.Mock).mockImplementation((...args) =>
        args.join('/'));
    });

    it('should run sanitizer successfully and create log directory', async () => {
      mockProjectManager.initProject.mockResolvedValue(undefined);
      mockBuildService.runSanitizer.mockResolvedValue(ResultUtils.ok(undefined));
      const mockExecuteCommand = jest.fn()
        .mockResolvedValue(undefined);

      (vscode.commands.executeCommand as jest.Mock) = mockExecuteCommand;
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);

      await controller.runSanitizer();

      // Verify log directory creation
      expect(fs.existsSync)
        .toHaveBeenCalledWith('/test/workspace/.vscode/mindstudio_sanitizer_log');
      expect(fs.mkdirSync)
        .toHaveBeenCalledWith(
          '/test/workspace/.vscode/mindstudio_sanitizer_log',
          {
            mode: 0o750,
            recursive: true,
          },
        );

      expect(mockProjectManager.initProject)
        .toHaveBeenCalled();
      expect(mockBuildService.runSanitizer)
        .toHaveBeenCalled();
      expect(mockNotification.showInfo)
        .toHaveBeenCalledWith('异常检测成功');

      // Verify UI refresh command
      expect(mockExecuteCommand)
        .toHaveBeenCalledWith('huawei-op-devtools.flashMsSanitizerRunData');
      expect(mockProjectManager.clearExecutor)
        .toHaveBeenCalled();
    });

    it('should not create log directory if it already exists', async () => {
      mockProjectManager.initProject.mockResolvedValue(undefined);
      mockBuildService.runSanitizer.mockResolvedValue(ResultUtils.ok(undefined));
      (vscode.commands.executeCommand as jest.Mock) = jest
        .fn()
        .mockResolvedValue(undefined);
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      await controller.runSanitizer();

      expect(fs.existsSync)
        .toHaveBeenCalled();
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should show error when sanitizer fails', async () => {
      mockProjectManager.initProject.mockResolvedValue(undefined);
      const error = new BuildFailedError('异常检测失败', {
        command: 'msopgen sanitizer',
        exitCode: 1,
        output: 'Sanitizer error',
      });

      mockBuildService.runSanitizer.mockResolvedValue(ResultUtils.err(error));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      await expect(controller.runSanitizer()).rejects.toThrow(error);

      expect(mockNotification.showError)
        .toHaveBeenCalledWith('异常检测失败: 异常检测失败');
    });

    it('should handle workspace folders being undefined', async () => {
      mockProjectManager.initProject.mockResolvedValue(undefined);
      mockBuildService.runSanitizer.mockResolvedValue(ResultUtils.ok(undefined));
      (vscode.workspace as any).workspaceFolders = undefined;

      await controller.runSanitizer();

      // Should not attempt to create directory
      expect(fs.existsSync).not.toHaveBeenCalled();
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should handle workspace folders being empty array', async () => {
      mockProjectManager.initProject.mockResolvedValue(undefined);
      mockBuildService.runSanitizer.mockResolvedValue(ResultUtils.ok(undefined));
      (vscode.workspace as any).workspaceFolders = [];

      await controller.runSanitizer();

      // Should not attempt to create directory
      expect(fs.existsSync).not.toHaveBeenCalled();
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('error message formatting', () => {
    it('should format Error objects correctly', async () => {
      mockProjectManager.initProject.mockResolvedValue(undefined);
      const error = new Error('Standard error message');

      mockBuildService.startBuild.mockResolvedValue(ResultUtils.err(error as any));

      await expect(controller.startBuild()).rejects.toThrow(error);

      expect(mockNotification.showError)
        .toHaveBeenCalledWith('编译算子失败: Standard error message');
    });

    it('should convert non-Error objects to strings', async () => {
      mockProjectManager.initProject.mockResolvedValue(undefined);
      mockBuildService.startRun.mockResolvedValue(ResultUtils.err('String error' as any));

      await expect(controller.startRun()).rejects.toThrow();

      expect(mockNotification.showError)
        .toHaveBeenCalledWith('运行失败: String error');
    });
  });
});
