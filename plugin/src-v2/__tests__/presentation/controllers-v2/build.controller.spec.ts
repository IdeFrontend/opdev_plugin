import { BuildControllerV2 } from '../../../../presentation/controllers-v2/build.controller';
import { BuildApplicationService } from '../../../../application/services/operator/build.application';
import { INotificationService } from '../../../../application/interfaces/notification.interface';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { ResultUtils } from '../../../../domain/shared/types/result.type';

// Mock dependencies
const mockBuildService = {
  startBuild: jest.fn(),
  startRun: jest.fn(),
  startBuildExample: jest.fn(),
  getBuildConfigId: jest.fn(),
  getBuildExampleConfigId: jest.fn(),
  getSimulateConfigId: jest.fn(),
  getOnBoardConfigId: jest.fn(),
  getSanitizerConfigId: jest.fn(),
  getSanitizerConfigs: jest.fn(),
  saveSanitizerForm: jest.fn(),
  startSimulate: jest.fn(),
  startOnBoard: jest.fn(),
  runSanitizer: jest.fn(),
};

const mockNotificationService = {
  showInfo: jest.fn(),
  showError: jest.fn(),
  showWarning: jest.fn(),
  showProgress: jest.fn(),
};

const mockProjectManager = {
  initProject: jest.fn(),
  getExecutor: jest.fn(),
  clearExecutor: jest.fn(),
};

describe('BuildControllerV2', () => {
  let controller: BuildControllerV2;
  let buildService: typeof mockBuildService;
  let notificationService: typeof mockNotificationService;
  let projectManager: typeof mockProjectManager;

  beforeEach(() => {
    buildService = { ...mockBuildService };
    notificationService = { ...mockNotificationService };
    projectManager = { ...mockProjectManager };

    controller = new BuildControllerV2(
      buildService as unknown as BuildApplicationService,
      notificationService as unknown as INotificationService,
      projectManager as unknown as ProjectManager
    );

    jest.clearAllMocks();
  });

  describe('startBuild', () => {
    it('should initialize project and execute build', async () => {
      // Arrange
      const params = { configId: '1', compileOption: 'release' };
      buildService.startBuild.mockResolvedValue(ResultUtils.ok(null));

      // Act
      await controller.startBuild(params);

      // Assert
      expect(projectManager.initProject).toHaveBeenCalled();
      expect(buildService.startBuild).toHaveBeenCalledWith({
        configId: 1,
        compileOption: 'release',
        operatorNames: undefined,
        operatorType: undefined,
      });
      expect(notificationService.showInfo).toHaveBeenCalledWith('编译算子成功');
    });

    it('should handle build failure and show error', async () => {
      // Arrange
      const error = new Error('Build failed');
      buildService.startBuild.mockResolvedValue(ResultUtils.err(error));

      // Act & Assert
      await expect(controller.startBuild()).rejects.toThrow('Build failed');
      expect(notificationService.showError).toHaveBeenCalledWith('编译算子失败: Build failed');
    });

    it('should clear executor reference after build', async () => {
      // Arrange
      buildService.startBuild.mockResolvedValue(ResultUtils.ok(null));

      // Act
      await controller.startBuild();

      // Assert
      expect(projectManager.clearExecutor).toHaveBeenCalled();
    });
  });

  describe('startRun', () => {
    it('should initialize project and execute run', async () => {
      // Arrange
      const params = { configId: '2' };
      buildService.startRun.mockResolvedValue(ResultUtils.ok(null));

      // Act
      await controller.startRun(params);

      // Assert
      expect(projectManager.initProject).toHaveBeenCalled();
      expect(buildService.startRun).toHaveBeenCalledWith({
        configId: 2,
        filePath: undefined,
      });
      expect(notificationService.showInfo).toHaveBeenCalledWith('运行成功');
    });

    it('should handle run failure and show error', async () => {
      // Arrange
      const error = new Error('Run failed');
      buildService.startRun.mockResolvedValue(ResultUtils.err(error));

      // Act & Assert
      await expect(controller.startRun()).rejects.toThrow('Run failed');
      expect(notificationService.showError).toHaveBeenCalledWith('运行失败: Run failed');
    });
  });

  describe('startBuildExample', () => {
    it('should initialize project and execute build example', async () => {
      // Arrange
      const params = { configId: '3', operatorNames: ['op1'] };
      buildService.startBuildExample.mockResolvedValue(ResultUtils.ok(null));

      // Act
      await controller.startBuildExample(params);

      // Assert
      expect(projectManager.initProject).toHaveBeenCalled();
      expect(buildService.startBuildExample).toHaveBeenCalledWith({
        configId: 3,
        operatorNames: ['op1'],
        operatorType: undefined,
      });
      expect(notificationService.showInfo).toHaveBeenCalledWith('编译示例成功');
    });

    it('should handle build example failure and show error', async () => {
      // Arrange
      const error = new Error('Build example failed');
      buildService.startBuildExample.mockResolvedValue(ResultUtils.err(error));

      // Act & Assert
      await expect(controller.startBuildExample()).rejects.toThrow('Build example failed');
      expect(notificationService.showError).toHaveBeenCalledWith('编译示例失败: Build example failed');
    });
  });

  describe('configuration getters', () => {
    it('should return build config ID when service succeeds', async () => {
      // Arrange
      const configId = 123;
      buildService.getBuildConfigId.mockResolvedValue(ResultUtils.ok(configId));

      // Act
      const result = await controller.getBuildConfigId();

      // Assert
      expect(result).toBe(configId);
    });

    it('should return undefined when build config service fails', async () => {
      // Arrange
      buildService.getBuildConfigId.mockResolvedValue(ResultUtils.err(new Error('Failed')));

      // Act
      const result = await controller.getBuildConfigId();

      // Assert
      expect(result).toBeUndefined();
    });

    it('should return simulate config ID as string when service succeeds', async () => {
      // Arrange
      const configId = 456;
      buildService.getSimulateConfigId.mockResolvedValue(ResultUtils.ok(configId));

      // Act
      const result = await controller.getSimulateConfigId();

      // Assert
      expect(result).toBe('456');
    });

    it('should return empty string when simulate config service fails', async () => {
      // Arrange
      buildService.getSimulateConfigId.mockResolvedValue(ResultUtils.err(new Error('Failed')));

      // Act
      const result = await controller.getSimulateConfigId();

      // Assert
      expect(result).toBe('');
    });
  });

  describe('stopTask', () => {
    it('should stop current task if one exists', async () => {
      // Arrange
      const mockExecutor = { kill: jest.fn().mockResolvedValue(undefined) };
      (controller as any).currentExecutor = mockExecutor;

      // Act
      await controller.stopTask();

      // Assert
      expect(mockExecutor.kill).toHaveBeenCalled();
      expect(projectManager.clearExecutor).toHaveBeenCalled();
    });

    it('should handle case when no task is running', async () => {
      // Arrange
      (controller as any).currentExecutor = null;

      // Act
      await controller.stopTask();

      // Assert
      // Should not throw and should show appropriate message
    });
  });
});