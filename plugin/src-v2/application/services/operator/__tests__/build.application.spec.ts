/**
 * BuildApplicationService 测试套件
 *
 * 此测试文件用于验证 BuildApplicationService 的各种功能，
 * 包括构建、运行、模拟、启动板和清理等操作。
 * 每个测试用例都覆盖了不同的场景和错误处理路径。
 */
import { BuildApplicationService } from '../build.application';
import { IConfigRepository } from '@plugin-v2/domain/operator/repositories/config.repository';
import { BuildOrchestratorService } from '@plugin-v2/domain/operator/services/build-orchestrator.service';
import { ConfigType } from '@plugin-v2/domain/operator/value-objects/config-type.vo';
import { BuildConfigEntity } from '@plugin-v2/domain/operator/entities/build-config.entity';
import { ResultUtils } from '@plugin-v2/domain/shared/types/result.type';
import { ConfigNotFoundError } from '@plugin-v2/domain/shared/errors/base.error';

// 定义常用的测试配置ID，便于维护和理解
const MOCK_BUILD_CONFIG_ID = 123;
const MOCK_RUN_CONFIG_ID = 789;
const MOCK_EXAMPLE_CONFIG_ID = 202;
const MOCK_SIMULATE_CONFIG_ID = 300;
const MOCK_ONBOARD_CONFIG_ID = 400;
const MOCK_SANITIZER_CONFIG_ID = 500;

