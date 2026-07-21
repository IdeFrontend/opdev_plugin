import type { StTestMode } from './st-test-results';

export const MAX_ST_TEST_ARGUMENT_TOKENS = 64;

export const MAX_ST_TEST_ARGUMENT_TOKEN_LENGTH = 1024;

export const MAX_ST_TEST_ARGUMENTS_TOTAL_LENGTH = 8192;

export const DEFAULT_ST_TEST_ARGUMENTS: Readonly<Record<StTestMode, readonly string[]>> = {
  kernel: [
    '-d=false',
    '-b=release',
    '--pc=8',
  ],
  aclnn: [],
  e2e: [],
};

export type StTestArgumentValidationCode =
  | 'not_array'
  | 'too_many'
  | 'not_string'
  | 'empty'
  | 'nul'
  | 'control'
  | 'too_long'
  | 'too_large'
  | 'reserved';

export type StTestArgumentValidationResult =
  | {
    valid: true;
    tokens: string[];
  }
  | {
    valid: false;
    code: StTestArgumentValidationCode;
    index?: number;
    token?: string;
  };

const RESERVED_ARGUMENT_PATTERN = /^(?:(?:-i|-o).+|(?:-i|-o|--input|--output|--plugin)(?:=|$))/;
const CONTROL_CHARACTER_PATTERN = /[\u0001-\u001f\u007f]/u;
const SIMPLE_PREVIEW_TOKEN_PATTERN = /^[A-Za-z0-9_./:=+-]+$/;
const SINGLE_QUOTE = '\'';
const SHELL_SINGLE_QUOTE_ESCAPE = `${SINGLE_QUOTE}\\${SINGLE_QUOTE}${SINGLE_QUOTE}`;

export function cloneDefaultStTestArguments(mode: StTestMode): string[] {
  return [...DEFAULT_ST_TEST_ARGUMENTS[mode]];
}

export function formatStTestPreviewToken(token: string): string {
  if (SIMPLE_PREVIEW_TOKEN_PATTERN.test(token)) {
    return token;
  }

  return `${SINGLE_QUOTE}${token.replace(/'/g, SHELL_SINGLE_QUOTE_ESCAPE)}${SINGLE_QUOTE}`;
}

export function validateStTestArgumentTokens(value: unknown): StTestArgumentValidationResult {
  if (!Array.isArray(value)) {
    return {
      valid: false,
      code: 'not_array',
    };
  }

  if (value.length > MAX_ST_TEST_ARGUMENT_TOKENS) {
    return {
      valid: false,
      code: 'too_many',
    };
  }

  const tokens: string[] = [];
  let totalLength = 0;

  for (let index = 0; index < value.length; index++) {
    const token = value[index];

    if (typeof token !== 'string') {
      return {
        valid: false,
        code: 'not_string',
        index,
      };
    }

    if (token.trim().length === 0) {
      return {
        valid: false,
        code: 'empty',
        index,
      };
    }

    if (token.includes('\0')) {
      return {
        valid: false,
        code: 'nul',
        index,
      };
    }

    if (CONTROL_CHARACTER_PATTERN.test(token)) {
      return {
        valid: false,
        code: 'control',
        index,
      };
    }

    if (token.length > MAX_ST_TEST_ARGUMENT_TOKEN_LENGTH) {
      return {
        valid: false,
        code: 'too_long',
        index,
      };
    }

    if (RESERVED_ARGUMENT_PATTERN.test(token)) {
      return {
        valid: false,
        code: 'reserved',
        index,
        token,
      };
    }

    totalLength += token.length;

    if (totalLength > MAX_ST_TEST_ARGUMENTS_TOTAL_LENGTH) {
      return {
        valid: false,
        code: 'too_large',
      };
    }

    tokens.push(token);
  }

  return {
    valid: true,
    tokens,
  };
}
