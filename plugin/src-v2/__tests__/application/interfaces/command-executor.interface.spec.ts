import { 
  ICommandExecutor, 
  CommandExecutionResult 
} from '../../application/interfaces/command-executor.interface';

// 这个测试确保接口定义正确且可以被实现
describe('Command Executor Interface', () => {
  // 创建一个模拟实现来测试接口
  const mockCommandExecutor: ICommandExecutor = {
    execute: jest.fn(),
    kill: jest.fn(),
  };

  it('should have execute method with correct signature', () => {
    expect(typeof mockCommandExecutor.execute).toBe('function');
  });

  it('should have kill method with correct signature', () => {
    expect(typeof mockCommandExecutor.kill).toBe('function');
  });

  it('should define CommandExecutionResult interface correctly', () => {
    const result: CommandExecutionResult = {
      code: 0,
      output: 'test output',
    };

    expect(result).toHaveProperty('code');
    expect(result).toHaveProperty('output');
    expect(typeof result.code).toBe('number');
    expect(typeof result.output).toBe('string');
  });
});