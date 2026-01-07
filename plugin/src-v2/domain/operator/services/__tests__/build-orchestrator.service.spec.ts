import { BuildOrchestratorService } from '../build-orchestrator.service';
import { CommandGeneratorService } from '../command-generator.service';
import { ICommandExecutor } from '@plugin-v2/application/interfaces/command-executor.interface';
import { ResultUtils } from '@plugin-v2/domain/shared/types/result.type';

describe('BuildOrchestratorService', () => {
  let service: BuildOrchestratorService;
  let mockExecutor: jest.Mocked<ICommandExecutor>;
  let commandGenerator: CommandGeneratorService;

  beforeEach(() => {
    // Mock executor
    mockExecutor = {
      execute: jest.fn(),
      kill: jest.fn(),
    };

    commandGenerator = new CommandGeneratorService();
    service = new BuildOrchestratorService(commandGenerator, mockExecutor);
  });

  describe('build', () => {
    it('should build successfully when executor returns code 0', async () => {
      mockExecutor.execute.mockResolvedValue({
        code: 0,
        output: 'Build successful',
      });

      const result = await service.build(123, '--debug');

      expect(ResultUtils.isOk(result))
        .toBe(true);
      expect(mockExecutor.execute)
        .toHaveBeenCalledWith(
          expect.any(String),
          [],
          [],
          {},
          true,
        );
    });

    it('should return BuildFailedError when executor returns non-zero code', async () => {
      mockExecutor.execute.mockResolvedValue({
        code: 1,
        output: 'Build error occurred',
      });

      const result = await service.build(123);

      expect(ResultUtils.isErr(result))
        .toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error.code)
          .toBe('BUILD_FAILED');
        expect(result.error.message)
          .toContain('编译算子失败');
        expect(result.error.context)
          .toMatchObject({
            exitCode: 1,
            output: 'Build error occurred',
          });
      }
    });

    it('should pass compile options to command generator', async () => {
      const spy = jest.spyOn(commandGenerator, 'generateBuildCommand');

      mockExecutor.execute.mockResolvedValue({
        code: 0,
        output: '',
      });

      await service.build(456, '--release');

      expect(spy)
        .toHaveBeenCalledWith(456, '--release');
    });
  });

  describe('buildExample', () => {
    it('should build example successfully', async () => {
      mockExecutor.execute.mockResolvedValue({
        code: 0,
        output: 'Example built',
      });

      const result = await service.buildExample(789);

      expect(ResultUtils.isOk(result))
        .toBe(true);
    });

    it('should return error when build example fails', async () => {
      mockExecutor.execute.mockResolvedValue({
        code: 2,
        output: 'Example build failed',
      });

      const result = await service.buildExample(789);

      expect(ResultUtils.isErr(result))
        .toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error.message)
          .toContain('编译示例失败');
      }
    });
  });

  describe('run', () => {
    it('should run successfully', async () => {
      mockExecutor.execute.mockResolvedValue({
        code: 0,
        output: 'Run completed',
      });

      const result = await service.run(101);

      expect(ResultUtils.isOk(result))
        .toBe(true);
    });

    it('should return error when run fails', async () => {
      mockExecutor.execute.mockResolvedValue({
        code: 1,
        output: 'Runtime error',
      });

      const result = await service.run(101);

      expect(ResultUtils.isErr(result))
        .toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error.message)
          .toContain('运行失败');
      }
    });
  });

  describe('simulate', () => {
    it('should simulate successfully with pre-build and simulation steps', async () => {
      // Mock both build and simulate commands to succeed
      mockExecutor.execute
        .mockResolvedValueOnce({
          code: 0,
          output: 'Pre-build success',
        })
        .mockResolvedValueOnce({
          code: 0,
          output: 'Simulation success',
        });

      const result = await service.simulate(100, 200, 300, 'aicore');

      expect(ResultUtils.isOk(result))
        .toBe(true);
      expect(mockExecutor.execute)
        .toHaveBeenCalledTimes(2);
    });

    it('should return error when pre-build fails', async () => {
      mockExecutor.execute.mockResolvedValueOnce({
        code: 1,
        output: 'Pre-build failed',
      });

      const result = await service.simulate(100, 200, 300, 'aicore');

      expect(ResultUtils.isErr(result))
        .toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error.code)
          .toBe('BUILD_FAILED');
        expect(result.error.message)
          .toContain('仿真前编译失败');
        expect(result.error.context)
          .toMatchObject({ phase: 'pre-simulate-build' });
      }

      // Should not proceed to simulation
      expect(mockExecutor.execute)
        .toHaveBeenCalledTimes(1);
    });

    it('should return error when simulation fails after successful pre-build', async () => {
      mockExecutor.execute
        .mockResolvedValueOnce({
          code: 0,
          output: 'Pre-build success',
        })
        .mockResolvedValueOnce({
          code: 1,
          output: 'Simulation failed',
        });

      const result = await service.simulate(100, 200, 300, 'aicore');

      expect(ResultUtils.isErr(result))
        .toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error.code)
          .toBe('SIMULATE_FAILED');
        expect(result.error.message)
          .toContain('执行仿真分析失败');
      }

      expect(mockExecutor.execute)
        .toHaveBeenCalledTimes(2);
    });

    it('should use correct simulator type in pre-build command', async () => {
      const spy = jest.spyOn(
        commandGenerator,
        'generateBuildWithSimulatorCommand',
      );

      mockExecutor.execute
        .mockResolvedValueOnce({
          code: 0,
          output: '',
        })
        .mockResolvedValueOnce({
          code: 0,
          output: '',
        });

      await service.simulate(100, 200, 300, 'vector');

      expect(spy)
        .toHaveBeenCalledWith(100, 'vector');
    });
  });

  describe('onBoard', () => {
    it('should execute onBoard successfully with pre-build and onBoard steps', async () => {
      // Mock both build and onBoard commands to succeed
      mockExecutor.execute
        .mockResolvedValueOnce({
          code: 0,
          output: 'Pre-onBoard build success',
        })
        .mockResolvedValueOnce({
          code: 0,
          output: 'OnBoard success',
        });

      const result = await service.onBoard(100, 200, 300);

      expect(ResultUtils.isOk(result))
        .toBe(true);
      expect(mockExecutor.execute)
        .toHaveBeenCalledTimes(2);
    });

    it('should return error when pre-onBoard build fails', async () => {
      mockExecutor.execute.mockResolvedValueOnce({
        code: 1,
        output: 'Pre-onBoard build failed',
      });

      const result = await service.onBoard(100, 200, 300);

      expect(ResultUtils.isErr(result))
        .toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error.code)
          .toBe('BUILD_FAILED');
        expect(result.error.message)
          .toContain('上板前编译失败');
        expect(result.error.context)
          .toMatchObject({ phase: 'pre-onboard-build' });
      }

      // Should not proceed to onBoard
      expect(mockExecutor.execute)
        .toHaveBeenCalledTimes(1);
    });

    it('should return error when onBoard fails after successful pre-build', async () => {
      mockExecutor.execute
        .mockResolvedValueOnce({
          code: 0,
          output: 'Pre-onBoard build success',
        })
        .mockResolvedValueOnce({
          code: 1,
          output: 'OnBoard failed',
        });

      const result = await service.onBoard(100, 200, 300);

      expect(ResultUtils.isErr(result))
        .toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error.code)
          .toBe('ON_BOARD_FAILED');
        expect(result.error.message)
          .toContain('执行上板分析失败');
      }

      expect(mockExecutor.execute)
        .toHaveBeenCalledTimes(2);
    });

    it('should use correct config IDs in commands', async () => {
      const buildSpy = jest.spyOn(
        commandGenerator,
        'generateBuildForOnBoardCommand',
      );
      const onBoardSpy = jest.spyOn(commandGenerator, 'generateOnBoardCommand');

      mockExecutor.execute
        .mockResolvedValueOnce({
          code: 0,
          output: '',
        })
        .mockResolvedValueOnce({
          code: 0,
          output: '',
        });

      await service.onBoard(111, 222, 333);

      expect(buildSpy)
        .toHaveBeenCalledWith(111);
      expect(onBoardSpy)
        .toHaveBeenCalledWith(222, 333);
    });
  });

  describe('sanitizer', () => {
    it('should execute sanitizer successfully with pre-build and sanitizer steps', async () => {
      // Mock both build and sanitizer commands to succeed
      mockExecutor.execute
        .mockResolvedValueOnce({
          code: 0,
          output: 'Pre-sanitizer build success',
        })
        .mockResolvedValueOnce({
          code: 0,
          output: 'Sanitizer success',
        });

      const result = await service.sanitizer(100, 200, 300);

      expect(ResultUtils.isOk(result))
        .toBe(true);
      expect(mockExecutor.execute)
        .toHaveBeenCalledTimes(2);
    });

    it('should return error when pre-sanitizer build fails', async () => {
      mockExecutor.execute.mockResolvedValueOnce({
        code: 1,
        output: 'Pre-sanitizer build failed',
      });

      const result = await service.sanitizer(100, 200, 300);

      expect(ResultUtils.isErr(result))
        .toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error.code)
          .toBe('BUILD_FAILED');
        expect(result.error.message)
          .toContain('异常检测前编译失败');
        expect(result.error.context)
          .toMatchObject({ phase: 'pre-sanitizer-build' });
      }

      // Should not proceed to sanitizer
      expect(mockExecutor.execute)
        .toHaveBeenCalledTimes(1);
    });

    it('should return error when sanitizer fails after successful pre-build', async () => {
      mockExecutor.execute
        .mockResolvedValueOnce({
          code: 0,
          output: 'Pre-sanitizer build success',
        })
        .mockResolvedValueOnce({
          code: 1,
          output: 'Sanitizer failed',
        });

      const result = await service.sanitizer(100, 200, 300);

      expect(ResultUtils.isErr(result))
        .toBe(true);

      if (ResultUtils.isErr(result)) {
        expect(result.error.code)
          .toBe('SANITIZER_FAILED');
        expect(result.error.message)
          .toContain('异常检测失败');
      }

      expect(mockExecutor.execute)
        .toHaveBeenCalledTimes(2);
    });

    it('should use correct config IDs in commands', async () => {
      const buildSpy = jest.spyOn(
        commandGenerator,
        'generateBuildForSanitizerCommand',
      );
      const sanitizerSpy = jest.spyOn(
        commandGenerator,
        'generateSanitizerCommand',
      );

      mockExecutor.execute
        .mockResolvedValueOnce({
          code: 0,
          output: '',
        })
        .mockResolvedValueOnce({
          code: 0,
          output: '',
        });

      await service.sanitizer(111, 222, 333);

      expect(buildSpy)
        .toHaveBeenCalledWith(111);
      expect(sanitizerSpy)
        .toHaveBeenCalledWith(222, 333);
    });
  });
});
