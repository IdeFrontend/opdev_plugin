import { CommandExecutorAdapter } from '../../../infrastructure/executors/command-executor.adapter';
import { ICommandExecutor, CommandExecutionResult } from '../../../application/interfaces/command-executor.interface';

// Mock original CommandExecutor
class MockCommandExecutor {
  execute = jest.fn();
  kill = jest.fn();
}

describe('CommandExecutorAdapter', () => {
  let mockExecutor: MockCommandExecutor;
  let adapter: CommandExecutorAdapter;

  beforeEach(() => {
    mockExecutor = new MockCommandExecutor();
    adapter = new CommandExecutorAdapter(mockExecutor);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should execute command and return adapted result', async () => {
      // Arrange
      const command = 'test-command';
      const args = ['arg1', 'arg2'];
      const extraArgs = ['extra1'];
      const env = { TEST_VAR: 'test_value' };
      const showOutput = true;
      
      const mockResult = { code: 0, output: 'test output' };
      mockExecutor.execute.mockResolvedValue(mockResult);

      // Act
      const result: CommandExecutionResult = await adapter.execute(
        command,
        args,
        extraArgs,
        env,
        showOutput
      );

      // Assert
      expect(mockExecutor.execute).toHaveBeenCalledWith(
        command,
        args,
        extraArgs,
        env,
        showOutput
      );
      expect(result).toEqual({
        code: 0,
        output: 'test output'
      });
    });

    it('should handle undefined code by defaulting to 0', async () => {
      // Arrange
      const command = 'test-command';
      const mockResult = { output: 'test output' }; // code is undefined
      mockExecutor.execute.mockResolvedValue(mockResult);

      // Act
      const result: CommandExecutionResult = await adapter.execute(command);

      // Assert
      expect(result.code).toBe(0);
      expect(result.output).toBe('test output');
    });

    it('should pass default parameters when optional params are not provided', async () => {
      // Arrange
      const command = 'test-command';
      const mockResult = { code: 0, output: 'test output' };
      mockExecutor.execute.mockResolvedValue(mockResult);

      // Act
      const result: CommandExecutionResult = await adapter.execute(command);

      // Assert
      expect(mockExecutor.execute).toHaveBeenCalledWith(
        command,
        [], // default args
        [], // default extraArgs
        {}, // default env
        true // default showOutput
      );
    });
  });

  describe('kill', () => {
    it('should kill the underlying executor', async () => {
      // Act
      await adapter.kill();

      // Assert
      expect(mockExecutor.kill).toHaveBeenCalled();
    });
  });
});