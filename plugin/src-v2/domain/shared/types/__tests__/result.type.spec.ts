import {
  Result, ResultUtils,
} from '../result.type';

describe('Result Type', () => {
  describe('ResultUtils.ok', () => {
    it('should create a successful result', () => {
      const result = ResultUtils.ok(42);

      expect(result.ok)
        .toBe(true);

      if (result.ok) {
        expect(result.value)
          .toBe(42);
      }
    });

    it('should work with complex objects', () => {
      const data = {
        id: 1,
        name: 'test',
      };
      const result = ResultUtils.ok(data);

      expect(result.ok)
        .toBe(true);

      if (result.ok) {
        expect(result.value)
          .toEqual(data);
      }
    });
  });

  describe('ResultUtils.err', () => {
    it('should create an error result', () => {
      const error = new Error('Something went wrong');
      const result = ResultUtils.err(error);

      expect(result.ok)
        .toBe(false);

      if (!result.ok) {
        expect(result.error)
          .toBe(error);
      }
    });

    it('should work with custom error types', () => {
      class CustomError extends Error {
        constructor(
          message: string,
          public code: number,
        ) {
          super(message);
        }
      }

      const error = new CustomError('Custom error', 404);
      const result = ResultUtils.err(error);

      expect(result.ok)
        .toBe(false);

      if (!result.ok) {
        expect(result.error)
          .toBeInstanceOf(CustomError);
        expect(result.error.code)
          .toBe(404);
      }
    });
  });

  describe('ResultUtils.isOk', () => {
    it('should return true for ok results', () => {
      const result = ResultUtils.ok(100);

      expect(ResultUtils.isOk(result))
        .toBe(true);
    });

    it('should return false for error results', () => {
      const result = ResultUtils.err(new Error('fail'));

      expect(ResultUtils.isOk(result))
        .toBe(false);
    });

    it('should provide type narrowing', () => {
      const result: Result<number, Error> = ResultUtils.ok(42);

      if (ResultUtils.isOk(result)) {
        // Type should be narrowed to { ok: true; value: number }
        const value: number = result.value;

        expect(value)
          .toBe(42);
      }
    });
  });

  describe('ResultUtils.isErr', () => {
    it('should return true for error results', () => {
      const result = ResultUtils.err(new Error('fail'));

      expect(ResultUtils.isErr(result))
        .toBe(true);
    });

    it('should return false for ok results', () => {
      const result = ResultUtils.ok(100);

      expect(ResultUtils.isErr(result))
        .toBe(false);
    });

    it('should provide type narrowing', () => {
      const result: Result<number, Error> = ResultUtils.err(new Error('test error'));

      if (ResultUtils.isErr(result)) {
        // Type should be narrowed to { ok: false; error: Error }
        const error: Error = result.error;

        expect(error.message)
          .toBe('test error');
      }
    });
  });

  describe('ResultUtils.unwrap', () => {
    it('should return value for ok results', () => {
      const result = ResultUtils.ok('success');
      const value = ResultUtils.unwrap(result);

      expect(value)
        .toBe('success');
    });

    it('should throw error for error results', () => {
      const result = ResultUtils.err(new Error('failed'));

      expect(() => ResultUtils.unwrap(result))
        .toThrow('failed');
    });
  });

  describe('ResultUtils.unwrapOr', () => {
    it('should return value for ok results', () => {
      const result = ResultUtils.ok(10);
      const value = ResultUtils.unwrapOr(result, 20);

      expect(value)
        .toBe(10);
    });

    it('should return default value for error results', () => {
      const result = ResultUtils.err(new Error('failed'));
      const value = ResultUtils.unwrapOr(result, 999);

      expect(value)
        .toBe(999);
    });
  });

  describe('ResultUtils.map', () => {
    it('should map ok results', () => {
      const result = ResultUtils.ok(5);
      const mapped = ResultUtils.map(result, (x) => x * 2);

      expect(ResultUtils.isOk(mapped))
        .toBe(true);

      if (ResultUtils.isOk(mapped)) {
        expect(mapped.value)
          .toBe(10);
      }
    });

    it('should not map error results', () => {
      const result = ResultUtils.err(new Error('original error'));
      const mapped = ResultUtils.map(result, (x: number) => x * 2);

      expect(ResultUtils.isErr(mapped))
        .toBe(true);

      if (ResultUtils.isErr(mapped)) {
        expect(mapped.error.message)
          .toBe('original error');
      }
    });

    it('should support type transformation', () => {
      const result = ResultUtils.ok(42);
      const mapped = ResultUtils.map(result, (x) => String(x));

      expect(ResultUtils.isOk(mapped))
        .toBe(true);

      if (ResultUtils.isOk(mapped)) {
        expect(mapped.value)
          .toBe('42');
        expect(typeof mapped.value)
          .toBe('string');
      }
    });
  });

  describe('ResultUtils.mapErr', () => {
    it('should map error results', () => {
      const result = ResultUtils.err(new Error('original'));
      const mapped = ResultUtils.mapErr(result, (_err) => new Error('mapped'));

      expect(ResultUtils.isErr(mapped))
        .toBe(true);

      if (ResultUtils.isErr(mapped)) {
        expect(mapped.error.message)
          .toBe('mapped');
      }
    });

    it('should not map ok results', () => {
      const result = ResultUtils.ok(100);
      const mapped = ResultUtils.mapErr(result, (err: Error) =>
        new Error('should not be called'));

      expect(ResultUtils.isOk(mapped))
        .toBe(true);

      if (ResultUtils.isOk(mapped)) {
        expect(mapped.value)
          .toBe(100);
      }
    });

    it('should support error type transformation', () => {
      class CustomError extends Error {
        constructor(
          message: string,
          public code: number,
        ) {
          super(message);
        }
      }

      const result = ResultUtils.err(new Error('basic error'));
      const mapped = ResultUtils.mapErr(
        result,
        (err) => new CustomError(err.message, 500),
      );

      expect(ResultUtils.isErr(mapped))
        .toBe(true);

      if (ResultUtils.isErr(mapped)) {
        expect(mapped.error)
          .toBeInstanceOf(CustomError);
        expect(mapped.error.code)
          .toBe(500);
      }
    });
  });

  describe('Chaining operations', () => {
    it('should chain map operations on ok results', () => {
      const result = ResultUtils.ok(2);
      const chained = ResultUtils.map(
        ResultUtils.map(result, (x) => x * 3),
        (x) => x + 1,
      );

      expect(ResultUtils.isOk(chained))
        .toBe(true);

      if (ResultUtils.isOk(chained)) {
        expect(chained.value)
          .toBe(7); // (2 * 3) + 1
      }
    });

    it('should stop chaining on first error', () => {
      const result: Result<number, Error> = ResultUtils.err(new Error('fail'));
      const chained = ResultUtils.map(
        ResultUtils.map(result, (x) => x * 3),
        (x) => x + 1,
      );

      expect(ResultUtils.isErr(chained))
        .toBe(true);
    });
  });

  describe('Real-world usage patterns', () => {
    it('should handle async operations with Result', async () => {
      async function fetchData(shouldFail: boolean): Promise<Result<string, Error>> {
        if (shouldFail) {
          return ResultUtils.err(new Error('Fetch failed'));
        }

        return ResultUtils.ok('data');
      }

      const successResult = await fetchData(false);

      expect(ResultUtils.isOk(successResult))
        .toBe(true);

      const failResult = await fetchData(true);

      expect(ResultUtils.isErr(failResult))
        .toBe(true);
    });

    it('should propagate errors through multiple operations', async () => {
      async function step1(): Promise<Result<number, Error>> {
        return ResultUtils.ok(10);
      }

      async function step2(value: number): Promise<Result<number, Error>> {
        if (value < 0) {
          return ResultUtils.err(new Error('Negative value'));
        }

        return ResultUtils.ok(value * 2);
      }

      const result1 = await step1();

      if (ResultUtils.isErr(result1)) {
        fail('step1 should not fail');
      }

      const result2 = await step2(result1.value);

      expect(ResultUtils.isOk(result2))
        .toBe(true);

      if (ResultUtils.isOk(result2)) {
        expect(result2.value)
          .toBe(20);
      }
    });
  });
});
