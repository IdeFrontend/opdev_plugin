import * as fs from 'fs';
import * as path from 'path';

import {
  isNestedNpuArchive,
  isNestedNpuArchive160,
  isNpuRep,
  isNpuRep160,
  NPU_REP_TYPE_NESTED,
  NPU_TYPE_NESTED_ARCHIVE,
  parseCsv,
  parseNpuRep,
  parseNpuRep160,
  parsePerformanceHints,
  type NpuRepHintParseResult,
} from '@plugin/core/profiling';

// ---------------------------------------------------------------------------
// Fixtures — real packs live in the profiling-report submodule `data/` so the
// parent repo does not vendor binary samples.
// ---------------------------------------------------------------------------

const SUBMODULE_DATA_DIR = path.resolve(__dirname, '../../../../profiling-report/data');

function readFixture(name: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(SUBMODULE_DATA_DIR, name)));
}

const UB_MESSAGE =
  'UB bank conflicts detected. Try to optimize local memory accesses, prefer sequential patterns instead of strided.';

function utf8(text: string): Uint8Array {
  return new TextEncoder()
    .encode(text);
}

// ---------------------------------------------------------------------------
// Synthetic packers — local ports of the submodule playground helpers
// (`playground/packNpuRep160.ts`, plus the 164-byte sample layout).
// ---------------------------------------------------------------------------

const REP_MAGIC = new TextEncoder()
  .encode('npu-rep\x00');
const REP_VERSION = 0x00010000;
const REP_HEAD_SIZE = 36;
const FILEINFO_160 = 160;
const FILEINFO_164 = 164;
const TYPE160_NESTED = 1;
const TYPE160_JSON = 2;
const TYPE160_CSV = 4;

interface RepEntry {
  name: string;
  type: number;
  data: Uint8Array;
}

/** Pack the product 160-byte `npu-rep` layout (mirror of the Python packer). */
function packNpuRep160(entries: RepEntry[]): Uint8Array {
  const n = entries.length;
  const dataStart = REP_HEAD_SIZE + n * FILEINFO_160;
  let total = dataStart;

  for (const { data } of entries) {
    total += data.byteLength;
  }

  const out = new Uint8Array(total);
  const head = new DataView(out.buffer, out.byteOffset, REP_HEAD_SIZE);

  out.set(REP_MAGIC, 0);
  head.setUint32(8, REP_VERSION, true);
  head.setUint16(12, 1, true); // origin
  head.setUint16(14, REP_HEAD_SIZE, true);
  head.setUint32(16, n, true);
  head.setUint32(20, FILEINFO_160, true);
  head.setUint32(24, 0, true);
  head.setBigUint64(28, BigInt(total), true);

  let offset = dataStart;

  entries.forEach(({
    name, type, data,
  }, i) => {
    const pos = REP_HEAD_SIZE + i * FILEINFO_160;
    const info = new DataView(out.buffer, out.byteOffset + pos, FILEINFO_160);

    out.set(REP_MAGIC, pos);
    const base = name.includes('/') ? name.slice(name.lastIndexOf('/') + 1) : name;

    out.set(new TextEncoder()
      .encode(base)
      .subarray(0, 127), pos + 8);
    info.setUint16(136, type, true);
    info.setUint16(138, 0, true);
    info.setUint32(140, 0, true);
    info.setBigUint64(144, BigInt(data.byteLength), true);
    info.setBigUint64(152, BigInt(offset), true);
    out.set(data, offset);
    offset += data.byteLength;
  });

  return out;
}

/** Pack the interim 164-byte `npu-rep` sample layout (`type` u32 at 136). */
function packNpuRep164(entries: RepEntry[]): Uint8Array {
  const n = entries.length;
  const dataStart = REP_HEAD_SIZE + n * FILEINFO_164;
  let total = dataStart;

  for (const { data } of entries) {
    total += data.byteLength;
  }

  const out = new Uint8Array(total);
  const head = new DataView(out.buffer, out.byteOffset, REP_HEAD_SIZE);

  out.set(REP_MAGIC, 0);
  head.setUint32(8, REP_VERSION, true);
  head.setUint16(14, REP_HEAD_SIZE, true);
  head.setUint32(16, n, true);
  head.setUint32(20, FILEINFO_164, true);
  head.setBigUint64(28, BigInt(total), true);

  let offset = dataStart;

  entries.forEach(({
    name, type, data,
  }, i) => {
    const pos = REP_HEAD_SIZE + i * FILEINFO_164;
    const info = new DataView(out.buffer, out.byteOffset + pos, FILEINFO_164);

    out.set(REP_MAGIC, pos);
    out.set(new TextEncoder()
      .encode(name)
      .subarray(0, 127), pos + 8);
    info.setUint32(136, type, true);
    info.setBigUint64(148, BigInt(data.byteLength), true);
    info.setBigUint64(156, BigInt(offset), true);
    out.set(data, offset);
    offset += data.byteLength;
  });

  return out;
}

