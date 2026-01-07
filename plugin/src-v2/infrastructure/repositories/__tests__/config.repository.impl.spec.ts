import { ConfigRepositoryImpl } from '../config.repository.impl';
import { BuildConfigEntity } from '@plugin-v2/domain/operator/entities/build-config.entity';
import { ConfigType } from '@plugin-v2/domain/operator/value-objects/config-type.vo';
import { ResultUtils } from '@plugin-v2/domain/shared/types/result.type';
import {
  getConfig, postConfig,
} from '@plugin/domain';

// Mock the domain functions
jest.mock('@plugin/domain', () => ({
  getConfig: jest.fn(),
  postConfig: jest.fn(),
}));

describe('ConfigRepositoryImpl', () => {
  let repository: ConfigRepositoryImpl;
  const mockProjectId = 12345;

  beforeEach(() => {
    repository = new ConfigRepositoryImpl(mockProjectId);
    jest.clearAllMocks();
  });

  describe('findByType', () => {
    it('should find config by ConfigType value object', async () => {
      const mockConfig = {
        config_id: 100,
        config_name: 'Test Build Config',
        config_type: 'build_op',
        user_options: {},
      };

      (getConfig as jest.Mock).mockResolvedValue([mockConfig]);

      const result = await repository.findByType(ConfigType.BUILD_OP);

      expect(ResultUtils.isOk(result))
        .toBe(true);

      if (ResultUtils.isOk(result)) {
        expect(result.value.configId)
          .toBe(100);
        expect(result.value.configName)
          .toBe('Test Build Config');
        expect(result.value.configType.value)
          .toBe('build_op');
      }

      expect(getConfig)
        .toHaveBeenCalledWith(mockProjectId, 'build_op');
    });

    it('should find config by string config type', async () => {
      const mockConfig = {
        config_id: 200,
        config_name: 'Test Simulate Config',
        config_type: 'simulate',
        user_options: {},
      };

      (getConfig as jest.Mock).mockResolvedValue([mockConfig]);

      const result = await repository.findByType('simulate');

      expect(ResultUtils.isOk(result))
        .toBe(true);

      if (ResultUtils.isOk(result)) {
        expect(result.value.configId)
          .toBe(200);
        expect(result.value.configType.value)
          .toBe('simulate');
      }

      expect(getConfig)
        .toHaveBeenCalledWith(mockProjectId, 'simulate');
    });

    it('should return ConfigNotFoundError when no configs found', async () => {
      (getConfig as jest.Mock).mockResolvedValue([]);

      const result = await repository.findByType(ConfigType.BUILD_EXAMPLE);

      expect(ResultUtils.isErr(result))
        .toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error.code)
          .toBe('CONFIG_NOT_FOUND');
        expect(result.error.message)
          .toContain('build_example');
      }
    });

    it('should return ConfigNotFoundError when configs is null', async () => {
      (getConfig as jest.Mock).mockResolvedValue(null);

      const result = await repository.findByType('on_board');

      expect(ResultUtils.isErr(result))
        .toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error.code)
          .toBe('CONFIG_NOT_FOUND');
      }
    });

    it('should handle errors from getConfig', async () => {
      const mockError = new Error('Database connection failed');

      (getConfig as jest.Mock).mockRejectedValue(mockError);

      const result = await repository.findByType(ConfigType.BUILD_OP);

      expect(ResultUtils.isErr(result))
        .toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error.message)
          .toBe('Database connection failed');
      }
    });

    it('should return error when entity parsing fails', async () => {
      const mockInvalidConfig = {
        config_id: 300,
        config_name: 'Invalid Config',
        config_type: 'invalid_type', // This should fail ConfigType.fromString
        user_options: {},
      };

      (getConfig as jest.Mock).mockResolvedValue([mockInvalidConfig]);

      const result = await repository.findByType('invalid_type');

      expect(ResultUtils.isErr(result))
        .toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error.message)
          .toContain('无法解析配置类型');
      }
    });
  });

  describe('findAll', () => {
    it('should fetch and merge all config types', async () => {
      const mockOpConfigs = [
        {
          config_id: 1,
          config_name: 'Op Config 1',
          config_type: 'build_op',
          user_options: {},
        },
      ];

      const mockExampleConfigs = [
        {
          config_id: 2,
          config_name: 'Example Config 1',
          config_type: 'build_example',
          user_options: {},
        },
      ];

      const mockSimulateConfigs = [
        {
          config_id: 3,
          config_name: 'Simulate Config 1',
          config_type: 'simulate',
          user_options: {},
        },
      ];

      const mockOnBoardConfigs = [
        {
          config_id: 4,
          config_name: 'OnBoard Config 1',
          config_type: 'on_board',
          user_options: {},
        },
      ];

      (getConfig as jest.Mock)
        .mockResolvedValueOnce(mockOpConfigs)
        .mockResolvedValueOnce(mockExampleConfigs)
        .mockResolvedValueOnce(mockSimulateConfigs)
        .mockResolvedValueOnce(mockOnBoardConfigs);

      const result = await repository.findAll();

      expect(ResultUtils.isOk(result))
        .toBe(true);

      if (ResultUtils.isOk(result)) {
        expect(result.value)
          .toHaveLength(4);
        expect(result.value[0].configId)
          .toBe(1);
        expect(result.value[1].configId)
          .toBe(2);
        expect(result.value[2].configId)
          .toBe(3);
        expect(result.value[3].configId)
          .toBe(4);
      }

      expect(getConfig)
        .toHaveBeenCalledTimes(4);
      expect(getConfig)
        .toHaveBeenCalledWith(mockProjectId, 'build_op');
      expect(getConfig)
        .toHaveBeenCalledWith(mockProjectId, 'build_example');
      expect(getConfig)
        .toHaveBeenCalledWith(mockProjectId, 'simulate');
      expect(getConfig)
        .toHaveBeenCalledWith(mockProjectId, 'on_board');
    });

    it('should filter out invalid configs that fail entity parsing', async () => {
      const mockConfigs = [
        {
          config_id: 1,
          config_name: 'Valid Config',
          config_type: 'build_op',
          user_options: {},
        },
        {
          config_id: 2,
          config_name: 'Invalid Config',
          config_type: 'unknown_type', // Invalid type
          user_options: {},
        },
      ];

      (getConfig as jest.Mock)
        .mockResolvedValueOnce(mockConfigs)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await repository.findAll();

      expect(ResultUtils.isOk(result))
        .toBe(true);

      if (ResultUtils.isOk(result)) {
        // Only valid config should be returned
        expect(result.value)
          .toHaveLength(1);
        expect(result.value[0].configId)
          .toBe(1);
      }
    });

    it('should handle errors from getConfig', async () => {
      const mockError = new Error('Network error');

      (getConfig as jest.Mock).mockRejectedValue(mockError);

      const result = await repository.findAll();

      expect(ResultUtils.isErr(result))
        .toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error.message)
          .toBe('Network error');
      }
    });

    it('should return empty array when all config types are empty', async () => {
      (getConfig as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await repository.findAll();

      expect(ResultUtils.isOk(result))
        .toBe(true);

      if (ResultUtils.isOk(result)) {
        expect(result.value)
          .toHaveLength(0);
      }
    });
  });

  describe('findById', () => {
    it('should find config by ID from all configs', async () => {
      const mockConfigs = [
        {
          config_id: 100,
          config_name: 'Config 100',
          config_type: 'build_op',
          user_options: {},
        },
        {
          config_id: 200,
          config_name: 'Config 200',
          config_type: 'simulate',
          user_options: {},
        },
      ];

      (getConfig as jest.Mock)
        .mockResolvedValueOnce(mockConfigs)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await repository.findById(200);

      expect(ResultUtils.isOk(result))
        .toBe(true);

      if (ResultUtils.isOk(result)) {
        expect(result.value.configId)
          .toBe(200);
        expect(result.value.configName)
          .toBe('Config 200');
      }
    });

    it('should return ConfigNotFoundError when ID not found', async () => {
      (getConfig as jest.Mock)
        .mockResolvedValueOnce([
          {
            config_id: 100,
            config_name: 'Config 100',
            config_type: 'build_op',
            user_options: {},
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await repository.findById(999);

      expect(ResultUtils.isErr(result))
        .toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error.code)
          .toBe('CONFIG_NOT_FOUND');
        expect(result.error.message)
          .toContain('999');
      }
    });

    it('should propagate errors from findAll', async () => {
      const mockError = new Error('Database error');

      (getConfig as jest.Mock).mockRejectedValue(mockError);

      const result = await repository.findById(100);

      expect(ResultUtils.isErr(result))
        .toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error.message)
          .toBe('Database error');
      }
    });
  });

  describe('save', () => {
    it('should save configs successfully', async () => {
      const mockEntities = [
        BuildConfigEntity.create(
          1,
          'Config 1',
          ConfigType.BUILD_OP,
          {},
        ),
        BuildConfigEntity.create(
          2,
          'Config 2',
          ConfigType.BUILD_EXAMPLE,
          {},
        ),
      ];

      (postConfig as jest.Mock).mockResolvedValue(undefined);

      const result = await repository.save(mockEntities);

      expect(ResultUtils.isOk(result))
        .toBe(true);
      expect(postConfig)
        .toHaveBeenCalledWith('build', [
          {
            config_id: 1,
            config_name: 'Config 1',
            config_type: 'build_op',
            user_options: {},
          },
          {
            config_id: 2,
            config_name: 'Config 2',
            config_type: 'build_example',
            user_options: {},
          },
        ]);
    });

    it('should handle errors from postConfig', async () => {
      const mockError = new Error('Save failed');

      (postConfig as jest.Mock).mockRejectedValue(mockError);

      const mockEntities = [BuildConfigEntity.create(1, 'Config 1', ConfigType.BUILD_OP, {})];

      const result = await repository.save(mockEntities);

      expect(ResultUtils.isErr(result))
        .toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error.message)
          .toBe('Save failed');
      }
    });

    it('should save empty array successfully', async () => {
      (postConfig as jest.Mock).mockResolvedValue(undefined);

      const result = await repository.save([]);

      expect(ResultUtils.isOk(result))
        .toBe(true);
      expect(postConfig)
        .toHaveBeenCalledWith('build', []);
    });
  });
});
