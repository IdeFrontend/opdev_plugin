/**
 * BuildApplicationService test suite
 *
 * Verifies BuildApplicationService behavior: build, run, simulate, on-board, sanitizer.
 * Each test covers different scenarios and error paths.
 */
import { BuildApplicationService } from '../build.application';
import { IConfigRepository } from '@plugin-v2/domain/operator/repositories/config.repository';
import { BuildOrchestratorService } from '@plugin-v2/domain/operator/services/build-orchestrator.service';
import { ConfigType } from '@plugin-v2/domain/operator/value-objects/config-type.vo';
import { BuildConfigEntity } from '@plugin-v2/domain/operator/entities/build-config.entity';
import { ResultUtils } from '@plugin-v2/domain/shared/types/result.type';
import { ConfigNotFoundError } from '@plugin-v2/domain/shared/errors/base.error';

// Common test config IDs for maintainability
const MOCK_BUILD_CONFIG_ID = 123;
const MOCK_RUN_CONFIG_ID = 789;
const MOCK_EXAMPLE_CONFIG_ID = 202;
const MOCK_SIMULATE_CONFIG_ID = 300;
const MOCK_ONBOARD_CONFIG_ID = 400;
const MOCK_SANITIZER_CONFIG_ID = 500;

describe('BuildApplicationService', () => {
  // Service instance and mocks
  let service: BuildApplicationService;
  let mockConfigRepo: jest.Mocked<IConfigRepository>;
  let mockBuildOrchestrator: jest.Mocked<BuildOrchestratorService>;

  /**
   * Before each test: set up mocks and create service instance
   */
  beforeEach(() => {
    // Mock config repo
    mockConfigRepo = {
      findById: jest.fn(),
      findByType: jest.fn(),
      findAll: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    } as any;

    // Mock build orchestrator
    mockBuildOrchestrator = {
      build: jest.fn(),
      buildExample: jest.fn(),
      run: jest.fn(),
      simulate: jest.fn(),
      onBoard: jest.fn(),
      sanitizer: jest.fn(),
    } as any;

    // Create service instance
    service = new BuildApplicationService(
      mockConfigRepo,
      mockBuildOrchestrator,
    );
  });

  /**
   * startBuild tests
   */
  describe('startBuild', () => {
    /**
     * When config ID provided, use it for build
     */
    it('should build with provided config ID', async () => {
      // Setup mock return
      mockBuildOrchestrator.build.mockResolvedValue(ResultUtils.ok(undefined));

      // Execute
      const result = await service.startBuild({
        configId: MOCK_BUILD_CONFIG_ID,
        compileOption: '--debug',
      });

      // Assert
      expect(ResultUtils.isOk(result)).toBe(true);
      expect(mockBuildOrchestrator.build).toHaveBeenCalledWith(MOCK_BUILD_CONFIG_ID, '--debug');
      // Should not look up config when ID provided
      expect(mockConfigRepo.findByType).not.toHaveBeenCalled();
    });

    /**
     * When config ID not provided, fetch default build config
     */
    it('should fetch config ID when not provided', async () => {
      // Mock config entity
      const mockConfig = new BuildConfigEntity(
        456,
        'build_config',
        ConfigType.BUILD_OP,
      );

      // Setup mock returns
      mockConfigRepo.findByType.mockResolvedValue(ResultUtils.ok(mockConfig));
      mockBuildOrchestrator.build.mockResolvedValue(ResultUtils.ok(undefined));

      // Execute
      const result = await service.startBuild({ compileOption: '--release' });

      // Assert
      expect(ResultUtils.isOk(result)).toBe(true);
      expect(mockConfigRepo.findByType).toHaveBeenCalledWith(ConfigType.BUILD_OP);
      expect(mockBuildOrchestrator.build).toHaveBeenCalledWith(456, '--release');
    });

    /**
     * When config not found, return ConfigNotFoundError
     */
    it('should return ConfigNotFoundError when config not found', async () => {
      // Mock error
      mockConfigRepo.findByType.mockResolvedValue(ResultUtils.err(new Error('Not found')));

      // Execute
      const result = await service.startBuild({});

      // Assert error
      expect(ResultUtils.isErr(result)).toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error).toBeInstanceOf(ConfigNotFoundError);
        expect(result.error.message).toContain('build_op');
      }
    });
  });

  /**
   * startRun tests
   */
  describe('startRun', () => {
    /**
     * When config ID provided, use it for run
     */
    it('should run with provided config ID', async () => {
      // Setup mock return
      mockBuildOrchestrator.run.mockResolvedValue(ResultUtils.ok(undefined));

      // Execute
      const result = await service.startRun({ configId: MOCK_RUN_CONFIG_ID });

      // Assert
      expect(ResultUtils.isOk(result)).toBe(true);
      expect(mockBuildOrchestrator.run).toHaveBeenCalledWith(MOCK_RUN_CONFIG_ID);
    });

    /**
     * When config ID not provided, fetch default run (example) config
     */
    it('should fetch run config when not provided', async () => {
      // Mock config entity
      const mockConfig = new BuildConfigEntity(
        101,
        'example_config',
        ConfigType.BUILD_EXAMPLE,
      );

      // Setup mock return
      mockConfigRepo.findByType.mockResolvedValue(ResultUtils.ok(mockConfig));
      mockBuildOrchestrator.run.mockResolvedValue(ResultUtils.ok(undefined));

      // Execute
      const result = await service.startRun({});

      // Assert
      expect(ResultUtils.isOk(result)).toBe(true);
      expect(mockConfigRepo.findByType).toHaveBeenCalledWith(ConfigType.BUILD_EXAMPLE);
      expect(mockBuildOrchestrator.run).toHaveBeenCalledWith(101);
    });
  });

  /**
   * startBuildExample tests
   */
  describe('startBuildExample', () => {
    /**
     * Build example with provided config ID
     */
    it('should build example with config', async () => {
      // Setup mock return
      mockBuildOrchestrator.buildExample.mockResolvedValue(ResultUtils.ok(undefined));

      // Execute
      const result = await service.startBuildExample({ configId: MOCK_EXAMPLE_CONFIG_ID });

      // Assert
      expect(ResultUtils.isOk(result)).toBe(true);
      expect(mockBuildOrchestrator.buildExample).toHaveBeenCalledWith(MOCK_EXAMPLE_CONFIG_ID, undefined);
    });

    /**
     * Build example with operator names
     */
    it('should build example with operatorNames', async () => {
      // Setup mock return
      mockBuildOrchestrator.buildExample.mockResolvedValue(ResultUtils.ok(undefined));

      // Execute
      const result = await service.startBuildExample({
        configId: MOCK_EXAMPLE_CONFIG_ID,
        operatorNames: 'op1,op2',
        operatorType: 'standard-custom',
      });

      // Assert
      expect(ResultUtils.isOk(result)).toBe(true);
      expect(mockBuildOrchestrator.buildExample).toHaveBeenCalledWith(MOCK_EXAMPLE_CONFIG_ID, 'op1,op2');
    });
  });

  /**
   * startSimulate tests
   */
  describe('startSimulate', () => {
    /**
     * Successfully run simulate with all required configs
     */
    it('should simulate successfully with all required configs', async () => {
      // Mock config entity
      const simulateConfig = new BuildConfigEntity(
        MOCK_SIMULATE_CONFIG_ID,
        'simulate_config',
        ConfigType.SIMULATE,
        { simulatorType: 'aicore' },
      );
      const buildConfig = new BuildConfigEntity(
        100,
        'build_config',
        ConfigType.BUILD_OP,
      );
      const exampleConfig = new BuildConfigEntity(
        200,
        'example_config',
        ConfigType.BUILD_EXAMPLE,
      );

      // Setup mock returns (in order)
      mockConfigRepo.findByType
        .mockResolvedValueOnce(ResultUtils.ok(simulateConfig))
        .mockResolvedValueOnce(ResultUtils.ok(buildConfig))
        .mockResolvedValueOnce(ResultUtils.ok(exampleConfig));

      // Mock build orchestrator return
      mockBuildOrchestrator.simulate.mockResolvedValue(ResultUtils.ok(undefined));

      // Execute
      const result = await service.startSimulate();

      // Assert
      expect(ResultUtils.isOk(result)).toBe(true);
      expect(mockConfigRepo.findByType).toHaveBeenCalledTimes(3);
      expect(mockBuildOrchestrator.simulate).toHaveBeenCalledWith(
        100,  // build config ID
        MOCK_SIMULATE_CONFIG_ID,  // simulate config ID
        200,  // example config ID
        'aicore',  // simulator type
      );
    });

    /**
     * When simulator type not provided, use empty string
     */
    it('should use empty string for simulator type when not provided', async () => {
      // Mock config entity (no simulator type)
      const simulateConfig = new BuildConfigEntity(
        MOCK_SIMULATE_CONFIG_ID,
        'simulate_config',
        ConfigType.SIMULATE,
        {},
      );
      const buildConfig = new BuildConfigEntity(
        100,
        'build_config',
        ConfigType.BUILD_OP,
      );
      const exampleConfig = new BuildConfigEntity(
        200,
        'example_config',
        ConfigType.BUILD_EXAMPLE,
      );

      // Setup mock returns (in order)
      mockConfigRepo.findByType
        .mockResolvedValueOnce(ResultUtils.ok(simulateConfig))
        .mockResolvedValueOnce(ResultUtils.ok(buildConfig))
        .mockResolvedValueOnce(ResultUtils.ok(exampleConfig));

      // Mock build orchestrator return
      mockBuildOrchestrator.simulate.mockResolvedValue(ResultUtils.ok(undefined));

      // Execute
      await service.startSimulate();

      // Assert simulator type param is empty string
      expect(mockBuildOrchestrator.simulate).toHaveBeenCalledWith(
        100,  // build config ID
        MOCK_SIMULATE_CONFIG_ID,  // simulate config ID
        200,  // example config ID
        '',  // simulator type (empty string)
      );
    });

    /**
     * When simulate config not found, return error
     */
    it('should return error when simulate config not found', async () => {
      // Mock error
      mockConfigRepo.findByType.mockResolvedValue(ResultUtils.err(new Error('Config not found')));

      // Execute
      const result = await service.startSimulate();

      // Assert error
      expect(ResultUtils.isErr(result)).toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error).toBeInstanceOf(ConfigNotFoundError);
        expect(result.error.message).toContain('simulate');
      }
    });

    /**
     * When build config not found, return error
     */
    it('should return error when build config not found', async () => {
      // Mock config entity
      const simulateConfig = new BuildConfigEntity(
        MOCK_SIMULATE_CONFIG_ID,
        'simulate_config',
        ConfigType.SIMULATE,
      );

      // Mock: first success, second fail
      mockConfigRepo.findByType
        .mockResolvedValueOnce(ResultUtils.ok(simulateConfig))
        .mockResolvedValueOnce(ResultUtils.err(new Error('Not found')));

      // Execute
      const result = await service.startSimulate();

      // Assert error
      expect(ResultUtils.isErr(result)).toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error).toBeInstanceOf(ConfigNotFoundError);
        expect(result.error.message).toContain('build_op');
      }
    });

    /**
     * When example config not found, return error
     */
    it('should return error when example config not found', async () => {
      // Mock config entity
      const simulateConfig = new BuildConfigEntity(
        MOCK_SIMULATE_CONFIG_ID,
        'simulate_config',
        ConfigType.SIMULATE,
      );
      const buildConfig = new BuildConfigEntity(
        100,
        'build_config',
        ConfigType.BUILD_OP,
      );

      // Mock: first two success, third fail
      mockConfigRepo.findByType
        .mockResolvedValueOnce(ResultUtils.ok(simulateConfig))
        .mockResolvedValueOnce(ResultUtils.ok(buildConfig))
        .mockResolvedValueOnce(ResultUtils.err(new Error('Not found')));

      // Execute
      const result = await service.startSimulate();

      // Assert error
      expect(ResultUtils.isErr(result)).toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error).toBeInstanceOf(ConfigNotFoundError);
        expect(result.error.message).toContain('build_example');
      }
    });
  });

  /**
   * getBuildConfigId tests
   */
  describe('getBuildConfigId', () => {
    /**
     * Return config ID when config found
     */
    it('should return config ID when found', async () => {
      // Mock config entity
      const mockConfig = new BuildConfigEntity(
        999,
        'config',
        ConfigType.BUILD_OP,
      );

      // Setup mock return
      mockConfigRepo.findByType.mockResolvedValue(ResultUtils.ok(mockConfig));

      // Execute
      const result = await service.getBuildConfigId();

      // Assert
      expect(ResultUtils.isOk(result)).toBe(true);

      if (ResultUtils.isOk(result)) {
        expect(result.value).toBe(999);
      }
    });

    /**
     * Return error when config not found
     */
    it('should return error when config not found', async () => {
      // Mock error
      mockConfigRepo.findByType.mockResolvedValue(ResultUtils.err(new Error('Not found')));

      // Execute
      const result = await service.getBuildConfigId();

      // Assert error
      expect(ResultUtils.isErr(result)).toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error).toBeInstanceOf(ConfigNotFoundError);
      }
    });
  });

  /**
   * getBuildExampleConfigId tests
   */
  describe('getBuildExampleConfigId', () => {
    /**
     * Return example config ID
     */
    it('should return example config ID', async () => {
      // Mock config entity
      const mockConfig = new BuildConfigEntity(
        888,
        'example',
        ConfigType.BUILD_EXAMPLE,
      );

      // Setup mock return
      mockConfigRepo.findByType.mockResolvedValue(ResultUtils.ok(mockConfig));

      // Execute
      const result = await service.getBuildExampleConfigId();

      // Assert
      expect(ResultUtils.isOk(result)).toBe(true);

      if (ResultUtils.isOk(result)) {
        expect(result.value).toBe(888);
      }
    });
  });

  /**
   * startOnBoard tests
   */
  describe('startOnBoard', () => {
    /**
     * Successfully run on-board with all required configs
     */
    it('should execute onBoard successfully with all required configs', async () => {
      // Mock config entity
      const onBoardConfig = new BuildConfigEntity(
        MOCK_ONBOARD_CONFIG_ID,
        'onboard_config',
        ConfigType.ON_BOARD,
      );
      const buildConfig = new BuildConfigEntity(
        100,
        'build_config',
        ConfigType.BUILD_OP,
      );
      const exampleConfig = new BuildConfigEntity(
        200,
        'example_config',
        ConfigType.BUILD_EXAMPLE,
      );

      // Setup mock returns (in order)
      mockConfigRepo.findByType
        .mockResolvedValueOnce(ResultUtils.ok(onBoardConfig))
        .mockResolvedValueOnce(ResultUtils.ok(buildConfig))
        .mockResolvedValueOnce(ResultUtils.ok(exampleConfig));

      // Mock build orchestrator return
      mockBuildOrchestrator.onBoard.mockResolvedValue(ResultUtils.ok(undefined));

      // Execute
      const result = await service.startOnBoard();

      // Assert
      expect(ResultUtils.isOk(result)).toBe(true);
      expect(mockConfigRepo.findByType).toHaveBeenCalledTimes(3);
      expect(mockConfigRepo.findByType).toHaveBeenCalledWith(ConfigType.ON_BOARD);
      expect(mockConfigRepo.findByType).toHaveBeenCalledWith(ConfigType.BUILD_OP);
      expect(mockConfigRepo.findByType).toHaveBeenCalledWith(ConfigType.BUILD_EXAMPLE);
      expect(mockBuildOrchestrator.onBoard).toHaveBeenCalledWith(
        100,  // build config ID
        MOCK_ONBOARD_CONFIG_ID,  // on board config ID
        200,  // example config ID
      );
    });

    /**
     * When on-board config not found, return error
     */
    it('should return error when onBoard config not found', async () => {
      // Mock error
      mockConfigRepo.findByType.mockResolvedValue(ResultUtils.err(new Error('Config not found')));

      // Execute
      const result = await service.startOnBoard();

      // Assert error
      expect(ResultUtils.isErr(result)).toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error).toBeInstanceOf(ConfigNotFoundError);
        expect(result.error.message).toContain('on_board');
      }
    });

    /**
     * When build config not found, return error
     */
    it('should return error when build config not found', async () => {
      // Mock config entity
      const onBoardConfig = new BuildConfigEntity(
        MOCK_ONBOARD_CONFIG_ID,
        'onboard_config',
        ConfigType.ON_BOARD,
      );

      // Mock: first success, second fail
      mockConfigRepo.findByType
        .mockResolvedValueOnce(ResultUtils.ok(onBoardConfig))
        .mockResolvedValueOnce(ResultUtils.err(new Error('Not found')));

      // Execute
      const result = await service.startOnBoard();

      // Assert error
      expect(ResultUtils.isErr(result)).toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error).toBeInstanceOf(ConfigNotFoundError);
        expect(result.error.message).toContain('build_op');
      }
    });

    /**
     * When example config not found, return error
     */
    it('should return error when example config not found', async () => {
      // Mock config entity
      const onBoardConfig = new BuildConfigEntity(
        MOCK_ONBOARD_CONFIG_ID,
        'onboard_config',
        ConfigType.ON_BOARD,
      );
      const buildConfig = new BuildConfigEntity(
        100,
        'build_config',
        ConfigType.BUILD_OP,
      );

      // Mock: first two success, third fail
      mockConfigRepo.findByType
        .mockResolvedValueOnce(ResultUtils.ok(onBoardConfig))
        .mockResolvedValueOnce(ResultUtils.ok(buildConfig))
        .mockResolvedValueOnce(ResultUtils.err(new Error('Not found')));

      // Execute
      const result = await service.startOnBoard();

      // Assert error
      expect(ResultUtils.isErr(result)).toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error).toBeInstanceOf(ConfigNotFoundError);
        expect(result.error.message).toContain('build_example');
      }
    });
  });

  /**
   * runSanitizer tests
   */
  describe('runSanitizer', () => {
    /**
     * Successfully run sanitizer with all required configs
     */
    it('should execute sanitizer successfully with all required configs', async () => {
      // Mock config entity
      const sanitizerConfig = new BuildConfigEntity(
        MOCK_SANITIZER_CONFIG_ID,
        'sanitizer_config',
        ConfigType.SANITIZER,
      );
      const buildConfig = new BuildConfigEntity(
        100,
        'build_config',
        ConfigType.BUILD_OP,
      );
      const exampleConfig = new BuildConfigEntity(
        200,
        'example_config',
        ConfigType.BUILD_EXAMPLE,
      );

      // Setup mock returns (in order)
      mockConfigRepo.findByType
        .mockResolvedValueOnce(ResultUtils.ok(sanitizerConfig))
        .mockResolvedValueOnce(ResultUtils.ok(buildConfig))
        .mockResolvedValueOnce(ResultUtils.ok(exampleConfig));

      // Mock build orchestrator return
      mockBuildOrchestrator.sanitizer.mockResolvedValue(ResultUtils.ok(undefined));

      // Execute
      const result = await service.runSanitizer();

      // Assert
      expect(ResultUtils.isOk(result)).toBe(true);
      expect(mockConfigRepo.findByType).toHaveBeenCalledTimes(3);
      expect(mockConfigRepo.findByType).toHaveBeenCalledWith(ConfigType.SANITIZER);
      expect(mockConfigRepo.findByType).toHaveBeenCalledWith(ConfigType.BUILD_OP);
      expect(mockConfigRepo.findByType).toHaveBeenCalledWith(ConfigType.BUILD_EXAMPLE);
      expect(mockBuildOrchestrator.sanitizer).toHaveBeenCalledWith(
        100,  // build config ID
        MOCK_SANITIZER_CONFIG_ID,  // sanitizer config ID
        200,  // example config ID
      );
    });

    /**
     * When sanitizer config not found, return error
     */
    it('should return error when sanitizer config not found', async () => {
      // Mock error
      mockConfigRepo.findByType.mockResolvedValue(ResultUtils.err(new Error('Config not found')));

      // Execute
      const result = await service.runSanitizer();

      // Assert error
      expect(ResultUtils.isErr(result)).toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error).toBeInstanceOf(ConfigNotFoundError);
        expect(result.error.message).toContain('sanitizer');
      }
    });

    /**
     * When build config not found, return error
     */
    it('should return error when build config not found', async () => {
      // Mock config entity
      const sanitizerConfig = new BuildConfigEntity(
        MOCK_SANITIZER_CONFIG_ID,
        'sanitizer_config',
        ConfigType.SANITIZER,
      );

      // Mock: first success, second fail
      mockConfigRepo.findByType
        .mockResolvedValueOnce(ResultUtils.ok(sanitizerConfig))
        .mockResolvedValueOnce(ResultUtils.err(new Error('Not found')));

      // Execute
      const result = await service.runSanitizer();

      // Assert error
      expect(ResultUtils.isErr(result)).toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error).toBeInstanceOf(ConfigNotFoundError);
        expect(result.error.message).toContain('build_op');
      }
    });

    /**
     * When example config not found, return error
     */
    it('should return error when example config not found', async () => {
      // Mock config entity
      const sanitizerConfig = new BuildConfigEntity(
        MOCK_SANITIZER_CONFIG_ID,
        'sanitizer_config',
        ConfigType.SANITIZER,
      );
      const buildConfig = new BuildConfigEntity(
        100,
        'build_config',
        ConfigType.BUILD_OP,
      );

      // Mock: first two success, third fail
      mockConfigRepo.findByType
        .mockResolvedValueOnce(ResultUtils.ok(sanitizerConfig))
        .mockResolvedValueOnce(ResultUtils.ok(buildConfig))
        .mockResolvedValueOnce(ResultUtils.err(new Error('Not found')));

      // Execute
      const result = await service.runSanitizer();

      // Assert error
      expect(ResultUtils.isErr(result)).toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error).toBeInstanceOf(ConfigNotFoundError);
        expect(result.error.message).toContain('build_example');
      }
    });
  });
});
