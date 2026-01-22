import { BuildApplicationService } from '../build.application';
import { IConfigRepository } from '@plugin-v2/domain/operator/repositories/config.repository';
import { BuildOrchestratorService } from '@plugin-v2/domain/operator/services/build-orchestrator.service';
import { ConfigType } from '@plugin-v2/domain/operator/value-objects/config-type.vo';
import { BuildConfigEntity } from '@plugin-v2/domain/operator/entities/build-config.entity';
import { ResultUtils } from '@plugin-v2/domain/shared/types/result.type';
import { ConfigNotFoundError } from '@plugin-v2/domain/shared/errors/base.error';

describe('BuildApplicationService', () => {
  let service: BuildApplicationService;
  let mockConfigRepo: jest.Mocked<IConfigRepository>;
  let mockBuildOrchestrator: jest.Mocked<BuildOrchestratorService>;

  beforeEach(() => {
    mockConfigRepo = {
      findById: jest.fn(),
      findByType: jest.fn(),
      findAll: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    } as any;

    mockBuildOrchestrator = {
      build: jest.fn(),
      buildExample: jest.fn(),
      run: jest.fn(),
      simulate: jest.fn(),
      onBoard: jest.fn(),
      sanitizer: jest.fn(),
    } as any;

    service = new BuildApplicationService(
      mockConfigRepo,
      mockBuildOrchestrator,
    );
  });

  describe('startBuild', () => {
    it('should build with provided config ID', async () => {
      mockBuildOrchestrator.build.mockResolvedValue(ResultUtils.ok(undefined));

      const result = await service.startBuild({
        configId: 123,
        compileOption: '--debug',
      });

      expect(ResultUtils.isOk(result))
        .toBe(true);
      expect(mockBuildOrchestrator.build)
        .toHaveBeenCalledWith(123, '--debug');
      expect(mockConfigRepo.findByType).not.toHaveBeenCalled();
    });

    it('should fetch config ID when not provided', async () => {
      const mockConfig = new BuildConfigEntity(
        456,
        'build_config',
        ConfigType.BUILD_OP,
      );

      mockConfigRepo.findByType.mockResolvedValue(ResultUtils.ok(mockConfig));
      mockBuildOrchestrator.build.mockResolvedValue(ResultUtils.ok(undefined));

      const result = await service.startBuild({ compileOption: '--release' });

      expect(ResultUtils.isOk(result))
        .toBe(true);
      expect(mockConfigRepo.findByType)
        .toHaveBeenCalledWith(ConfigType.BUILD_OP);
      expect(mockBuildOrchestrator.build)
        .toHaveBeenCalledWith(
          456,
          '--release',
        );
    });

    it('should return ConfigNotFoundError when config not found', async () => {
      mockConfigRepo.findByType.mockResolvedValue(ResultUtils.err(new Error('Not found')));

      const result = await service.startBuild({});

      expect(ResultUtils.isErr(result))
        .toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error)
          .toBeInstanceOf(ConfigNotFoundError);
        expect(result.error.message)
          .toContain('build_op');
      }
    });
  });

  describe('startRun', () => {
    it('should run with provided config ID', async () => {
      mockBuildOrchestrator.run.mockResolvedValue(ResultUtils.ok(undefined));

      const result = await service.startRun({ configId: 789 });

      expect(ResultUtils.isOk(result))
        .toBe(true);
      expect(mockBuildOrchestrator.run)
        .toHaveBeenCalledWith(789);
    });

    it('should fetch run config when not provided', async () => {
      const mockConfig = new BuildConfigEntity(
        101,
        'example_config',
        ConfigType.BUILD_EXAMPLE,
      );

      mockConfigRepo.findByType.mockResolvedValue(ResultUtils.ok(mockConfig));
      mockBuildOrchestrator.run.mockResolvedValue(ResultUtils.ok(undefined));

      const result = await service.startRun({});

      expect(ResultUtils.isOk(result))
        .toBe(true);
      expect(mockConfigRepo.findByType)
        .toHaveBeenCalledWith(ConfigType.BUILD_EXAMPLE);
      expect(mockBuildOrchestrator.run)
        .toHaveBeenCalledWith(101);
    });
  });

  describe('startBuildExample', () => {
    it('should build example with config', async () => {
      mockBuildOrchestrator.buildExample.mockResolvedValue(ResultUtils.ok(undefined));

      const result = await service.startBuildExample({ configId: 202 });

      expect(ResultUtils.isOk(result))
        .toBe(true);
      expect(mockBuildOrchestrator.buildExample)
        .toHaveBeenCalledWith(202, undefined);
    });

    it('should build example with operatorNames', async () => {
      mockBuildOrchestrator.buildExample.mockResolvedValue(ResultUtils.ok(undefined));

      const result = await service.startBuildExample({
        configId: 202,
        operatorNames: 'op1,op2',
        operatorType: 'standard-custom',
      });

      expect(ResultUtils.isOk(result))
        .toBe(true);
      expect(mockBuildOrchestrator.buildExample)
        .toHaveBeenCalledWith(202, 'op1,op2');
    });
  });

  describe('startSimulate', () => {
    it('should simulate successfully with all required configs', async () => {
      const simulateConfig = new BuildConfigEntity(
        300,
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

      mockConfigRepo.findByType
        .mockResolvedValueOnce(ResultUtils.ok(simulateConfig))
        .mockResolvedValueOnce(ResultUtils.ok(buildConfig))
        .mockResolvedValueOnce(ResultUtils.ok(exampleConfig));

      mockBuildOrchestrator.simulate.mockResolvedValue(ResultUtils.ok(undefined));

      const result = await service.startSimulate();

      expect(ResultUtils.isOk(result))
        .toBe(true);
      expect(mockConfigRepo.findByType)
        .toHaveBeenCalledTimes(3);
      expect(mockBuildOrchestrator.simulate)
        .toHaveBeenCalledWith(
          100,
          300,
          200,
          'aicore',
        );
    });

    it('should use empty string for simulator type when not provided', async () => {
      const simulateConfig = new BuildConfigEntity(
        300,
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

      mockConfigRepo.findByType
        .mockResolvedValueOnce(ResultUtils.ok(simulateConfig))
        .mockResolvedValueOnce(ResultUtils.ok(buildConfig))
        .mockResolvedValueOnce(ResultUtils.ok(exampleConfig));

      mockBuildOrchestrator.simulate.mockResolvedValue(ResultUtils.ok(undefined));

      await service.startSimulate();

      expect(mockBuildOrchestrator.simulate)
        .toHaveBeenCalledWith(
          100,
          300,
          200,
          '',
        );
    });

    it('should return error when simulate config not found', async () => {
      mockConfigRepo.findByType.mockResolvedValue(ResultUtils.err(new Error('Config not found')));

      const result = await service.startSimulate();

      expect(ResultUtils.isErr(result))
        .toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error)
          .toBeInstanceOf(ConfigNotFoundError);
        expect(result.error.message)
          .toContain('simulate');
      }
    });

    it('should return error when build config not found', async () => {
      const simulateConfig = new BuildConfigEntity(
        300,
        'simulate_config',
        ConfigType.SIMULATE,
      );

      mockConfigRepo.findByType
        .mockResolvedValueOnce(ResultUtils.ok(simulateConfig))
        .mockResolvedValueOnce(ResultUtils.err(new Error('Not found')));

      const result = await service.startSimulate();

      expect(ResultUtils.isErr(result))
        .toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error)
          .toBeInstanceOf(ConfigNotFoundError);
        expect(result.error.message)
          .toContain('build_op');
      }
    });

    it('should return error when example config not found', async () => {
      const simulateConfig = new BuildConfigEntity(
        300,
        'simulate_config',
        ConfigType.SIMULATE,
      );
      const buildConfig = new BuildConfigEntity(
        100,
        'build_config',
        ConfigType.BUILD_OP,
      );

      mockConfigRepo.findByType
        .mockResolvedValueOnce(ResultUtils.ok(simulateConfig))
        .mockResolvedValueOnce(ResultUtils.ok(buildConfig))
        .mockResolvedValueOnce(ResultUtils.err(new Error('Not found')));

      const result = await service.startSimulate();

      expect(ResultUtils.isErr(result))
        .toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error)
          .toBeInstanceOf(ConfigNotFoundError);
        expect(result.error.message)
          .toContain('build_example');
      }
    });
  });

  describe('getBuildConfigId', () => {
    it('should return config ID when found', async () => {
      const mockConfig = new BuildConfigEntity(
        999,
        'config',
        ConfigType.BUILD_OP,
      );

      mockConfigRepo.findByType.mockResolvedValue(ResultUtils.ok(mockConfig));

      const result = await service.getBuildConfigId();

      expect(ResultUtils.isOk(result))
        .toBe(true);

      if (ResultUtils.isOk(result)) {
        expect(result.value)
          .toBe(999);
      }
    });

    it('should return error when config not found', async () => {
      mockConfigRepo.findByType.mockResolvedValue(ResultUtils.err(new Error('Not found')));

      const result = await service.getBuildConfigId();

      expect(ResultUtils.isErr(result))
        .toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error)
          .toBeInstanceOf(ConfigNotFoundError);
      }
    });
  });

  describe('getBuildExampleConfigId', () => {
    it('should return example config ID', async () => {
      const mockConfig = new BuildConfigEntity(
        888,
        'example',
        ConfigType.BUILD_EXAMPLE,
      );

      mockConfigRepo.findByType.mockResolvedValue(ResultUtils.ok(mockConfig));

      const result = await service.getBuildExampleConfigId();

      expect(ResultUtils.isOk(result))
        .toBe(true);

      if (ResultUtils.isOk(result)) {
        expect(result.value)
          .toBe(888);
      }
    });
  });

  describe('startOnBoard', () => {
    it('should execute onBoard successfully with all required configs', async () => {
      const onBoardConfig = new BuildConfigEntity(
        400,
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

      mockConfigRepo.findByType
        .mockResolvedValueOnce(ResultUtils.ok(onBoardConfig))
        .mockResolvedValueOnce(ResultUtils.ok(buildConfig))
        .mockResolvedValueOnce(ResultUtils.ok(exampleConfig));

      mockBuildOrchestrator.onBoard.mockResolvedValue(ResultUtils.ok(undefined));

      const result = await service.startOnBoard();

      expect(ResultUtils.isOk(result))
        .toBe(true);
      expect(mockConfigRepo.findByType)
        .toHaveBeenCalledTimes(3);
      expect(mockConfigRepo.findByType)
        .toHaveBeenCalledWith(ConfigType.ON_BOARD);
      expect(mockConfigRepo.findByType)
        .toHaveBeenCalledWith(ConfigType.BUILD_OP);
      expect(mockConfigRepo.findByType)
        .toHaveBeenCalledWith(ConfigType.BUILD_EXAMPLE);
      expect(mockBuildOrchestrator.onBoard)
        .toHaveBeenCalledWith(
          100,
          400,
          200,
        );
    });

    it('should return error when onBoard config not found', async () => {
      mockConfigRepo.findByType.mockResolvedValue(ResultUtils.err(new Error('Config not found')));

      const result = await service.startOnBoard();

      expect(ResultUtils.isErr(result))
        .toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error)
          .toBeInstanceOf(ConfigNotFoundError);
        expect(result.error.message)
          .toContain('on_board');
      }
    });

    it('should return error when build config not found', async () => {
      const onBoardConfig = new BuildConfigEntity(
        400,
        'onboard_config',
        ConfigType.ON_BOARD,
      );

      mockConfigRepo.findByType
        .mockResolvedValueOnce(ResultUtils.ok(onBoardConfig))
        .mockResolvedValueOnce(ResultUtils.err(new Error('Not found')));

      const result = await service.startOnBoard();

      expect(ResultUtils.isErr(result))
        .toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error)
          .toBeInstanceOf(ConfigNotFoundError);
        expect(result.error.message)
          .toContain('build_op');
      }
    });

    it('should return error when example config not found', async () => {
      const onBoardConfig = new BuildConfigEntity(
        400,
        'onboard_config',
        ConfigType.ON_BOARD,
      );
      const buildConfig = new BuildConfigEntity(
        100,
        'build_config',
        ConfigType.BUILD_OP,
      );

      mockConfigRepo.findByType
        .mockResolvedValueOnce(ResultUtils.ok(onBoardConfig))
        .mockResolvedValueOnce(ResultUtils.ok(buildConfig))
        .mockResolvedValueOnce(ResultUtils.err(new Error('Not found')));

      const result = await service.startOnBoard();

      expect(ResultUtils.isErr(result))
        .toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error)
          .toBeInstanceOf(ConfigNotFoundError);
        expect(result.error.message)
          .toContain('build_example');
      }
    });
  });

  describe('runSanitizer', () => {
    it('should execute sanitizer successfully with all required configs', async () => {
      const sanitizerConfig = new BuildConfigEntity(
        500,
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

      mockConfigRepo.findByType
        .mockResolvedValueOnce(ResultUtils.ok(sanitizerConfig))
        .mockResolvedValueOnce(ResultUtils.ok(buildConfig))
        .mockResolvedValueOnce(ResultUtils.ok(exampleConfig));

      mockBuildOrchestrator.sanitizer.mockResolvedValue(ResultUtils.ok(undefined));

      const result = await service.runSanitizer();

      expect(ResultUtils.isOk(result))
        .toBe(true);
      expect(mockConfigRepo.findByType)
        .toHaveBeenCalledTimes(3);
      expect(mockConfigRepo.findByType)
        .toHaveBeenCalledWith(ConfigType.SANITIZER);
      expect(mockConfigRepo.findByType)
        .toHaveBeenCalledWith(ConfigType.BUILD_OP);
      expect(mockConfigRepo.findByType)
        .toHaveBeenCalledWith(ConfigType.BUILD_EXAMPLE);
      expect(mockBuildOrchestrator.sanitizer)
        .toHaveBeenCalledWith(
          100,
          500,
          200,
        );
    });

    it('should return error when sanitizer config not found', async () => {
      mockConfigRepo.findByType.mockResolvedValue(ResultUtils.err(new Error('Config not found')));

      const result = await service.runSanitizer();

      expect(ResultUtils.isErr(result))
        .toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error)
          .toBeInstanceOf(ConfigNotFoundError);
        expect(result.error.message)
          .toContain('sanitizer');
      }
    });

    it('should return error when build config not found', async () => {
      const sanitizerConfig = new BuildConfigEntity(
        500,
        'sanitizer_config',
        ConfigType.SANITIZER,
      );

      mockConfigRepo.findByType
        .mockResolvedValueOnce(ResultUtils.ok(sanitizerConfig))
        .mockResolvedValueOnce(ResultUtils.err(new Error('Not found')));

      const result = await service.runSanitizer();

      expect(ResultUtils.isErr(result))
        .toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error)
          .toBeInstanceOf(ConfigNotFoundError);
        expect(result.error.message)
          .toContain('build_op');
      }
    });

    it('should return error when example config not found', async () => {
      const sanitizerConfig = new BuildConfigEntity(
        500,
        'sanitizer_config',
        ConfigType.SANITIZER,
      );
      const buildConfig = new BuildConfigEntity(
        100,
        'build_config',
        ConfigType.BUILD_OP,
      );

      mockConfigRepo.findByType
        .mockResolvedValueOnce(ResultUtils.ok(sanitizerConfig))
        .mockResolvedValueOnce(ResultUtils.ok(buildConfig))
        .mockResolvedValueOnce(ResultUtils.err(new Error('Not found')));

      const result = await service.runSanitizer();

      expect(ResultUtils.isErr(result))
        .toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error)
          .toBeInstanceOf(ConfigNotFoundError);
        expect(result.error.message)
          .toContain('build_example');
      }
    });
  });
});
