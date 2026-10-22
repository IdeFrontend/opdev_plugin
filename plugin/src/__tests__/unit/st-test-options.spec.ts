/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import {
  cloneDefaultStTestArguments,
  formatStTestPreviewToken,
  MAX_ST_TEST_ARGUMENT_TOKEN_LENGTH,
  MAX_ST_TEST_ARGUMENT_TOKENS,
  validateStTestArgumentTokens,
} from '@shared/st-test-options';

describe('ST test argument options', () => {
  it('returns an independent copy of the required kernel defaults', () => {
    const first = cloneDefaultStTestArguments('kernel');
    const second = cloneDefaultStTestArguments('kernel');

    first.push('--changed');

    expect(second)
      .toEqual([
        '-d=false',
        '-b=release',
        '--pc=8',
      ]);
  });

  it.each([
    [
      'not_array',
      'not-an-array',
    ],
    [
      'too_many',
      Array.from({ length: MAX_ST_TEST_ARGUMENT_TOKENS + 1 }, () => '--flag'),
    ],
    [
      'not_string',
      [
        '--flag',
        1,
      ],
    ],
    [
      'empty',
      ['   '],
    ],
    [
      'nul',
      ['bad\0token'],
    ],
    [
      'control',
      ['line one\nline two'],
    ],
    [
      'too_long',
      ['x'.repeat(MAX_ST_TEST_ARGUMENT_TOKEN_LENGTH + 1)],
    ],
    [
      'too_large',
      Array.from({ length: 9 }, () => 'x'.repeat(MAX_ST_TEST_ARGUMENT_TOKEN_LENGTH)),
    ],
    [
      'reserved',
      ['--plugin=/tmp/tests'],
    ],
    [
      'reserved',
      ['-i/tmp/input.csv'],
    ],
  ])('rejects invalid input with %s', (code, value) => {
    expect(validateStTestArgumentTokens(value))
      .toMatchObject({
        valid: false,
        code,
      });
  });

  it('accepts shell-looking values because the command builder quotes every token', () => {
    expect(validateStTestArgumentTokens([
      '--label',
      'two words',
      '$(touch nope)',
    ]))
      .toEqual({
        valid: true,
        tokens: [
          '--label',
          'two words',
          '$(touch nope)',
        ],
      });
  });

  it('renders shell-looking preview tokens without enabling shell expansion', () => {
    expect(formatStTestPreviewToken('$(touch nope)'))
      .toBe("'$(touch nope)'");
    expect(formatStTestPreviewToken("owner's value"))
      .toBe("'owner'\\''s value'");
  });
});