// ---------------------------------------------------------------------------
// Synthetic hint pack content
// ---------------------------------------------------------------------------

const MESSAGES_CSV = [
  'HintMsgId,HintMsgText',
  `1,"${UB_MESSAGE}"`,
  '2,Second message',
  '3,Third message',
  '',
].join('\n');

const TYPES_CSV = [
  'HintTypeId,HintTypeName,HintPassed',
  '1,shared_bank_conflicts,1',
  '2,warp_occupancy_hint,1',
  '',
].join('\n');

const INSTRUCTION_HINTS_CSV = [
  'HintId,HintTypeId,HintMsgId,PC',
  '1,1,1,624191680372',
  '2,2,99,624191671880', // HintMsgId 99 is not in HintMessages → skipped
  '3,42,2,', // unknown type id + empty PC → typeName / pc omitted
  '',
].join('\n');

const SOURCE_LINE_HINTS_CSV = [
  'HintId,HintTypeId,HintMsgId,SourceLineId',
  '1,2,2,39',
  '2,1,3,',
  '',
].join('\n');

const KERNEL_HINTS_CSV = [
  'HintId,HintTypeId,HintMsgId',
  '1,1,3',
  '',
].join('\n');

/** One kernel hint resolving to message 1 — for leaves whose only message is id 1. */
const SINGLE_MESSAGE_KERNEL_HINTS_CSV = [
  'HintId,HintTypeId,HintMsgId',
  '1,1,1',
  '',
].join('\n');

function hintLeafEntries(): RepEntry[] {
  return [
    {
      name: 'HintMessages.csv',
      type: TYPE160_CSV,
      data: utf8(MESSAGES_CSV),
    },
    {
      name: 'HintTypes.csv',
      type: TYPE160_CSV,
      data: utf8(TYPES_CSV),
    },
    {
      name: 'InstructionHints.csv',
      type: TYPE160_CSV,
      data: utf8(INSTRUCTION_HINTS_CSV),
    },
    {
      name: 'SourceLineHints.csv',
      type: TYPE160_CSV,
      data: utf8(SOURCE_LINE_HINTS_CSV),
    },
    {
      name: 'KernelHints.csv',
      type: TYPE160_CSV,
      data: utf8(KERNEL_HINTS_CSV),
    },
  ];
}

const EXPECTED_SYNTHETIC_HINTS = [
  {
    message: UB_MESSAGE,
    typeName: 'shared_bank_conflicts',
    pc: '624191680372',
    origin: 'instruction',
  },
  {
    message: 'Second message',
    origin: 'instruction',
  },
  {
    message: 'Second message',
    typeName: 'warp_occupancy_hint',
    sourceLineId: '39',
    origin: 'sourceLine',
  },
  {
    message: 'Third message',
    typeName: 'shared_bank_conflicts',
    origin: 'sourceLine',
  },
  {
    message: 'Third message',
    typeName: 'shared_bank_conflicts',
    origin: 'kernel',
  },
];

const EMPTY_RESULT: NpuRepHintParseResult = {
  hints: [],
  sourceLines: new Map(),
};

// ---------------------------------------------------------------------------
// Real fixtures
// ---------------------------------------------------------------------------

