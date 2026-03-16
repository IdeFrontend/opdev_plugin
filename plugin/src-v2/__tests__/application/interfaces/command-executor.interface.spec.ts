import { 
  ICommandExecutor, 
  CommandExecutionResult 
} from '../../application/interfaces/command-executor.interface';

// Ensures interface is well-defined and implementable
describe('Command Executor Interface', () => {
  // Mock implementation to test interface
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