/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
/**
 * Unit tests for the sanitizer/msdebug exception parser and its lookup tables.
 * Covers the exported classification helpers and the streaming ExceptionParser
 * class: block detection, SUMMARY/blank-line termination, stack frame
 * extraction, system path filtering, leak headers, and the generic fallback.
 */

jest.mock('i18next', () => ({ t: (key: string) => key }));

import {
  ExceptionParser,
  getChineseExceptionName,
  getChineseQuestionType,
  getQuestionTypeByExceptionName,
} from '@plugin/class/exception-parser';

describe('getQuestionTypeByExceptionName', () => {
  it('returns null for empty or whitespace-only names', () => {
    expect(getQuestionTypeByExceptionName(''))
      .toBeNull();
    expect(getQuestionTypeByExceptionName('   '))
      .toBeNull();
    expect(getQuestionTypeByExceptionName(undefined as unknown as string))
      .toBeNull();
  });

  it('returns null when no supported keyword matches', () => {
    expect(getQuestionTypeByExceptionName('mystery sanitizer error'))
      .toBeNull();
  });

  it('classifies memory sanitizer exceptions as memory', () => {
    expect(getQuestionTypeByExceptionName('illegal read of size 224'))
      .toBe('memory');
    expect(getQuestionTypeByExceptionName('illegal write of size 8'))
      .toBe('memory');
    expect(getQuestionTypeByExceptionName('illegal free()'))
      .toBe('memory');
    expect(getQuestionTypeByExceptionName('out of bounds of size 64'))
      .toBe('memory');
    expect(getQuestionTypeByExceptionName('misaligned access of size 4'))
      .toBe('memory');
    expect(getQuestionTypeByExceptionName('Unused memory of 80 byte(s)'))
      .toBe('memory');
    expect(getQuestionTypeByExceptionName('LeakCheck: detected memory leaks'))
      .toBe('memory');
  });

  it('classifies hazard and sync exceptions into their own buckets', () => {
    expect(getQuestionTypeByExceptionName('Potential RAW hazard detected'))
      .toBe('memoryContention');
    expect(getQuestionTypeByExceptionName('Potential WAR hazard detected'))
      .toBe('memoryContention');
    expect(getQuestionTypeByExceptionName('Potential WAW hazard detected'))
      .toBe('memoryContention');
    expect(getQuestionTypeByExceptionName('uninitialized read of size 8'))
      .toBe('uninitialized');
    expect(getQuestionTypeByExceptionName('Unpaired set_flag insetructions detected'))
      .toBe('synchronize');
  });

  it('trims surrounding whitespace before matching', () => {
    expect(getQuestionTypeByExceptionName('  illegal free()  '))
      .toBe('memory');
  });

  it('matches case-insensitively', () => {
    expect(getQuestionTypeByExceptionName('ILLEGAL READ OF SIZE 4'))
      .toBe('memory');
    expect(getQuestionTypeByExceptionName('POTENTIAL RAW HAZARD DETECTED'))
      .toBe('memoryContention');
  });

  it('prefers the longest matching keyword', () => {
    const mixed = 'uninitialized read of size 4 and illegal read of size 8';

    expect(getQuestionTypeByExceptionName(mixed))
      .toBe('uninitialized');
  });
});

describe('getChineseQuestionType', () => {
  it('maps known question types to their translation keys', () => {
    expect(getChineseQuestionType('memory'))
      .toBe('exceptionParser.memory');
    expect(getChineseQuestionType('memoryContention'))
      .toBe('exceptionParser.race');
    expect(getChineseQuestionType('uninitialized'))
      .toBe('exceptionParser.uninitialized');
    expect(getChineseQuestionType('synchronize'))
      .toBe('exceptionParser.sync');
    expect(getChineseQuestionType('other'))
      .toBe('exceptionParser.other');
  });

  it('returns the input unchanged for unknown or empty types', () => {
    expect(getChineseQuestionType('bogus'))
      .toBe('bogus');
    expect(getChineseQuestionType(''))
      .toBe('');
    expect(getChineseQuestionType('   '))
      .toBe('   ');
  });
});

