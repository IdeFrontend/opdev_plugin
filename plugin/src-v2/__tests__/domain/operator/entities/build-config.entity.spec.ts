import { BuildConfigEntity } from '../../../../domain/operator/entities/build-config.entity';
import { ConfigType } from '../../../../domain/operator/value-objects/config-type.vo';

describe('BuildConfigEntity', () => {
  describe('constructor', () => {
    it('should create entity with provided parameters', () => {
      // Arrange
      const configId = 1;
      const configName = 'Test Config';
      const configType = ConfigType.BUILD_OP;
      const userOptions = { option1: 'value1' };

      // Act
      const entity = new BuildConfigEntity(
        configId,
        configName,
        configType,
        userOptions,
      );

      // Assert
      expect(entity.configId)
        .toBe(configId);
      expect(entity.configName)
        .toBe(configName);
      expect(entity.configType)
        .toBe(configType);
      expect(entity.userOptions)
        .toEqual(userOptions);
    });

    it('should create entity with optional userOptions as undefined', () => {
      // Arrange
      const configId = 1;
      const configName = 'Test Config';
      const configType = ConfigType.BUILD_OP;

      // Act
      const entity = new BuildConfigEntity(
        configId,
        configName,
        configType,
      );

      // Assert
      expect(entity.configId)
        .toBe(configId);
      expect(entity.configName)
        .toBe(configName);
      expect(entity.configType)
        .toBe(configType);
      expect(entity.userOptions)
        .toBeUndefined();
    });
  });

  describe('fromRaw', () => {
    it('should create entity from raw data with valid config type', () => {
      // Arrange
      const rawData = {
        config_id: 1,
        config_name: 'Test Config',
        config_type: 'build_op',
        user_options: { option1: 'value1' },
      };

      // Act
      const entity = BuildConfigEntity.fromRaw(rawData);

      // Assert
      expect(entity)
        .toBeDefined();
      expect(entity!.configId)
        .toBe(1);
      expect(entity!.configName)
        .toBe('Test Config');
      expect(entity!.configType.equals(ConfigType.BUILD_OP))
        .toBeTruthy();
      expect(entity!.userOptions)
        .toEqual({ option1: 'value1' });
    });

    it('should return undefined for invalid config type', () => {
      // Arrange
      const rawData = {
        config_id: 1,
        config_name: 'Test Config',
        config_type: 'invalid_type',
        user_options: { option1: 'value1' },
      };

      // Act
      const entity = BuildConfigEntity.fromRaw(rawData);

      // Assert
      expect(entity)
        .toBeUndefined();
    });

    it('should handle missing user_options', () => {
      // Arrange
      const rawData = {
        config_id: 1,
        config_name: 'Test Config',
        config_type: 'build_op',
      };

      // Act
      const entity = BuildConfigEntity.fromRaw(rawData);

      // Assert
      expect(entity)
        .toBeDefined();
      expect(entity!.configId)
        .toBe(1);
      expect(entity!.configName)
        .toBe('Test Config');
      expect(entity!.configType.equals(ConfigType.BUILD_OP))
        .toBeTruthy();
      expect(entity!.userOptions)
        .toBeUndefined();
    });
  });

  describe('toRaw', () => {
    it('should convert entity to raw data format', () => {
      // Arrange
      const entity = new BuildConfigEntity(
        1,
        'Test Config',
        ConfigType.BUILD_OP,
        { option1: 'value1' },
      );

      // Act
      const rawData = entity.toRaw();

      // Assert
      expect(rawData)
        .toEqual({
          config_id: 1,
          config_name: 'Test Config',
          config_type: 'build_op',
          user_options: { option1: 'value1' },
        });
    });

    it('should handle undefined userOptions', () => {
      // Arrange
      const entity = new BuildConfigEntity(
        1,
        'Test Config',
        ConfigType.BUILD_OP,
      );

      // Act
      const rawData = entity.toRaw();

      // Assert
      expect(rawData)
        .toEqual({
          config_id: 1,
          config_name: 'Test Config',
          config_type: 'build_op',
          user_options: undefined,
        });
    });
  });

  describe('updateUserOptions', () => {
    it('should return new entity with updated user options', () => {
      // Arrange
      const originalEntity = new BuildConfigEntity(
        1,
        'Test Config',
        ConfigType.BUILD_OP,
        { option1: 'old_value' },
      );
      const newOptions = {
        option1: 'new_value',
        option2: 'added_value',
      };

      // Act
      const updatedEntity = originalEntity.updateUserOptions(newOptions);

      // Assert
      expect(updatedEntity).not.toBe(originalEntity); // New instance
      expect(updatedEntity.configId)
        .toBe(originalEntity.configId);
      expect(updatedEntity.configName)
        .toBe(originalEntity.configName);
      expect(updatedEntity.configType.equals(originalEntity.configType))
        .toBeTruthy();
      expect(updatedEntity.userOptions)
        .toEqual(newOptions);
    });

    it('should preserve other properties when updating user options', () => {
      // Arrange
      const originalEntity = new BuildConfigEntity(
        1,
        'Test Config',
        ConfigType.BUILD_EXAMPLE,
        { option1: 'old_value' },
      );
      const newOptions = { option2: 'new_value' };

      // Act
      const updatedEntity = originalEntity.updateUserOptions(newOptions);

      // Assert
      expect(updatedEntity.configId)
        .toBe(1);
      expect(updatedEntity.configName)
        .toBe('Test Config');
      expect(updatedEntity.configType.equals(ConfigType.BUILD_EXAMPLE))
        .toBeTruthy();
      expect(updatedEntity.userOptions)
        .toEqual(newOptions);
    });
  });
});
