import { CommandExecutorAdapter } from '../command-executor.adapter';
import { CommandExecutor } from '@plugin/class/command-options';

describe('CommandExecutorAdapter', () => {
  let adapter: CommandExecutorAdapter;
  let mockExecutor: jest.Mocked<CommandExecutor>;

  beforeEach(() => {
    // Create mock executor
    mockExecutor = {
      execute: jest.fn(),
      kill: jest.fn(),
    } as unknown as jest.Mocked<CommandExecutor>;

    adapter = new CommandExecutorAdapter(mockExecutor);
  });

  describe('execute', () => {
    it('should execute command with all parameters', async () => {
      const mockResult = {
        code: 0,
        output: 'Command executed successfully',
      };

      mockExecutor.execute.mockResolvedValue(mockResult);

      const result = await adapter.execute(
        'npm run build',
        ['--production'],
        ['--verbose'],
        { NODE_ENV: 'production' },
        true,
      );

      expect(result)
        .toEqual({
          code: 0,
          output: 'Command executed successfully',
        });

      expect(mockExecutor.execute)
        .toHaveBeenCalledWith(
          'npm run build',
          ['--production'],
          ['--verbose'],
          { NODE_ENV: 'production' },
          true,
        );
    });

    it('should execute command with default parameters', async () => {
      const mockResult = {
        code: 0,
        output: 'Success',
      };

      mockExecutor.execute.mockResolvedValue(mockResult);

      const result = await adapter.execute('ls');

      expect(result)
        .toEqual({
          code: 0,
          output: 'Success',
        });

      expect(mockExecutor.execute)
        .toHaveBeenCalledWith(
          'ls',
          [],
          [],
          {},
          true,
        );
    });

    it('should handle non-zero exit codes', async () => {
      const mockResult = {
        code: 1,
        output: 'Command failed with error',
      };

      mockExecutor.execute.mockResolvedValue(mockResult);

      const result = await adapter.execute('npm test');

      expect(result)
        .toEqual({
          code: 1,
          output: 'Command failed with error',
        });
    });

    it('should handle undefined code by defaulting to 0', async () => {
      const mockResult = {
        code: undefined,
        output: 'Completed',
      };

      mockExecutor.execute.mockResolvedValue(mockResult as any);

      const result = await adapter.execute('echo "hello"');

      expect(result)
        .toEqual({
          code: 0,
          output: 'Completed',
        });
    });

    it('should handle null code by defaulting to 0', async () => {
      const mockResult = {
        code: null,
        output: 'Completed',
      };

      mockExecutor.execute.mockResolvedValue(mockResult as any);

      const result = await adapter.execute('pwd');

      expect(result)
        .toEqual({
          code: 0,
          output: 'Completed',
        });
    });

    it('should propagate errors from executor', async () => {
      const mockError = new Error('Execution error');

      mockExecutor.execute.mockRejectedValue(mockError);

      await expect(adapter.execute('invalid-command')).rejects.toThrow('Execution error');
    });

    it('should pass showOutput as false when specified', async () => {
      const mockResult = {
        code: 0,
        output: 'Silent execution',
      };

      mockExecutor.execute.mockResolvedValue(mockResult);

      await adapter.execute('secret-command', [], [], {}, false);

      expect(mockExecutor.execute)
        .toHaveBeenCalledWith(
          'secret-command',
          [],
          [],
          {},
          false,
        );
    });

    it('should handle empty output', async () => {
      const mockResult = {
        code: 0,
        output: '',
      };

      mockExecutor.execute.mockResolvedValue(mockResult);

      const result = await adapter.execute('touch file.txt');

      expect(result)
        .toEqual({
          code: 0,
          output: '',
        });
    });

    it('should handle multiline output', async () => {
      const mockResult = {
        code: 0,
        output: 'Line 1\nLine 2\nLine 3',
      };

      mockExecutor.execute.mockResolvedValue(mockResult);

      const result = await adapter.execute('cat file.txt');

      expect(result)
        .toEqual({
          code: 0,
          output: 'Line 1\nLine 2\nLine 3',
        });
    });

    it('should execute with custom environment variables', async () => {
      const mockResult = {
        code: 0,
        output: 'Environment set',
      };

      mockExecutor.execute.mockResolvedValue(mockResult);

      await adapter.execute('printenv', [], [], {
        CUSTOM_VAR: 'value1',
        ANOTHER_VAR: 'value2',
      });

      expect(mockExecutor.execute)
        .toHaveBeenCalledWith(
          'printenv',
          [],
          [],
          {
            CUSTOM_VAR: 'value1',
            ANOTHER_VAR: 'value2',
          },
          true,
        );
    });

    it('should execute with multiple args and extraArgs', async () => {
      const mockResult = {
        code: 0,
        output: 'Build complete',
      };

      mockExecutor.execute.mockResolvedValue(mockResult);

      await adapter.execute(
        'msopgen',
        [
          'compile',
          '--config',
          '123',
        ],
        [
          '--debug',
          '--verbose',
        ],
      );

      expect(mockExecutor.execute)
        .toHaveBeenCalledWith(
          'msopgen',
          [
            'compile',
            '--config',
            '123',
          ],
          [
            '--debug',
            '--verbose',
          ],
          {},
          true,
        );
    });
  });

  describe('kill', () => {
    it('should call kill on the underlying executor', () => {
      adapter.kill();

      expect(mockExecutor.kill)
        .toHaveBeenCalled();
    });

    it('should call kill multiple times safely', () => {
      adapter.kill();
      adapter.kill();
      adapter.kill();

      expect(mockExecutor.kill)
        .toHaveBeenCalledTimes(3);
    });

    it('should propagate errors from executor kill', () => {
      const mockError = new Error('Kill failed');

      mockExecutor.kill.mockImplementation(() => {
        throw mockError;
      });

      expect(() => adapter.kill())
        .toThrow('Kill failed');
    });
  });

  describe('integration scenarios', () => {
    it('should handle execute followed by kill', async () => {
      const mockResult = {
        code: 0,
        output: 'Running...',
      };

      mockExecutor.execute.mockResolvedValue(mockResult);

      const executePromise = adapter.execute('long-running-command');

      adapter.kill();

      expect(mockExecutor.kill)
        .toHaveBeenCalled();

      const result = await executePromise;

      expect(result.code)
        .toBe(0);
    });

    it('should handle multiple sequential executions', async () => {
      mockExecutor.execute
        .mockResolvedValueOnce({
          code: 0,
          output: 'First',
        })
        .mockResolvedValueOnce({
          code: 0,
          output: 'Second',
        })
        .mockResolvedValueOnce({
          code: 0,
          output: 'Third',
        });

      const result1 = await adapter.execute('cmd1');
      const result2 = await adapter.execute('cmd2');
      const result3 = await adapter.execute('cmd3');

      expect(result1.output)
        .toBe('First');
      expect(result2.output)
        .toBe('Second');
      expect(result3.output)
        .toBe('Third');
      expect(mockExecutor.execute)
        .toHaveBeenCalledTimes(3);
    });

    it('should handle execution failures gracefully', async () => {
      mockExecutor.execute
        .mockResolvedValueOnce({
          code: 0,
          output: 'Success',
        })
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({
          code: 0,
          output: 'Recovered',
        });

      await expect(adapter.execute('cmd1')).resolves.toMatchObject({ code: 0 });
      await expect(adapter.execute('cmd2')).rejects.toThrow('Failed');
      await expect(adapter.execute('cmd3')).resolves.toMatchObject({ code: 0 });
    });
  });
});