describe('getChineseExceptionName', () => {
  it('maps exact exception names to their translation keys', () => {
    expect(getChineseExceptionName('illegal free()'))
      .toBe('exceptionParser.illegalFree');
    expect(getChineseExceptionName('LeakCheck: detected memory leaks'))
      .toBe('exceptionParser.memoryLeak');
    expect(getChineseExceptionName('Unpaired set_flag insetructions detected'))
      .toBe('exceptionParser.syncException');
  });

  it('matches partial names and trims the input', () => {
    expect(getChineseExceptionName('  illegal free() of 4 bytes  '))
      .toBe('exceptionParser.illegalFree');
    expect(getChineseExceptionName('out of bounds of size 64'))
      .toBe('exceptionParser.multiCoreStomp');
    expect(getChineseExceptionName('Unused memory of 80 byte(s)'))
      .toBe('exceptionParser.allocUnused');
    expect(getChineseExceptionName('uninitialized read of size 8'))
      .toBe('exceptionParser.uninitException');
    expect(getChineseExceptionName('Potential RAW hazard detected at GM'))
      .toBe('exceptionParser.rawHazard');
    expect(getChineseExceptionName('misaligned access of size 4'))
      .toBe('exceptionParser.unalignedAccess');
  });

  it('matches case-insensitively when the exact case is absent', () => {
    expect(getChineseExceptionName('ILLEGAL FREE() OF 4 BYTES'))
      .toBe('exceptionParser.illegalFree');
  });

  it('prefers the longest matching keyword', () => {
    const mixed = 'uninitialized read of size 4 and illegal read of size 8';

    expect(getChineseExceptionName(mixed))
      .toBe('exceptionParser.uninitException');
  });

  it('returns the trimmed original name when nothing matches', () => {
    expect(getChineseExceptionName('mystery error'))
      .toBe('mystery error');
    expect(getChineseExceptionName(''))
      .toBe('');
    expect(getChineseExceptionName('   '))
      .toBe('   ');
  });
});