describe('npu-rep performance hints', () => {
  describe('gelu.npu-rep (real 160-byte leaf pack)', () => {
    const bytes = readFixture('gelu.npu-rep');

    it('is detected as the 160-byte layout and joins 53 hints', () => {
      expect(isNpuRep160(bytes))
        .toBe(true);

      const { hints } = parsePerformanceHints(bytes);

      expect(hints)
        .toHaveLength(53);
      const origins = hints.reduce<Record<string, number>>((acc, hint) => {
        acc[hint.origin] = (acc[hint.origin] ?? 0) + 1;

        return acc;
      }, {});

      expect(origins)
        .toEqual({
          instruction: 25,
          sourceLine: 20,
          kernel: 8,
        });
    });

    it('keeps the joined row order instruction → sourceLine → kernel', () => {
      const { hints } = parsePerformanceHints(bytes);
      const origins = hints.map((hint) => hint.origin);

      expect(origins.slice(0, 25)
        .every((origin) => origin === 'instruction'))
        .toBe(true);
      expect(origins.slice(25, 45)
        .every((origin) => origin === 'sourceLine'))
        .toBe(true);
      expect(origins.slice(45)
        .every((origin) => origin === 'kernel'))
        .toBe(true);
    });

    it('decodes the quoted UB-message with embedded commas and keeps PCs exact', () => {
      const { hints } = parsePerformanceHints(bytes);

      const firstInstruction = hints.find((hint) => hint.origin === 'instruction');

      expect(firstInstruction?.pc)
        .toBe('624191680372');
      expect(firstInstruction?.pc)
        .toMatch(/^\d+$/);
      expect(hints.some((hint) => hint.message === UB_MESSAGE))
        .toBe(true);
      expect(hints.every((hint) => hint.message.length > 0))
        .toBe(true);
    });

    it('resolves no source lines (the gelu leaf packs no SourceLines.csv)', () => {
      const { sourceLines } = parsePerformanceHints(bytes);

      expect(sourceLines.size)
        .toBe(0);
    });
  });

  describe('result.npu-rep (real 160-byte metrics-only pack)', () => {
    it('parses with an empty hint result', () => {
      const bytes = readFixture('result.npu-rep');

      expect(isNpuRep160(bytes))
        .toBe(true);

      const parsed = parsePerformanceHints(bytes);

      expect(parsed.hints)
        .toEqual([]);
      expect(parsed.sourceLines.size)
        .toBe(0);
    });
  });

  describe('example160.npu-rep (real 160-byte leaf, no hint tables)', () => {
    it('is a 160-format leaf and yields zero hints', () => {
      const bytes = readFixture('example160.npu-rep');

      expect(isNpuRep160(bytes))
        .toBe(true);
      expect(parseNpuRep160(bytes).header.fileInfoCount)
        .toBe(9);

      const parsed = parsePerformanceHints(bytes);

      expect(parsed.hints)
        .toEqual([]);
      expect(parsed.sourceLines.size)
        .toBe(0);
    });
  });

  describe('parseNpuRep160 rejections (result.npu-rep)', () => {
    it('rejects bad magic, a non-NUL byte 7, bad version, truncation and bad origin', () => {
      const bytes = readFixture('result.npu-rep');

      const badMagic = new Uint8Array(bytes);

      badMagic[0] = 0x58; // 'X'
      expect(() => parseNpuRep160(badMagic))
        .toThrow(/magic/);

      // Exact 8-byte magic: a valid `npu-rep` prefix with a wrong trailing byte
      // (not NUL) must also be rejected.
      const badNul = new Uint8Array(bytes);

      badNul[7] = 0x58;
      expect(() => parseNpuRep160(badNul))
        .toThrow(/magic/);
      expect(isNpuRep160(badNul))
        .toBe(false);

      const badVersion = new Uint8Array(bytes);

      new DataView(badVersion.buffer, badVersion.byteOffset, badVersion.byteLength)
        .setUint32(
          8,
          0x00020000,
          true,
        );
      expect(() => parseNpuRep160(badVersion))
        .toThrow(/version/);

      const truncated = bytes.subarray(0, bytes.byteLength - 10);

      expect(() => parseNpuRep160(truncated))
        .toThrow(/npuRepLength/);

      const badOrigin = new Uint8Array(bytes);

      new DataView(badOrigin.buffer, badOrigin.byteOffset, badOrigin.byteLength)
        .setUint16(12, 0, true);
      expect(() => parseNpuRep160(badOrigin))
        .toThrow(/origin/);
    });

    it('rejects a non-null-terminated embed name', () => {
      const packed = packNpuRep160([
        {
          name: 'a.csv',
          type: TYPE160_CSV,
          data: utf8('x'),
        },
      ]);
      const nameOffset = REP_HEAD_SIZE + 8; // head + FileInfo magic

      packed.fill(0x61, nameOffset, nameOffset + 128); // 'a' × 128, no NUL

      expect(() => parseNpuRep160(packed))
        .toThrow(/null-terminated/);
    });

    it('round-trips packNpuRep160 → parseNpuRep160', () => {
      const packed = packNpuRep160([
        {
          name: 'OpBasicInfo.csv',
          type: TYPE160_CSV,
          data: utf8('a,b\n1,2'),
        },
        {
          name: 'trace.json',
          type: TYPE160_JSON,
          data: utf8('{}'),
        },
      ]);

      const parsed = parseNpuRep160(packed);

      expect(parsed.files.map((f) => f.name))
        .toEqual([
          'OpBasicInfo.csv',
          'trace.json',
        ]);
      expect(parsed.files.map((f) => f.type))
        .toEqual([
          TYPE160_CSV,
          TYPE160_JSON,
        ]);
      expect(new TextDecoder()
        .decode(parsed.payloads['trace.json']))
        .toBe('{}');
    });
  });

  describe('example.npu.rep (real 164-byte multi-operator sample)', () => {
    const bytes = readFixture('example.npu.rep');

    it('parseNpuRep exposes two nested type-6 archives and their leaves', () => {
      const parsed = parseNpuRep(bytes);

      expect(isNpuRep(bytes))
        .toBe(true);
      expect(isNpuRep160(bytes))
        .toBe(false);
      expect(parsed.header.fileInfoCount)
        .toBe(2);
      expect(parsed.header.totalLength)
        .toBe(83506);
      expect(parsed.files.map((f) => f.name))
        .toEqual([
          'op1.npu.rep',
          'op2.npu.rep',
        ]);
      expect(parsed.files.every((f) => f.type === NPU_TYPE_NESTED_ARCHIVE))
        .toBe(true);
      expect(parsed.files.every((f) => isNestedNpuArchive(f, parsed.payloads[f.name])))
        .toBe(true);

      const leaf = parseNpuRep(parsed.payloads['op1.npu.rep']);

      expect(leaf.header.fileInfoCount)
        .toBe(11);
      expect(leaf.payloads['trace.json'].byteLength)
        .toBeGreaterThan(0);
      expect(leaf.payloads['OpBasicInfo.csv'])
        .toBeDefined();
      expect(leaf.payloads['PipeUtilization.csv'])
        .toBeDefined();
    });

    it('parseNpuRep rejections: bad magic, bad version, truncation', () => {
      const badMagic = new Uint8Array(bytes);

      badMagic[0] = 0x58; // 'X'
      expect(() => parseNpuRep(badMagic))
        .toThrow(/magic/);
      expect(isNpuRep(badMagic))
        .toBe(false);

      const badVersion = new Uint8Array(bytes);

      new DataView(badVersion.buffer, badVersion.byteOffset, badVersion.byteLength)
        .setUint32(
          8,
          0x00020000,
          true,
        );
      expect(() => parseNpuRep(badVersion))
        .toThrow(/version/);

      const truncated = bytes.subarray(0, bytes.byteLength - 10);

      expect(() => parseNpuRep(truncated))
        .toThrow(/npuRepLength/);
    });

    it('parses the leaves for the default, explicit and unknown operator ids', () => {
      // The committed sample leaves carry metric tables only, so every answer is
      // empty here; operator selection itself is covered by the synthetic packs.
      expect(parsePerformanceHints(bytes))
        .toEqual(EMPTY_RESULT);
      expect(parsePerformanceHints(bytes, { operatorId: 'op2.npu.rep' }))
        .toEqual(EMPTY_RESULT);
      expect(parsePerformanceHints(bytes, { operatorId: 'nope' }))
        .toEqual(EMPTY_RESULT);
    });
  });

  describe('synthetic 160 packs', () => {
    it('joins the five hint tables: order, skipped messages, exact pc/sourceLineId', () => {
      const packed = packNpuRep160(hintLeafEntries());

      const result = parsePerformanceHints(packed);

      expect(result.hints)
        .toEqual(EXPECTED_SYNTHETIC_HINTS);
      expect(result.sourceLines.size)
        .toBe(0);
    });

    it('finds payloads case-insensitively (lower- and upper-cased table names)', () => {
      const lower = packNpuRep160(hintLeafEntries()
        .map((entry) => ({
          ...entry,
          name: entry.name.toLowerCase(),
        })));
      const upper = packNpuRep160(hintLeafEntries()
        .map((entry) => ({
          ...entry,
          name: entry.name.toUpperCase(),
        })));

      expect(parsePerformanceHints(lower).hints)
        .toEqual(EXPECTED_SYNTHETIC_HINTS);
      expect(parsePerformanceHints(upper).hints)
        .toEqual(EXPECTED_SYNTHETIC_HINTS);
    });

    it('resolves referenced source lines from SourceLines/DebugInfo/SourceFiles', () => {
      const packed = packNpuRep160([
        ...hintLeafEntries()
          .filter((entry) => entry.name !== 'SourceLineHints.csv'),
        {
          name: 'SourceLineHints.csv',
          type: TYPE160_CSV,
          data: utf8([
            'HintId,HintTypeId,HintMsgId,SourceLineId',
            '1,2,2,39', // line 42 + file
            '2,1,3,40', // unparseable line, no debug info → absent
            '3,1,3,41', // line 100, no file
            '',
          ].join('\n')),
        },
        {
          name: 'SourceLines.csv',
          type: TYPE160_CSV,
          data: utf8([
            'SourceLineId,SourceLine',
            '39,42',
            '40,not-a-number',
            '41,100',
            '42,7', // not referenced by any hint → absent
            '',
          ].join('\n')),
        },
        {
          name: 'DebugInfo.csv',
          type: TYPE160_CSV,
          data: utf8([
            'DebugInfoId,SourceLineId,SourceFileId',
            '1,39,7',
            '',
          ].join('\n')),
        },
        {
          name: 'SourceFiles.csv',
          type: TYPE160_CSV,
          data: utf8([
            'SourceFileId,SourceFilePath',
            '7,/src/kernel.cpp',
            '',
          ].join('\n')),
        },
      ]);

      const result = parsePerformanceHints(packed);

      expect(result.hints
        .filter((hint) => hint.origin === 'sourceLine')
        .map((hint) => hint.sourceLineId))
        .toEqual([
          '39',
          '40',
          '41',
        ]);
      expect([...result.sourceLines.keys()].sort())
        .toEqual([
          '39',
          '41',
        ]);
      expect(result.sourceLines.get('39'))
        .toEqual({
          line: 42,
          file: '/src/kernel.cpp',
        });
      expect(result.sourceLines.get('41'))
        .toEqual({ line: 100 });
    });

    it('survives malformed auxiliary source tables (hints still returned)', () => {
      const packed = packNpuRep160([
        {
          name: 'HintMessages.csv',
          type: TYPE160_CSV,
          data: utf8(MESSAGES_CSV),
        },
        {
          name: 'SourceLineHints.csv',
          type: TYPE160_CSV,
          data: utf8(SOURCE_LINE_HINTS_CSV),
        },
        {
          name: 'KernelHints.csv',
          type: TYPE160_CSV,
          data: utf8(SINGLE_MESSAGE_KERNEL_HINTS_CSV),
        },
        {
          name: 'SourceLines.csv',
          type: TYPE160_CSV,
          data: utf8('garbage\n"unterminated, text\n'),
        },
        {
          name: 'DebugInfo.csv',
          type: TYPE160_CSV,
          data: utf8('not,the,expected,headers\n1\n'),
        },
      ]);

      const result = parsePerformanceHints(packed);

      // No HintTypes.csv in this leaf → every typeName stays unresolved, but the
      // garbage SourceLines/DebugInfo rows are simply ignored.
      expect(result.hints)
        .toEqual([
          {
            message: 'Second message',
            sourceLineId: '39',
            origin: 'sourceLine',
          },
          {
            message: 'Third message',
            origin: 'sourceLine',
          },
          {
            message: UB_MESSAGE,
            origin: 'kernel',
          },
        ]);
      expect(result.sourceLines.size)
        .toBe(0);
    });

    it('nested pack: first archive by default, explicit name or stem, unknown → empty', () => {
      const leafA = packNpuRep160([
        {
          name: 'HintMessages.csv',
          type: TYPE160_CSV,
          data: utf8('HintMsgId,HintMsgText\n1,Leaf A message\n'),
        },
        {
          name: 'KernelHints.csv',
          type: TYPE160_CSV,
          data: utf8(SINGLE_MESSAGE_KERNEL_HINTS_CSV),
        },
      ]);
      const leafB = packNpuRep160([
        {
          name: 'HintMessages.csv',
          type: TYPE160_CSV,
          data: utf8('HintMsgId,HintMsgText\n1,Leaf B message\n'),
        },
        {
          name: 'KernelHints.csv',
          type: TYPE160_CSV,
          data: utf8(SINGLE_MESSAGE_KERNEL_HINTS_CSV),
        },
      ]);
      const outer = packNpuRep160([
        {
          name: 'opA.npu.rep',
          type: TYPE160_NESTED,
          data: leafA,
        },
        {
          name: 'opB.npu.rep',
          type: TYPE160_NESTED,
          data: leafB,
        },
      ]);

      const parsed = parseNpuRep160(outer);
      const nested = parsed.files[0];

      expect(NPU_REP_TYPE_NESTED)
        .toBe(TYPE160_NESTED);
      expect(nested.type)
        .toBe(NPU_REP_TYPE_NESTED);
      expect(isNestedNpuArchive160(nested, parsed.payloads[nested.name]))
        .toBe(true);

      expect(parsePerformanceHints(outer).hints)
        .toEqual([
          {
            message: 'Leaf A message',
            origin: 'kernel',
          },
        ]);
      expect(parsePerformanceHints(outer, { operatorId: 'opB.npu.rep' }).hints)
        .toEqual([
          {
            message: 'Leaf B message',
            origin: 'kernel',
          },
        ]);
      expect(parsePerformanceHints(outer, { operatorId: 'opB' }).hints)
        .toEqual([
          {
            message: 'Leaf B message',
            origin: 'kernel',
          },
        ]);
      expect(parsePerformanceHints(outer, { operatorId: 'nope' }))
        .toEqual(EMPTY_RESULT);
    });
  });

  describe('synthetic 164 packs (nested operator selection)', () => {
    it('selects the operator archive by name, defaults to the first, unknown → empty', () => {
      const leafA = packNpuRep164([
        {
          name: 'HintMessages.csv',
          type: TYPE160_CSV,
          data: utf8('HintMsgId,HintMsgText\n1,Leaf A message\n'),
        },
        {
          name: 'KernelHints.csv',
          type: TYPE160_CSV,
          data: utf8(SINGLE_MESSAGE_KERNEL_HINTS_CSV),
        },
      ]);
      const leafB = packNpuRep164([
        {
          name: 'HintMessages.csv',
          type: TYPE160_CSV,
          data: utf8('HintMsgId,HintMsgText\n1,Leaf B message\n'),
        },
        {
          name: 'KernelHints.csv',
          type: TYPE160_CSV,
          data: utf8(SINGLE_MESSAGE_KERNEL_HINTS_CSV),
        },
      ]);
      const outer = packNpuRep164([
        {
          name: 'op1.npu.rep',
          type: NPU_TYPE_NESTED_ARCHIVE,
          data: leafA,
        },
        {
          name: 'op2.npu.rep',
          type: NPU_TYPE_NESTED_ARCHIVE,
          data: leafB,
        },
      ]);

      const parsed = parseNpuRep(outer);

      expect(parsed.files.every((f) => f.type === NPU_TYPE_NESTED_ARCHIVE))
        .toBe(true);
      expect(parsed.files.every((f) => isNestedNpuArchive(f, parsed.payloads[f.name])))
        .toBe(true);

      expect(parsePerformanceHints(outer).hints)
        .toEqual([
          {
            message: 'Leaf A message',
            origin: 'kernel',
          },
        ]);
      expect(parsePerformanceHints(outer, { operatorId: 'op2.npu.rep' }).hints)
        .toEqual([
          {
            message: 'Leaf B message',
            origin: 'kernel',
          },
        ]);
      expect(parsePerformanceHints(outer, { operatorId: 'nope' }))
        .toEqual(EMPTY_RESULT);
    });

    it('rejects an operator stem shared by two nested archives', () => {
      const leaf = packNpuRep164([
        {
          name: 'HintMessages.csv',
          type: TYPE160_CSV,
          data: utf8('HintMsgId,HintMsgText\n1,Leaf message\n'),
        },
        {
          name: 'KernelHints.csv',
          type: TYPE160_CSV,
          data: utf8(SINGLE_MESSAGE_KERNEL_HINTS_CSV),
        },
      ]);
      const outer = packNpuRep164([
        {
          name: 'op1.npu.rep',
          type: NPU_TYPE_NESTED_ARCHIVE,
          data: leaf,
        },
        {
          name: 'op1.rep',
          type: NPU_TYPE_NESTED_ARCHIVE,
          data: leaf,
        },
      ]);

      // Both archives share the stem `op1`: guessing one would show another
      // operator's hints, so the parse fails instead (the library does the same).
      expect(() => parsePerformanceHints(outer, { operatorId: 'op1' }))
        .toThrow(/^\[opdevtools profiling\] parsePerformanceHints: operator "op1" matches duplicate archives "op1\.npu\.rep" and "op1\.rep"$/);

      // The exact FileInfo name still wins over the ambiguous stem.
      expect(parsePerformanceHints(outer, { operatorId: 'op1.rep' }).hints)
        .toEqual([
          {
            message: 'Leaf message',
            origin: 'kernel',
          },
        ]);
    });
  });

  describe('parsePerformanceHints container guard', () => {
    it('throws when the input is not an npu-rep container', () => {
      expect(() => parsePerformanceHints(new Uint8Array([
        1,
        2,
        3,
      ])))
        .toThrow(/\[opdevtools profiling\] parsePerformanceHints: input is not an npu-rep container/);
    });

    it('reports every parse error with the [opdevtools profiling] prefix', () => {
      const bytes = readFixture('result.npu-rep');
      const badVersion = new Uint8Array(bytes);

      new DataView(badVersion.buffer, badVersion.byteOffset, badVersion.byteLength)
        .setUint32(
          8,
          0x00020000,
          true,
        );

      expect(() => parseNpuRep160(badVersion))
        .toThrow(/^\[opdevtools profiling\]/);
      expect(() => parseNpuRep160(badVersion)).not.toThrow(/\[profiling-report\]/);
    });
  });
});

