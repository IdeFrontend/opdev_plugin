/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { parse_cmd_options } from '@plugin/domain/utils/aicore-utils';

describe('parse_cmd_options', () => {
  it('returns null for falsy input', () => {
    expect(parse_cmd_options(null))
      .toBeNull();
    expect(parse_cmd_options(''))
      .toBeNull();
    expect(parse_cmd_options(undefined))
      .toBeNull();
  });

  it('returns an empty map when nothing matches the key=value shape', () => {
    expect(parse_cmd_options('plain'))
      .toEqual({});
    expect(parse_cmd_options('--flag --other'))
      .toEqual({});
  });

  it('parses key=value tokens with and without the -- prefix', () => {
    expect(parse_cmd_options('--soc=ascend910b --ops=add,sub'))
      .toEqual({
        soc: 'ascend910b',
        ops: 'add,sub',
      });

    expect(parse_cmd_options('name=value'))
      .toEqual({ name: 'value' });
  });

  it('keeps the full value after the first equals sign', () => {
    expect(parse_cmd_options('--label=a=b=c'))
      .toEqual({ label: 'a=b=c' });
  });

  it('splits on any whitespace and skips empty tokens', () => {
    expect(parse_cmd_options('  --a=1\t\n--b=2   \r\n'))
      .toEqual({
        a: '1',
        b: '2',
      });
  });

  it('accepts keys with digits, underscores, and hyphens', () => {
    expect(parse_cmd_options('--build-type=Release --vendor_name=custom --soc_ver-2=x'))
      .toEqual({
        'build-type': 'Release',
        vendor_name: 'custom',
        'soc_ver-2': 'x',
      });
  });

  it('skips malformed tokens while keeping valid ones', () => {
    expect(parse_cmd_options('--no-equals --ok=yes -partial'))
      .toEqual({ ok: 'yes' });
  });
});
