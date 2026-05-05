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
  // Constants for test data
  const DEFAULT_CONFIG_ID = '123';
  const DEFAULT_COMPILE_OPTION = '--debug';
  const BUILD_SUCCESS_MESSAGE = '编译算子成功';
  const RUN_SUCCESS_MESSAGE = '运行成功';
  const BUILD_EXAMPLE_SUCCESS_MESSAGE = '编译示例成功';
  const SIMULATE_SUCCESS_MESSAGE = '执行仿真分析成功';
  const ONBOARD_SUCCESS_MESSAGE = '执行上板分析成功';
  const SANITIZER_SUCCESS_MESSAGE = '异常检测成功';

  // Mock services
  let controller: BuildControllerV2;
  let mockBuildService: jest.Mocked<BuildApplicationService>;
  let mockNotification: jest.Mocked<INotificationService>;
  let mockProjectManager: jest.Mocked<ProjectManager>;

  // Helper functions
  const setupMocks = () => {
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

    mockNotification = {
      showInfo: jest.fn(),
      showError: jest.fn(),
      showWarning: jest.fn(),
    } as unknown as jest.Mocked<INotificationService>;

    mockProjectManager = {
      initProject: jest.fn(),
      clearExecutor: jest.fn(),
    } as unknown as jest.Mocked<ProjectManager>;

    controller = new BuildControllerV2(
      mockBuildService,
      mockNotification,
      mockProjectManager,
    );
  };

  const setupSuccessfulResult = <T>(method: keyof BuildApplicationService) => {
    (mockBuildService[method] as jest.Mock).mockResolvedValue(ResultUtils.ok(undefined as T));
  };

  const setupFailedResult = <T>(method: keyof BuildApplicationService, error: Error) => {
    (mockBuildService[method] as jest.Mock).mockResolvedValue(ResultUtils.err(error));
  };

  const setupProjectInitialization = () => {
    mockProjectManager.initProject.mockResolvedValue(undefined);
  };

  beforeEach(() => {
    setupMocks();
    setupProjectInitialization();

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('startBuild', () => {
    it('should build successfully with configId and compileOption', async () => {
      // Arrange
      setupSuccessfulResult('startBuild');

      // Act
      await controller.startBuild({
        configId: DEFAULT_CONFIG_ID,
        compileOption: DEFAULT_COMPILE_OPTION,
      });

      // Assert
      expect(mockProjectManager.initProject)
        .toHaveBeenCalled();
      expect(mockBuildService.startBuild)
        .toHaveBeenCalledWith({
          configId: parseInt(DEFAULT_CONFIG_ID),
          compileOption: DEFAULT_COMPILE_OPTION,
        });
      expect(mockNotification.showInfo)
        .toHaveBeenCalledWith(BUILD_SUCCESS_MESSAGE);
      expect(mockProjectManager.clearExecutor)
        .toHaveBeenCalled();
    });

    it('should build successfully with default parameters', async () => {
      // Arrange
      setupSuccessfulResult('startBuild');

      // Act
      await controller.startBuild();

      // Assert
      expect(mockBuildService.startBuild)
        .toHaveBeenCalledWith({
          configId: undefined,
          compileOption: undefined,
        });
      expect(mockNotification.showInfo)
        .toHaveBeenCalledWith(BUILD_SUCCESS_MESSAGE);
    });

    it('should show error notification when build fails', async () => {
      // Arrange
      const error = new BuildFailedError('编译算子失败', {
        command: 'msopgen build',
        exitCode: 1,
        output: 'Build error output',
      });

      setupFailedResult('startBuild', error);

      // Act & Assert
      await expect(controller.startBuild({ configId: '456' })).rejects.toThrow(error);

      expect(mockNotification.showError)
        .toHaveBeenCalledWith('编译算子失败: 编译算子失败');
      expect(mockNotification.showInfo).not.toHaveBeenCalled();
      expect(mockProjectManager.clearExecutor)
        .toHaveBeenCalled();
    });

    it('should clear executor even when build fails', async () => {
      // Arrange
      const error = new BuildFailedError('编译算子失败', {
        command: 'msopgen build',
        exitCode: 1,
        output: 'Error',
      });

      setupFailedResult('startBuild', error);

      // Act & Assert
      await expect(controller.startBuild()).rejects.toThrow(error);

      expect(mockProjectManager.clearExecutor)
        .toHaveBeenCalled();
    });

    it('should convert string configId to number', async () => {
      // Arrange
      setupSuccessfulResult('startBuild');

      // Act
      await controller.startBuild({ configId: '789' });

      // Assert
      expect(mockBuildService.startBuild)
        .toHaveBeenCalledWith({
          configId: 789,
          compileOption: undefined,
        });
    });
  });

  describe('startRun', () => {
    it('should run successfully', async () => {
      // Arrange
      setupSuccessfulResult('startRun');

      // Act
      await controller.startRun({ configId: '100' });

      // Assert
      expect(mockProjectManager.initProject)
        .toHaveBeenCalled();
      expect(mockBuildService.startRun)
        .toHaveBeenCalledWith({ configId: 100 });
      expect(mockNotification.showInfo)
        .toHaveBeenCalledWith(RUN_SUCCESS_MESSAGE);
      expect(mockProjectManager.clearExecutor)
        .toHaveBeenCalled();
    });

    it('should show error notification when run fails', async () => {
      // Arrange
      const error = new BuildFailedError('运行失败', {
        command: 'msopgen run',
        exitCode: 1,
        output: 'Runtime error',
      });

      setupFailedResult('startRun', error);

      // Act & Assert
      await expect(controller.startRun()).rejects.toThrow(error);

      expect(mockNotification.showError)
        .toHaveBeenCalledWith('运行失败: 运行失败');
      expect(mockProjectManager.clearExecutor)
        .toHaveBeenCalled();
    });
  });

  describe('startBuildExample', () => {
    it('should build example successfully', async () => {
      // Arrange
      setupSuccessfulResult('startBuildExample');

      // Act
      await controller.startBuildExample({ configId: '200' });

      // Assert
      expect(mockProjectManager.initProject)
        .toHaveBeenCalled();
      expect(mockBuildService.startBuildExample)
        .toHaveBeenCalledWith({ configId: 200 });
      expect(mockNotification.showInfo)
        .toHaveBeenCalledWith(BUILD_EXAMPLE_SUCCESS_MESSAGE);
      expect(mockProjectManager.clearExecutor)
        .toHaveBeenCalled();
    });

    it('should show error notification when build example fails', async () => {
      // Arrange
      const error = new BuildFailedError('编译示例失败', {
        command: 'msopgen build-example',
        exitCode: 1,
        output: 'Example build error',
      });

      setupFailedResult('startBuildExample', error);

      // Act & Assert
      await expect(controller.startBuildExample()).rejects.toThrow(error);

      expect(mockNotification.showError)
        .toHaveBeenCalledWith('编译示例失败: 编译示例失败');
    });
  });

  describe('getBuildConfigId', () => {
    it('should return config ID when successful', async () => {
      // Arrange
      mockBuildService.getBuildConfigId.mockResolvedValue(ResultUtils.ok(123));

      // Act
      const result = await controller.getBuildConfigId();

      // Assert
      expect(result)
        .toBe(123);
      expect(mockBuildService.getBuildConfigId)
        .toHaveBeenCalled();
    });

    it('should return undefined when error occurs', async () => {
      // Arrange
      const error = new ConfigNotFoundError('build_op', {});

      mockBuildService.getBuildConfigId.mockResolvedValue(ResultUtils.err(error));

      // Act
      const result = await controller.getBuildConfigId();

      // Assert
      expect(result)
        .toBeUndefined();
    });
  });

  describe('getBuildExampleConfigId', () => {
    it('should return config ID when successful', async () => {
      // Arrange
      mockBuildService.getBuildExampleConfigId.mockResolvedValue(ResultUtils.ok(456));

      // Act
      const result = await controller.getBuildExampleConfigId();

      // Assert
      expect(result)
        .toBe(456);
    });

    it('should return undefined when error occurs', async () => {
      // Arrange
      const error = new ConfigNotFoundError('build_example', {});

      mockBuildService.getBuildExampleConfigId.mockResolvedValue(ResultUtils.err(error));

      // Act
      const result = await controller.getBuildExampleConfigId();

      // Assert
      expect(result)
        .toBeUndefined();
    });
  });

  describe('startSimulate', () => {
    it('should simulate successfully and refresh UI', async () => {
      // Arrange
      setupSuccessfulResult('startSimulate');
      const mockExecuteCommand = jest.fn()
        .mockResolvedValue(undefined);

      (vscode.commands.executeCommand as jest.Mock) = mockExecuteCommand;

      // Act
      await controller.startSimulate();

      // Assert
      expect(mockProjectManager.initProject)
        .toHaveBeenCalled();
      expect(mockBuildService.startSimulate)
        .toHaveBeenCalled();
      expect(mockNotification.showInfo)
        .toHaveBeenCalledWith(SIMULATE_SUCCESS_MESSAGE);

      // Verify UI refresh commands
      expect(mockExecuteCommand)
        .toHaveBeenCalledWith('huawei-op-devtools.flashPerformanceRunData');
      expect(mockProjectManager.clearExecutor)
        .toHaveBeenCalled();
    });

    it('should show error when simulate fails', async () => {
      // Arrange
      const error = new BuildFailedError('仿真分析失败', {
        command: 'msopgen simulate',
        exitCode: 1,
        output: 'Simulation error',
      });

      setupFailedResult('startSimulate', error);

      // Act & Assert
      await expect(controller.startSimulate()).rejects.toThrow(error);

      expect(mockNotification.showError)
        .toHaveBeenCalledWith('仿真分析失败: 仿真分析失败');
    });
  });

  describe('startOnBoard', () => {
    it('should execute onBoard successfully and refresh UI', async () => {
      // Arrange
      setupSuccessfulResult('startOnBoard');
      const mockExecuteCommand = jest.fn()
        .mockResolvedValue(undefined);

      (vscode.commands.executeCommand as jest.Mock) = mockExecuteCommand;

      // Act
      await controller.startOnBoard();

      // Assert
      expect(mockProjectManager.initProject)
        .toHaveBeenCalled();
      expect(mockBuildService.startOnBoard)
        .toHaveBeenCalled();
      expect(mockNotification.showInfo)
        .toHaveBeenCalledWith(ONBOARD_SUCCESS_MESSAGE);

      // Verify UI refresh commands
      expect(mockExecuteCommand)
        .toHaveBeenCalledWith('huawei-op-devtools.flashPerformanceRunData');
      expect(mockProjectManager.clearExecutor)
        .toHaveBeenCalled();
    });

    it('should show error when onBoard fails', async () => {
      // Arrange
      const error = new BuildFailedError('上板分析失败', {
        command: 'msopgen onboard',
        exitCode: 1,
        output: 'OnBoard error',
      });

      setupFailedResult('startOnBoard', error);

      // Act & Assert
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
      (path.join as jest.Mock).mockImplementation((...args) => args.join('/'));
    });

    it('should run sanitizer successfully and create log directory', async () => {
      // Arrange
      setupSuccessfulResult('runSanitizer');
      const mockExecuteCommand = jest.fn()
        .mockResolvedValue(undefined);

      (vscode.commands.executeCommand as jest.Mock) = mockExecuteCommand;
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);

      // Act
      await controller.runSanitizer();

      // Assert
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
        .toHaveBeenCalledWith(SANITIZER_SUCCESS_MESSAGE);

      // Verify UI refresh command
      expect(mockExecuteCommand)
        .toHaveBeenCalledWith('huawei-op-devtools.flashMsSanitizerRunData');
      expect(mockProjectManager.clearExecutor)
        .toHaveBeenCalled();
    });

    it('should not create log directory if it already exists', async () => {
      // Arrange
      setupSuccessfulResult('runSanitizer');
      (vscode.commands.executeCommand as jest.Mock) = jest.fn()
        .mockResolvedValue(undefined);
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      // Act
      await controller.runSanitizer();

      // Assert
      expect(fs.existsSync)
        .toHaveBeenCalled();
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should show error when sanitizer fails', async () => {
      // Arrange
      const error = new BuildFailedError('异常检测失败', {
        command: 'msopgen sanitizer',
        exitCode: 1,
        output: 'Sanitizer error',
      });

      setupFailedResult('runSanitizer', error);
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      // Act & Assert
      await expect(controller.runSanitizer()).rejects.toThrow(error);

      expect(mockNotification.showError)
        .toHaveBeenCalledWith('异常检测失败: 异常检测失败');
    });

    it('should handle workspace folders being undefined', async () => {
      // Arrange
      setupSuccessfulResult('runSanitizer');
      (vscode.workspace as any).workspaceFolders = undefined;

      // Act
      await controller.runSanitizer();

      // Assert
      // Should not attempt to create directory
      expect(fs.existsSync).not.toHaveBeenCalled();
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should handle workspace folders being empty array', async () => {
      // Arrange
      setupSuccessfulResult('runSanitizer');
      (vscode.workspace as any).workspaceFolders = [];

      // Act
      await controller.runSanitizer();

      // Assert
      // Should not attempt to create directory
      expect(fs.existsSync).not.toHaveBeenCalled();
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('error message formatting', () => {
    it('should format Error objects correctly', async () => {
      // Arrange
      const error = new Error('Standard error message');

      setupFailedResult('startBuild', error);

      // Act & Assert
      await expect(controller.startBuild()).rejects.toThrow(error);

      expect(mockNotification.showError)
        .toHaveBeenCalledWith(`${BUILD_SUCCESS_MESSAGE}: Standard error message`);
    });

    it('should convert non-Error objects to strings', async () => {
      // Arrange
      mockBuildService.startRun.mockResolvedValue(ResultUtils.err('String error' as any));

      // Act & Assert
      await expect(controller.startRun()).rejects.toThrow();

      expect(mockNotification.showError)
        .toHaveBeenCalledWith(`${RUN_SUCCESS_MESSAGE}: String error`);
    });
  });
});
