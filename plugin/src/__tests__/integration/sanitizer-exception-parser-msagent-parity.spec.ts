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
 * Parity: mstt ExceptionParser vs ms-agent logParser on the same memcheck log fixtures.
 * Ensures count, order, line, file basename, and error kind match so msagent.fixProblem(index) aligns with sidebar rows.
 *
 * Requires ms-agent as a sibling folder: <workspace>/ms-agent (alongside <workspace>/mstt).
 * Skips all tests if ms-agent sources or fixtures are missing (e.g. CI clone without sibling repo).
 */

jest.mock('i18next', () => ({ t: (key: string) => key }));

import * as fs from 'fs';
import * as path from 'path';
import {
  ExceptionParser, type Result,
} from '../../class/exception-parser';

/** Workspace sibling: integration -> ../../../../../ = parent of mstt, then ms-agent */
const MS_AGENT_ROOT = path.join(__dirname, '../../../../../ms-agent');
const MS_AGENT_FIXTURES_DIR = path.join(MS_AGENT_ROOT, 'test/fixtures');
const MS_AGENT_LOG_PARSER = path.join(MS_AGENT_ROOT, 'src/parser/logParser.ts');

const MS_AGENT_AVAILABLE =
  fs.existsSync(MS_AGENT_LOG_PARSER)
  && fs.existsSync(path.join(MS_AGENT_FIXTURES_DIR, 'out_of_bounds.log'));

/** Minimal shape from ms-agent SanitizerDiagnostic (avoids static import when repo is absent). */
type MsAgentDiagFingerprintSource = {
  lineNumber: number;
  fileName: string;
  errorType: string;
};

type ParseLogFn = (content: string)=> { diagnostics: MsAgentDiagFingerprintSource[] };

const FIXTURE_FILES = [
  'out_of_bounds.log',
  'illegal_read.log',
  'illegal_write.log',
  'misaligned_access.log',
  'mem_leak.log',
  'illegal_free.log',
  'uninitialized_read.log',
  'unused_memory.log',
  'no_errors.log',
  'mixed_errors.log',
] as const;

function inferMsAgentLikeKindFromMstt(r: Result): string {
  const text = `${r.title}\n${r.originData}`.toLowerCase();

  if (text.includes('out of bounds')) {
    return 'OUT_OF_BOUNDS';
  }

  if (text.includes('illegal read')) {
    return 'ILLEGAL_ADDR_READ';
  }

  if (text.includes('illegal write')) {
    return 'ILLEGAL_ADDR_WRITE';
  }

  if (text.includes('misaligned access')) {
    return 'MISALIGNED_ACCESS';
  }

  if (text.includes('direct leak') || text.includes('leakcheck')) {
    return 'MEM_LEAK';
  }

  if (text.includes('illegal free')) {
    return 'ILLEGAL_FREE';
  }

  if (text.includes('uninitialized read')) {
    return 'UNINITIALIZED_READ';
  }

  if (text.includes('unused memory')) {
    return 'MEM_UNUSED';
  }

  return `UNMAPPED:${text.slice(0, 120)
    .replace(/\s+/g, ' ')}`;
}

function fingerprintMsAgent(diags: MsAgentDiagFingerprintSource[]) {
  return diags.map((d) => ({
    line: d.lineNumber,
    file: path.basename(d.fileName),
    kind: d.errorType,
  }));
}

function fingerprintMstt(results: Result[]) {
  return results.map((r) => ({
    line: r.row ?? -1,
    file: path.basename(r.fileLink || ''),
    kind: inferMsAgentLikeKindFromMstt(r),
  }));
}

(MS_AGENT_AVAILABLE ? describe : describe.skip)(
  'Sanitizer: ExceptionParser vs ms-agent logParser parity',
  () => {
    let parseLog: ParseLogFn;

    beforeAll(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional sibling repo; avoid top-level import so mstt-only checkouts load this file
      const mod = require('../../../../../ms-agent/src/parser/logParser') as {
        parseLog: ParseLogFn;
      };

      parseLog = mod.parseLog;
    });

    // Empty string: `filePath.includes('')` is true, so user stack frames are accepted (matches real workspace usage).
    const matchPath = '';

    it.each([...FIXTURE_FILES])('fixture %s', (name) => {
      const filePath = path.join(MS_AGENT_FIXTURES_DIR, name);

      expect(fs.existsSync(filePath))
        .toBe(true);

      const content = fs.readFileSync(filePath, 'utf-8');
      const msResult = parseLog(content);
      const msttResults = new ExceptionParser({ matchPath })
        .parseAll(content);

      const a = fingerprintMsAgent(msResult.diagnostics);
      const b = fingerprintMstt(msttResults);

      expect(b.length)
        .toBe(a.length);

      for (let i = 0; i < a.length; i++) {
        expect(b[i].line)
          .toBe(a[i].line);
        expect(b[i].file)
          .toBe(a[i].file);
        expect(b[i].kind)
          .toBe(a[i].kind);
      }
    });
  },
);