describe('ExceptionParser', () => {
  describe('parseAll', () => {
    it('parses a complete memory error block', () => {
      const content = [
        '====== ERROR: illegal read of size 32 at test case 1',
        '====== #0 C:/Projects/ops-math/tests/ut/op_kernel_aicpu/utils/aicpu_test_utils.cpp:90:21',
        '====== detail: memory error sample 1',
        '====== SUMMARY: memory error 1',
      ].join('\n');

      const results = new ExceptionParser({ matchPath: '' })
        .parseAll(content);

      expect(results)
        .toHaveLength(1);
      const [result] = results;

      expect(result.type)
        .toBe('error');
      expect(result.questionType)
        .toBe('memory');
      expect(result.title)
        .toBe('illegal read of size 32');
      expect(result.question)
        .toBe('illegal read of size');
      expect(result.exceptionName)
        .toBe('exceptionParser.illegalRead');
      expect(result.fileLink)
        .toBe('C:/Projects/ops-math/tests/ut/op_kernel_aicpu/utils/aicpu_test_utils.cpp');
      expect(result.row)
        .toBe(90);
      expect(result.col)
        .toBe(21);
      // originData keeps the header and detail lines but not the SUMMARY line.
      expect(result.originData)
        .toBe(content.replace('\n====== SUMMARY: memory error 1', ''));
    });

    it('infers warning severity from the WARNING prefix', () => {
      const content = [
        '====== WARNING: out of bounds of size 64 at test case 2',
        '====== #0 C:/Projects/ops-math/tests/ut/op_kernel_aicpu/test_op_kernel_main.cpp:30:14',
        '====== SUMMARY: memory warning 2',
      ].join('\n');

      const [result] = new ExceptionParser({ matchPath: '' })
        .parseAll(content);

      expect(result.type)
        .toBe('warning');
      expect(result.questionType)
        .toBe('memory');
      expect(result.question)
        .toBe('out of bounds of size');
      expect(result.exceptionName)
        .toBe('exceptionParser.multiCoreStomp');
      expect(result.fileLink)
        .toBe('C:/Projects/ops-math/tests/ut/op_kernel_aicpu/test_op_kernel_main.cpp');
      expect(result.row)
        .toBe(30);
      expect(result.col)
        .toBe(14);
    });

    it('maps hazard, uninitialized and sync patterns to their question types', () => {
      const waw = new ExceptionParser({ matchPath: '' })
        .parseAll('====== ERROR: Potential WAW hazard detected at GM in AddLora_test on device 0:');
      const uninit = new ExceptionParser({ matchPath: '' })
        .parseAll('====== ERROR: uninitialized read of size 8');
      const sync = new ExceptionParser({ matchPath: '' })
        .parseAll('====== WARNING: Unpaired set_flag insetructions detected at test case 1');

      expect(waw[0].questionType)
        .toBe('memoryContention');
      expect(waw[0].exceptionName)
        .toBe('exceptionParser.wawHazard');
      expect(waw[0].question)
        .toBe('Potential WAW hazard detected');
      expect(uninit[0].questionType)
        .toBe('uninitialized');
      expect(uninit[0].exceptionName)
        .toBe('exceptionParser.uninitException');
      expect(sync[0].questionType)
        .toBe('synchronize');
      expect(sync[0].exceptionName)
        .toBe('exceptionParser.syncException');
      expect(sync[0].type)
        .toBe('warning');
    });

    it('falls back to the generic other bucket for unknown ERROR/WARNING messages', () => {
      const [result] = new ExceptionParser({ matchPath: '' })
        .parseAll('====== ERROR: custom sanitizer issue for other class error 1');

      expect(result.questionType)
        .toBe('other');
      expect(result.type)
        .toBe('error');
      expect(result.title)
        .toBe('custom sanitizer issue for other class error 1');
      expect(result.exceptionName)
        .toBe('custom sanitizer issue for other class error 1');
      expect(result.question)
        .toBe('custom sanitizer issue for other class error 1');
    });

    it('ignores lines without a supported prefix and returns no results', () => {
      const parser = new ExceptionParser({ matchPath: '' });

      expect(parser.parseAll(''))
        .toEqual([]);
      expect(parser.parseAll('   \n\n  '))
        .toEqual([]);
      expect(parser.parseAll('====== SUMMARY: nothing active'))
        .toEqual([]);
      expect(parser.parseAll('======'))
        .toEqual([]);
      expect(parser.parseAll('[mssanitizer] Start memcheck on kernel AddLora_test\nsome random text'))
        .toEqual([]);
    });

    it('does not treat a bare LeakCheck line as an exception start', () => {
      // The supported-pattern scan still requires an ERROR:/WARNING: prefix;
      // the leak header is only matched through the "direct leak of" form.
      const results = new ExceptionParser({ matchPath: '' })
        .parseAll('====== LeakCheck: detected memory leaks');

      expect(results)
        .toEqual([]);
    });

    it('parses LeakCheck headers when they carry an ERROR prefix', () => {
      const [result] = new ExceptionParser({ matchPath: '' })
        .parseAll('====== ERROR: LeakCheck: detected memory leaks');

      expect(result.questionType)
        .toBe('memory');
      expect(result.exceptionName)
        .toBe('exceptionParser.memoryLeak');
      expect(result.type)
        .toBe('error');
    });

    it('parses consecutive blocks without a SUMMARY separator', () => {
      const content = [
        '====== ERROR: illegal read of size 4',
        '====== ERROR: illegal write of size 8',
      ].join('\n');

      const results = new ExceptionParser({ matchPath: '' })
        .parseAll(content);

      expect(results)
        .toHaveLength(2);
      expect(results[0].exceptionName)
        .toBe('exceptionParser.illegalRead');
      expect(results[1].exceptionName)
        .toBe('exceptionParser.illegalWrite');
      expect(results[0].originData)
        .toContain('illegal read of size 4');
      expect(results[1].originData)
        .toContain('illegal write of size 8');
    });

    it('parses CRLF line endings', () => {
      const results = new ExceptionParser({ matchPath: '' })
        .parseAll('====== ERROR: illegal read of size 4\r\n====== SUMMARY: done\r\n');

      expect(results)
        .toHaveLength(1);
      expect(results[0].questionType)
        .toBe('memory');
    });

    it('resets state between parseAll calls', () => {
      const parser = new ExceptionParser({ matchPath: '' });

      const first = parser.parseAll([
        '====== ERROR: illegal read of size 4',
        '====== ERROR: illegal write of size 8',
      ].join('\n'));
      const second = parser.parseAll('====== ERROR: illegal free()');

      expect(first)
        .toHaveLength(2);
      expect(second)
        .toHaveLength(1);
      expect(second[0].exceptionName)
        .toBe('exceptionParser.illegalFree');
    });

    it('starts a result from a direct leak header and locates the allocation site', () => {
      const content = [
        '====== direct leak of 32 byte(s) in block allocated from',
        '======    allocated in main.cpp:55',
      ].join('\n');

      const [result] = new ExceptionParser({ matchPath: '' })
        .parseAll(content);

      expect(result.questionType)
        .toBe('memory');
      expect(result.type)
        .toBe('error');
      expect(result.exceptionName)
        .toBe('direct leak of 32 byte(s) in block allocated from');
      expect(result.fileLink)
        .toBe('main.cpp');
      expect(result.row)
        .toBe(55);
    });

    it('prefers the stack frame over the allocated-in line for the file link', () => {
      const content = [
        '====== direct leak of 16 byte(s) in block allocated from',
        '======    #0 C:/Projects/ops-math/tests/ut/add_custom.cpp:84:6',
        '======    allocated in main.cpp:55',
      ].join('\n');

      const [result] = new ExceptionParser({ matchPath: '' })
        .parseAll(content);

      expect(result.fileLink)
        .toBe('C:/Projects/ops-math/tests/ut/add_custom.cpp');
      expect(result.row)
        .toBe(84);
      expect(result.col)
        .toBe(6);
    });

    it('extracts the first absolute stack frame into fileLink, row and col', () => {
      const content = [
        '====== ERROR: illegal read of size 4',
        '======    #0 C:/Projects/ops-math/tests/ut/op_kernel_aicpu/utils/aicpu_test_utils.cpp:643:45',
        '======    #1 C:/Projects/ops-math/tests/ut/op_kernel_aicpu/utils/aicpu_read_file.cpp:238:17',
      ].join('\n');

      const [result] = new ExceptionParser({ matchPath: '' })
        .parseAll(content);

      expect(result.fileLink)
        .toBe('C:/Projects/ops-math/tests/ut/op_kernel_aicpu/utils/aicpu_test_utils.cpp');
      expect(result.row)
        .toBe(643);
      expect(result.col)
        .toBe(45);
    });

    it('accepts unix-style absolute stack paths', () => {
      const [result] = new ExceptionParser({ matchPath: '' })
        .parseAll([
          '====== ERROR: illegal read of size 4',
          '======    #0 /workspace/add_custom.cpp:21:5',
        ].join('\n'));

      expect(result.fileLink)
        .toBe('/workspace/add_custom.cpp');
      expect(result.row)
        .toBe(21);
      expect(result.col)
        .toBe(5);
    });

    it('uses a loose frame match for relative paths without a column', () => {
      const content = [
        '====== ERROR: illegal read of size 4',
        '======    #2 out_of_bound/add_custom.cpp:84',
      ].join('\n');

      const [result] = new ExceptionParser({ matchPath: '' })
        .parseAll(content);

      expect(result.fileLink)
        .toBe('add_custom.cpp');
      expect(result.row)
        .toBe(84);
      expect(result.col)
        .toBe(0);
    });

    it('keeps the deepest loose frame and ignores shallower ones', () => {
      const content = [
        '====== ERROR: illegal read of size 4',
        '======    #3 a/foo.cpp:84',
        '======    #5 b/bar.cpp:100',
        '======    #2 c/baz.cpp:1',
      ].join('\n');

      const [result] = new ExceptionParser({ matchPath: '' })
        .parseAll(content);

      expect(result.fileLink)
        .toBe('bar.cpp');
      expect(result.row)
        .toBe(100);
      expect(result.col)
        .toBe(0);
    });

    it('skips system stack frames entirely', () => {
      const content = [
        '====== ERROR: illegal read of size 4',
        '======    #0 ${ASCEND_HOME_PATH}/compiler/lib/foo.cpp:1:1',
        '======    #1 C:/tools/tikcpp/runtime/runtime.cpp:2:2',
        '======    #2 /tmp/kernel_common.h:9:2',
        '======    #3 /tmp/kernel_event.h:3:3',
        '======    #4 C:/tools/kernel_operator_data_copy_impl.h:4:4',
      ].join('\n');

      const [result] = new ExceptionParser({ matchPath: '' })
        .parseAll(content);

      expect(result.fileLink)
        .toBeUndefined();
      expect(result.row)
        .toBeUndefined();
    });

    it('accepts the first frame that matches the workspace path', () => {
      const content = [
        '====== ERROR: illegal read of size 4',
        '======    #0 ${ASCEND_HOME_PATH}/compiler/lib/foo.cpp:1:1',
        '======    #1 C:/Projects/ops-math/tests/ut/op_api/test_op_api_main.cpp:643:13',
        '======    #2 C:/Projects/ops-math/tests/ut/common/tiling_context_faker.cpp:238:17',
      ].join('\n');

      const parser = new ExceptionParser({ matchPath: 'C:/Projects/ops-math' });
      const [result] = parser.parseAll(content);

      expect(result.fileLink)
        .toBe('C:/Projects/ops-math/tests/ut/op_api/test_op_api_main.cpp');
      expect(result.row)
        .toBe(643);
      expect(result.col)
        .toBe(13);
    });

    it('uses the code in line as a fallback location', () => {
      const [result] = new ExceptionParser({ matchPath: '' })
        .parseAll([
          '====== ERROR: illegal read of size 4',
          '======    code in add_custom.cpp:84',
        ].join('\n'));

      expect(result.fileLink)
        .toBe('add_custom.cpp');
      expect(result.row)
        .toBe(84);
    });

    it('does not treat code in pc current lines as source locations', () => {
      const [result] = new ExceptionParser({ matchPath: '' })
        .parseAll([
          '====== ERROR: illegal read of size 4',
          '======    code in pc current 0x33e1c (serialNo:258)',
        ].join('\n'));

      expect(result.fileLink)
        .toBeUndefined();
    });

    it('collects ======-only lines into the origin data', () => {
      const [result] = new ExceptionParser({ matchPath: '' })
        .parseAll([
          '====== ERROR: illegal read of size 4',
          '======',
          '====== SUMMARY: done',
        ].join('\n'));

      expect(result.originData)
        .toBe('====== ERROR: illegal read of size 4\n======');
    });

    it('parses a real-style msdebug log with multiple blocks', () => {
      const content = [
        '====== ERROR: uninitialized read of size 8',
        '======    at 0xfeff0 on PRIVATE in AddLora_test_high_performance',
        '======    in block aiv(0) on device 0',
        '======    code in pc current 0x33e1c (serialNo:258)',
        '======    #0 C:/Projects/ops-math/tests/ut/op_kernel_aicpu/utils/aicpu_test_utils.cpp:643:45',
        '======    #1 C:/Projects/ops-math/tests/ut/op_kernel_aicpu/utils/aicpu_read_file.cpp:238:17',
        '====== ERROR: illegal read of size 4',
        '======    at 0x123ffff8170c on PRIVATE in AddLora_test_high_performance',
        '======    code in pc current 0x270f4 (serialNo:927)',
        '======    #0 C:/Projects/ops-math/tests/ut/op_kernel_aicpu/utils/aicpu_read_file.cpp:75:9',
      ].join('\n');

      const results = new ExceptionParser({ matchPath: '' })
        .parseAll(content);

      expect(results)
        .toHaveLength(2);
      expect(results[0].questionType)
        .toBe('uninitialized');
      expect(results[0].fileLink)
        .toBe('C:/Projects/ops-math/tests/ut/op_kernel_aicpu/utils/aicpu_test_utils.cpp');
      expect(results[0].row)
        .toBe(643);
      expect(results[0].col)
        .toBe(45);
      expect(results[0].originData)
        .toContain('at 0xfeff0 on PRIVATE');
      expect(results[1].questionType)
        .toBe('memory');
      expect(results[1].fileLink)
        .toBe('C:/Projects/ops-math/tests/ut/op_kernel_aicpu/utils/aicpu_read_file.cpp');
      expect(results[1].row)
        .toBe(75);
      expect(results[1].col)
        .toBe(9);
    });

    it('parses unused-memory warnings that end with a summary', () => {
      const content = [
        '====== WARNING: Unused memory of 80 byte(s)',
        '======    at 0x12c1000000d8 on GM',
        '',
        '====== WARNING: Unused memory of 32 byte(s)',
        '======    at 0x12c0c0014000 on GM',
        '====== SUMMARY: 112byte(s) unused memory in 2 allocation(s)',
      ].join('\n');

      const results = new ExceptionParser({ matchPath: '' })
        .parseAll(content);

      expect(results)
        .toHaveLength(2);
      expect(results[0].type)
        .toBe('warning');
      expect(results[0].question)
        .toBe('Unused memory');
      expect(results[0].exceptionName)
        .toBe('exceptionParser.allocUnused');
      expect(results[0].fileLink)
        .toBeUndefined();
      expect(results[1].title)
        .toBe('Unused memory of 32 byte(s)');
    });

    it('starts a result when a supported pattern appears without a leading prefix', () => {
      // The pattern scanner accepts ERROR:/WARNING: anywhere in the line, so a
      // mid-line occurrence wins; the exception name is then empty because the
      // extraction regex is anchored at the start of the line.
      const [result] = new ExceptionParser({ matchPath: '' })
        .parseAll('====== blah ERROR: illegal read of size blah');

      expect(result.questionType)
        .toBe('memory');
      expect(result.type)
        .toBe('error');
      expect(result.exceptionName)
        .toBe('');
      expect(result.originData)
        .toContain('blah ERROR: illegal read of size blah');
    });
  });

  describe('streaming processLine', () => {
    it('ends the current block on a blank line', () => {
      const parser = new ExceptionParser({ matchPath: '' });

      parser.processLine('====== ERROR: illegal read of size 4');
      parser.processLine('====== #0 C:/Projects/ops-math/tests/ut/add_custom.cpp:21:5');
      parser.processLine('');
      parser.processLine('====== ERROR: illegal write of size 8');

      const results = parser.finalize();

      expect(results)
        .toHaveLength(2);
      expect(results[0].exceptionName)
        .toBe('exceptionParser.illegalRead');
      expect(results[0].originData)
        .toContain('add_custom.cpp');
      expect(results[1].exceptionName)
        .toBe('exceptionParser.illegalWrite');
    });

    it('ends the current block on a SUMMARY line', () => {
      const parser = new ExceptionParser({ matchPath: '' });

      parser.processLine('====== ERROR: illegal read of size 4');
      parser.processLine('====== SUMMARY: AddressSanitizer summary');
      parser.processLine('====== WARNING: out of bounds of size 8');

      const results = parser.finalize();

      expect(results)
        .toHaveLength(2);
      expect(results[0].originData).not.toContain('SUMMARY');
      expect(results[1].type)
        .toBe('warning');
    });

    it('finalizes without duplicating results', () => {
      const parser = new ExceptionParser({ matchPath: '' });

      parser.processLine('====== ERROR: illegal read of size 4');
      expect(parser.finalize())
        .toHaveLength(1);
      expect(parser.finalize())
        .toHaveLength(1);
    });
  });
});