// ---------------------------------------------------------------------------
// CSV primitives (ported cases from the submodule parseCsv spec)
// ---------------------------------------------------------------------------

describe('parseCsv (profiling port)', () => {
  it('keeps a quoted HintMessages text with embedded commas as one field', () => {
    const {
      headers, rows,
    } = parseCsv(`HintMsgId,HintMsgText\n1,"${UB_MESSAGE}"\n2,Plain message\n`);

    expect(headers)
      .toEqual([
        'HintMsgId',
        'HintMsgText',
      ]);
    expect(rows)
      .toHaveLength(2);
    expect(rows[0].HintMsgText)
      .toBe(UB_MESSAGE);
    expect(rows[1].HintMsgText)
      .toBe('Plain message');
  });

  it('unquotes double-quote escapes inside a quoted field', () => {
    const { rows } = parseCsv('A,B\n1,"say ""hi"" now"\n');

    expect(rows[0].B)
      .toBe('say "hi" now');
  });

  it('strips the BOM, splits CRLF, trims cells and skips blank lines', () => {
    const {
      headers, rows,
    } = parseCsv('\uFEFFHintMsgId , HintMsgText\r\n 1 , x \r\n\r\n');

    expect(headers)
      .toEqual([
        'HintMsgId',
        'HintMsgText',
      ]);
    expect(rows)
      .toEqual([
        {
          HintMsgId: '1',
          HintMsgText: 'x',
        },
      ]);
  });

  it('treats a mid-field quote as literal and keeps an unterminated quote as one field', () => {
    expect(parseCsv('A,B,C\n1,sa"y,3\n').rows[0])
      .toEqual({
        A: '1',
        B: 'sa"y',
        C: '3',
      });
    expect(parseCsv('A,B\n1,"unterminated, text\n').rows[0].B)
      .toBe('unterminated, text');
  });

  it('returns empty headers/rows for empty input', () => {
    expect(parseCsv(''))
      .toEqual({
        headers: [],
        rows: [],
      });
    expect(parseCsv('\n\n'))
      .toEqual({
        headers: [],
        rows: [],
      });
  });
});
