import { ConfigType } from '../../../domain/operator/value-objects/config-type.vo';

describe('ConfigType Value Object', () => {
  describe('Static instances', () => {
    it('should have BUILD_OP instance with correct value', () => {
      expect(ConfigType.BUILD_OP.value).toBe('build_op');
    });

    it('should have BUILD_EXAMPLE instance with correct value', () => {
      expect(ConfigType.BUILD_EXAMPLE.value).toBe('build_example');
    });

    it('should have SIMULATE instance with correct value', () => {
      expect(ConfigType.SIMULATE.value).toBe('simulate');
    });

    it('should have ON_BOARD instance with correct value', () => {
      expect(ConfigType.ON_BOARD.value).toBe('on_board');
    });

    it('should have SANITIZER instance with correct value', () => {
      expect(ConfigType.SANITIZER.value).toBe('sanitizer');
    });
  });

  describe('fromString', () => {
    it('should return BUILD_OP for "build_op"', () => {
      const result = ConfigType.fromString('build_op');
      expect(result).toBeDefined();
      expect(result!.equals(ConfigType.BUILD_OP)).toBeTruthy();
    });

    it('should return BUILD_EXAMPLE for "build_example"', () => {
      const result = ConfigType.fromString('build_example');
      expect(result).toBeDefined();
      expect(result!.equals(ConfigType.BUILD_EXAMPLE)).toBeTruthy();
    });

    it('should return SIMULATE for "simulate"', () => {
      const result = ConfigType.fromString('simulate');
      expect(result).toBeDefined();
      expect(result!.equals(ConfigType.SIMULATE)).toBeTruthy();
    });

    it('should return ON_BOARD for "on_board"', () => {
      const result = ConfigType.fromString('on_board');
      expect(result).toBeDefined();
      expect(result!.equals(ConfigType.ON_BOARD)).toBeTruthy();
    });

    it('should return SANITIZER for "sanitizer"', () => {
      const result = ConfigType.fromString('sanitizer');
      expect(result).toBeDefined();
      expect(result!.equals(ConfigType.SANITIZER)).toBeTruthy();
    });

    it('should return undefined for invalid string', () => {
      const result = ConfigType.fromString('invalid_type');
      expect(result).toBeUndefined();
    });
  });

  describe('equals', () => {
    it('should return true when comparing same values', () => {
      const type1 = ConfigType.fromString('build_op');
      const type2 = ConfigType.fromString('build_op');
      
      expect(type1).toBeDefined();
      expect(type2).toBeDefined();
      expect(type1!.equals(type2!)).toBeTruthy();
    });

    it('should return false when comparing different values', () => {
      const type1 = ConfigType.fromString('build_op');
      const type2 = ConfigType.fromString('simulate');
      
      expect(type1).toBeDefined();
      expect(type2).toBeDefined();
      expect(type1!.equals(type2!)).toBeFalsy();
    });
  });

  describe('toString', () => {
    it('should return the value as string', () => {
      const configType = ConfigType.BUILD_OP;
      expect(configType.toString()).toBe('build_op');
    });
  });
});