describe('BuildApplicationService', () => {
  // 服务实例和模拟依赖项
  let service: BuildApplicationService;
  let mockConfigRepo: jest.Mocked<IConfigRepository>;
  let mockBuildOrchestrator: jest.Mocked<BuildOrchestratorService>;

  /**
   * 在每个测试之前设置模拟依赖项
   * 创建服务实例并初始化所有必要的模拟对象
   */
  beforeEach(() => {
    // 模拟配置仓库的方法
    mockConfigRepo = {
      findById: jest.fn(),
      findByType: jest.fn(),
      findAll: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    } as any;

    // 模拟构建编排器的方法
    mockBuildOrchestrator = {
      build: jest.fn(),
      buildExample: jest.fn(),
      run: jest.fn(),
      simulate: jest.fn(),
      onBoard: jest.fn(),
      sanitizer: jest.fn(),
    } as any;

    // 创建服务实例
    service = new BuildApplicationService(
      mockConfigRepo,
      mockBuildOrchestrator,
    );
  });

  /**
   * startBuild 方法测试
   * 验证构建操作在不同配置下的行为
   */
  describe('startBuild', () => {
    /**
     * 当提供配置ID时，应该使用该ID进行构建
     * 验证服务是否正确调用了构建编排器的构建方法
     */
    it('should build with provided config ID', async () => {
      // 设置模拟返回值
      mockBuildOrchestrator.build.mockResolvedValue(ResultUtils.ok(undefined));

      // 执行测试
      const result = await service.startBuild({
        configId: MOCK_BUILD_CONFIG_ID,
        compileOption: '--debug',
      });

      // 验证结果
      expect(ResultUtils.isOk(result)).toBe(true);
      expect(mockBuildOrchestrator.build).toHaveBeenCalledWith(MOCK_BUILD_CONFIG_ID, '--debug');
      // 确保没有尝试查找配置（因为已提供ID）
      expect(mockConfigRepo.findByType).not.toHaveBeenCalled();
    });

    /**
     * 当未提供配置ID时，应该自动获取默认构建配置
     * 验证服务是否正确地查找配置并使用其ID进行构建
     */
    it('should fetch config ID when not provided', async () => {
      // 创建模拟配置实体
      const mockConfig = new BuildConfigEntity(
        456,
        'build_config',
        ConfigType.BUILD_OP,
      );

      // 设置模拟返回值
      mockConfigRepo.findByType.mockResolvedValue(ResultUtils.ok(mockConfig));
      mockBuildOrchestrator.build.mockResolvedValue(ResultUtils.ok(undefined));

      // 执行测试
      const result = await service.startBuild({ compileOption: '--release' });

      // 验证结果
      expect(ResultUtils.isOk(result)).toBe(true);
      expect(mockConfigRepo.findByType).toHaveBeenCalledWith(ConfigType.BUILD_OP);
      expect(mockBuildOrchestrator.build).toHaveBeenCalledWith(456, '--release');
    });

    /**
     * 当找不到配置时，应该返回 ConfigNotFoundError
     * 验证错误处理逻辑是否正确
     */
    it('should return ConfigNotFoundError when config not found', async () => {
      // 设置模拟返回错误
      mockConfigRepo.findByType.mockResolvedValue(ResultUtils.err(new Error('Not found')));

      // 执行测试
      const result = await service.startBuild({});

      // 验证错误结果
      expect(ResultUtils.isErr(result)).toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error).toBeInstanceOf(ConfigNotFoundError);
        expect(result.error.message).toContain('build_op');
      }
    });
  });

  /**
   * startRun 方法测试
   * 验证运行操作在不同配置下的行为
   */
  describe('startRun', () => {
    /**
     * 当提供配置ID时，应该使用该ID运行
     * 验证服务是否正确调用了构建编排器的运行方法
     */
    it('should run with provided config ID', async () => {
      // 设置模拟返回值
      mockBuildOrchestrator.run.mockResolvedValue(ResultUtils.ok(undefined));

      // 执行测试
      const result = await service.startRun({ configId: MOCK_RUN_CONFIG_ID });

      // 验证结果
      expect(ResultUtils.isOk(result)).toBe(true);
      expect(mockBuildOrchestrator.run).toHaveBeenCalledWith(MOCK_RUN_CONFIG_ID);
    });

    /**
     * 当未提供配置ID时，应该自动获取默认示例配置
     * 验证服务是否正确地查找配置并使用其ID运行
     */
    it('should fetch run config when not provided', async () => {
      // 创建模拟配置实体
      const mockConfig = new BuildConfigEntity(
        101,
        'example_config',
        ConfigType.BUILD_EXAMPLE,
      );

      // 设置模拟返回值
      mockConfigRepo.findByType.mockResolvedValue(ResultUtils.ok(mockConfig));
      mockBuildOrchestrator.run.mockResolvedValue(ResultUtils.ok(undefined));

      // 执行测试
      const result = await service.startRun({});

      // 验证结果
      expect(ResultUtils.isOk(result)).toBe(true);
      expect(mockConfigRepo.findByType).toHaveBeenCalledWith(ConfigType.BUILD_EXAMPLE);
      expect(mockBuildOrchestrator.run).toHaveBeenCalledWith(101);
    });
  });

  /**
   * startBuildExample 方法测试
   * 验证构建示例操作在不同配置下的行为
   */
  describe('startBuildExample', () => {
    /**
     * 使用提供的配置ID构建示例
     * 验证服务是否正确调用了构建编排器的构建示例方法
     */
    it('should build example with config', async () => {
      // 设置模拟返回值
      mockBuildOrchestrator.buildExample.mockResolvedValue(ResultUtils.ok(undefined));

      // 执行测试
      const result = await service.startBuildExample({ configId: MOCK_EXAMPLE_CONFIG_ID });

      // 验证结果
      expect(ResultUtils.isOk(result)).toBe(true);
      expect(mockBuildOrchestrator.buildExample).toHaveBeenCalledWith(MOCK_EXAMPLE_CONFIG_ID, undefined);
    });

    /**
     * 使用操作员名称构建示例
     * 验证服务是否正确传递了操作员名称参数
     */
    it('should build example with operatorNames', async () => {
      // 设置模拟返回值
      mockBuildOrchestrator.buildExample.mockResolvedValue(ResultUtils.ok(undefined));

      // 执行测试
      const result = await service.startBuildExample({
        configId: MOCK_EXAMPLE_CONFIG_ID,
        operatorNames: 'op1,op2',
        operatorType: 'standard-custom',
      });

      // 验证结果
      expect(ResultUtils.isOk(result)).toBe(true);
      expect(mockBuildOrchestrator.buildExample).toHaveBeenCalledWith(MOCK_EXAMPLE_CONFIG_ID, 'op1,op2');
    });
  });

  /**
   * startSimulate 方法测试
   * 验证模拟操作在不同配置下的行为
   */
  describe('startSimulate', () => {
    /**
     * 使用所有必需的配置成功执行模拟
     * 验证服务是否正确获取了所有必需的配置并调用了模拟方法
     */
    it('should simulate successfully with all required configs', async () => {
      // 创建模拟配置实体
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

      // 设置模拟返回值（按顺序）
      mockConfigRepo.findByType
        .mockResolvedValueOnce(ResultUtils.ok(simulateConfig))
        .mockResolvedValueOnce(ResultUtils.ok(buildConfig))
        .mockResolvedValueOnce(ResultUtils.ok(exampleConfig));

      // 设置模拟构建编排器的返回值
      mockBuildOrchestrator.simulate.mockResolvedValue(ResultUtils.ok(undefined));

      // 执行测试
      const result = await service.startSimulate();

      // 验证结果
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
     * 当未提供模拟器类型时，应使用空字符串作为默认值
     * 验证服务是否正确处理了缺失的模拟器类型配置
     */
    it('should use empty string for simulator type when not provided', async () => {
      // 创建模拟配置实体（不包含模拟器类型）
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

      // 设置模拟返回值（按顺序）
      mockConfigRepo.findByType
        .mockResolvedValueOnce(ResultUtils.ok(simulateConfig))
        .mockResolvedValueOnce(ResultUtils.ok(buildConfig))
        .mockResolvedValueOnce(ResultUtils.ok(exampleConfig));

      // 设置模拟构建编排器的返回值
      mockBuildOrchestrator.simulate.mockResolvedValue(ResultUtils.ok(undefined));

      // 执行测试
      await service.startSimulate();

      // 验证模拟器类型参数为空字符串
      expect(mockBuildOrchestrator.simulate).toHaveBeenCalledWith(
        100,  // build config ID
        MOCK_SIMULATE_CONFIG_ID,  // simulate config ID
        200,  // example config ID
        '',  // simulator type (empty string)
      );
    });

    /**
     * 当模拟配置未找到时，应返回错误
     * 验证错误处理逻辑是否正确
     */
    it('should return error when simulate config not found', async () => {
      // 设置模拟返回错误
      mockConfigRepo.findByType.mockResolvedValue(ResultUtils.err(new Error('Config not found')));

      // 执行测试
      const result = await service.startSimulate();

      // 验证错误结果
      expect(ResultUtils.isErr(result)).toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error).toBeInstanceOf(ConfigNotFoundError);
        expect(result.error.message).toContain('simulate');
      }
    });

    /**
     * 当构建配置未找到时，应返回错误
     * 验证错误处理逻辑是否正确
     */
    it('should return error when build config not found', async () => {
      // 创建模拟配置实体
      const simulateConfig = new BuildConfigEntity(
        MOCK_SIMULATE_CONFIG_ID,
        'simulate_config',
        ConfigType.SIMULATE,
      );

      // 设置模拟返回值（第一个成功，第二个失败）
      mockConfigRepo.findByType
        .mockResolvedValueOnce(ResultUtils.ok(simulateConfig))
        .mockResolvedValueOnce(ResultUtils.err(new Error('Not found')));

      // 执行测试
      const result = await service.startSimulate();

      // 验证错误结果
      expect(ResultUtils.isErr(result)).toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error).toBeInstanceOf(ConfigNotFoundError);
        expect(result.error.message).toContain('build_op');
      }
    });

    /**
     * 当示例配置未找到时，应返回错误
     * 验证错误处理逻辑是否正确
     */
    it('should return error when example config not found', async () => {
      // 创建模拟配置实体
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

      // 设置模拟返回值（前两个成功，第三个失败）
      mockConfigRepo.findByType
        .mockResolvedValueOnce(ResultUtils.ok(simulateConfig))
        .mockResolvedValueOnce(ResultUtils.ok(buildConfig))
        .mockResolvedValueOnce(ResultUtils.err(new Error('Not found')));

      // 执行测试
      const result = await service.startSimulate();

      // 验证错误结果
      expect(ResultUtils.isErr(result)).toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error).toBeInstanceOf(ConfigNotFoundError);
        expect(result.error.message).toContain('build_example');
      }
    });
  });

  /**
   * getBuildConfigId 方法测试
   * 验证获取构建配置ID的功能
   */
  describe('getBuildConfigId', () => {
    /**
     * 当找到配置时，应返回配置ID
     * 验证服务是否正确获取了构建配置ID
     */
    it('should return config ID when found', async () => {
      // 创建模拟配置实体
      const mockConfig = new BuildConfigEntity(
        999,
        'config',
        ConfigType.BUILD_OP,
      );

      // 设置模拟返回值
      mockConfigRepo.findByType.mockResolvedValue(ResultUtils.ok(mockConfig));

      // 执行测试
      const result = await service.getBuildConfigId();

      // 验证结果
      expect(ResultUtils.isOk(result)).toBe(true);

      if (ResultUtils.isOk(result)) {
        expect(result.value).toBe(999);
      }
    });

    /**
     * 当找不到配置时，应返回错误
     * 验证错误处理逻辑是否正确
     */
    it('should return error when config not found', async () => {
      // 设置模拟返回错误
      mockConfigRepo.findByType.mockResolvedValue(ResultUtils.err(new Error('Not found')));

      // 执行测试
      const result = await service.getBuildConfigId();

      // 验证错误结果
      expect(ResultUtils.isErr(result)).toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error).toBeInstanceOf(ConfigNotFoundError);
      }
    });
  });

  /**
   * getBuildExampleConfigId 方法测试
   * 验证获取构建示例配置ID的功能
   */
  describe('getBuildExampleConfigId', () => {
    /**
     * 应返回示例配置ID
     * 验证服务是否正确获取了示例配置ID
     */
    it('should return example config ID', async () => {
      // 创建模拟配置实体
      const mockConfig = new BuildConfigEntity(
        888,
        'example',
        ConfigType.BUILD_EXAMPLE,
      );

      // 设置模拟返回值
      mockConfigRepo.findByType.mockResolvedValue(ResultUtils.ok(mockConfig));

      // 执行测试
      const result = await service.getBuildExampleConfigId();

      // 验证结果
      expect(ResultUtils.isOk(result)).toBe(true);

      if (ResultUtils.isOk(result)) {
        expect(result.value).toBe(888);
      }
    });
  });

  /**
   * startOnBoard 方法测试
   * 验证启动板操作在不同配置下的行为
   */
  describe('startOnBoard', () => {
    /**
     * 使用所有必需的配置成功执行启动板
     * 验证服务是否正确获取了所有必需的配置并调用了启动板方法
     */
    it('should execute onBoard successfully with all required configs', async () => {
      // 创建模拟配置实体
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

      // 设置模拟返回值（按顺序）
      mockConfigRepo.findByType
        .mockResolvedValueOnce(ResultUtils.ok(onBoardConfig))
        .mockResolvedValueOnce(ResultUtils.ok(buildConfig))
        .mockResolvedValueOnce(ResultUtils.ok(exampleConfig));

      // 设置模拟构建编排器的返回值
      mockBuildOrchestrator.onBoard.mockResolvedValue(ResultUtils.ok(undefined));

      // 执行测试
      const result = await service.startOnBoard();

      // 验证结果
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
     * 当启动板配置未找到时，应返回错误
     * 验证错误处理逻辑是否正确
     */
    it('should return error when onBoard config not found', async () => {
      // 设置模拟返回错误
      mockConfigRepo.findByType.mockResolvedValue(ResultUtils.err(new Error('Config not found')));

      // 执行测试
      const result = await service.startOnBoard();

      // 验证错误结果
      expect(ResultUtils.isErr(result)).toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error).toBeInstanceOf(ConfigNotFoundError);
        expect(result.error.message).toContain('on_board');
      }
    });

    /**
     * 当构建配置未找到时，应返回错误
     * 验证错误处理逻辑是否正确
     */
    it('should return error when build config not found', async () => {
      // 创建模拟配置实体
      const onBoardConfig = new BuildConfigEntity(
        MOCK_ONBOARD_CONFIG_ID,
        'onboard_config',
        ConfigType.ON_BOARD,
      );

      // 设置模拟返回值（第一个成功，第二个失败）
      mockConfigRepo.findByType
        .mockResolvedValueOnce(ResultUtils.ok(onBoardConfig))
        .mockResolvedValueOnce(ResultUtils.err(new Error('Not found')));

      // 执行测试
      const result = await service.startOnBoard();

      // 验证错误结果
      expect(ResultUtils.isErr(result)).toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error).toBeInstanceOf(ConfigNotFoundError);
        expect(result.error.message).toContain('build_op');
      }
    });

    /**
     * 当示例配置未找到时，应返回错误
     * 验证错误处理逻辑是否正确
     */
    it('should return error when example config not found', async () => {
      // 创建模拟配置实体
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

      // 设置模拟返回值（前两个成功，第三个失败）
      mockConfigRepo.findByType
        .mockResolvedValueOnce(ResultUtils.ok(onBoardConfig))
        .mockResolvedValueOnce(ResultUtils.ok(buildConfig))
        .mockResolvedValueOnce(ResultUtils.err(new Error('Not found')));

      // 执行测试
      const result = await service.startOnBoard();

      // 验证错误结果
      expect(ResultUtils.isErr(result)).toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error).toBeInstanceOf(ConfigNotFoundError);
        expect(result.error.message).toContain('build_example');
      }
    });
  });

  /**
   * runSanitizer 方法测试
   * 验证清理操作在不同配置下的行为
   */
  describe('runSanitizer', () => {
    /**
     * 使用所有必需的配置成功执行清理
     * 验证服务是否正确获取了所有必需的配置并调用了清理方法
     */
    it('should execute sanitizer successfully with all required configs', async () => {
      // 创建模拟配置实体
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

      // 设置模拟返回值（按顺序）
      mockConfigRepo.findByType
        .mockResolvedValueOnce(ResultUtils.ok(sanitizerConfig))
        .mockResolvedValueOnce(ResultUtils.ok(buildConfig))
        .mockResolvedValueOnce(ResultUtils.ok(exampleConfig));

      // 设置模拟构建编排器的返回值
      mockBuildOrchestrator.sanitizer.mockResolvedValue(ResultUtils.ok(undefined));

      // 执行测试
      const result = await service.runSanitizer();

      // 验证结果
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
     * 当清理配置未找到时，应返回错误
     * 验证错误处理逻辑是否正确
     */
    it('should return error when sanitizer config not found', async () => {
      // 设置模拟返回错误
      mockConfigRepo.findByType.mockResolvedValue(ResultUtils.err(new Error('Config not found')));

      // 执行测试
      const result = await service.runSanitizer();

      // 验证错误结果
      expect(ResultUtils.isErr(result)).toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error).toBeInstanceOf(ConfigNotFoundError);
        expect(result.error.message).toContain('sanitizer');
      }
    });

    /**
     * 当构建配置未找到时，应返回错误
     * 验证错误处理逻辑是否正确
     */
    it('should return error when build config not found', async () => {
      // 创建模拟配置实体
      const sanitizerConfig = new BuildConfigEntity(
        MOCK_SANITIZER_CONFIG_ID,
        'sanitizer_config',
        ConfigType.SANITIZER,
      );

      // 设置模拟返回值（第一个成功，第二个失败）
      mockConfigRepo.findByType
        .mockResolvedValueOnce(ResultUtils.ok(sanitizerConfig))
        .mockResolvedValueOnce(ResultUtils.err(new Error('Not found')));

      // 执行测试
      const result = await service.runSanitizer();

      // 验证错误结果
      expect(ResultUtils.isErr(result)).toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error).toBeInstanceOf(ConfigNotFoundError);
        expect(result.error.message).toContain('build_op');
      }
    });

    /**
     * 当示例配置未找到时，应返回错误
     * 验证错误处理逻辑是否正确
     */
    it('should return error when example config not found', async () => {
      // 创建模拟配置实体
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

      // 设置模拟返回值（前两个成功，第三个失败）
      mockConfigRepo.findByType
        .mockResolvedValueOnce(ResultUtils.ok(sanitizerConfig))
        .mockResolvedValueOnce(ResultUtils.ok(buildConfig))
        .mockResolvedValueOnce(ResultUtils.err(new Error('Not found')));

      // 执行测试
      const result = await service.runSanitizer();

      // 验证错误结果
      expect(ResultUtils.isErr(result)).toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error).toBeInstanceOf(ConfigNotFoundError);
        expect(result.error.message).toContain('build_example');
      }
    });
  });
});
