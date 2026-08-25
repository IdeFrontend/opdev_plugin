import {
  NpuCheckParser,
  parseNpuCheckStackFrame,
} from '@plugin/class/npu-check-parser';

// The two-section npu-check sample from the requirements (NPUSAN + NPU CHECK).
const FULL_SAMPLE = [
  '========= NPUSAN',
  '========= ERROR: Barrier error detected. Invalid arguments',
  '=========     at __cuda_sm70_warpsync+0x30',
  '=========     by thread (0,0,0) in block (0,0,0)@',
  '=========  Device Frame:',
  '=========     #0 __syncwarp(unsigned int)+0xf0 in /usr/local/cuda/include/sm_30_intrinsics.hpp:110',
  '=========     #1 Device Frame:myKernel(int *)+0x3c0 in /home/cuda/github/compute-sanitizer-samples/Synccheck/illegal_syncwarp.cu:48',
  '',
  '',
  '========= NPU CHECK',
  '========= WARNING: illegal read of size 4064',
  '=========     at 0x12c0c0036000 on GM in "op989467_custom(unsigned char*, unsigned',
  '=========     in block aiv(0) on device 0',
  '=========     code in pc current 0x3c30 (serialNo:2276)',
  '=========  Device Frame:',
  '=========     #0 /mnt/workspace/op989467/op989467.asc:84:9',
  '=========     #1 /mnt/workspace/op989467/op989467.asc:67:13',
  '=========     #2 /mnt/workspace/op989467/op989467.asc:143:8',
].join('\n');

describe('NpuCheckParser', () => {
  it('parses the official NPUSAN and NPU CHECK sample into two ordered results', () => {
    const parser = new NpuCheckParser();
    const results = parser.parseAll(FULL_SAMPLE);

    expect(results)
      .toHaveLength(2);
    expect(results[0].type)
      .toBe('error');
    expect(results[0].exceptionName)
      .toBe('Barrier error detected. Invalid arguments');
    expect(results[0].title)
      .toBe('Barrier error detected. Invalid arguments');
    expect(results[0].question)
      .toBe('Barrier error detected. Invalid arguments');
    expect(results[0].questionType)
      .toBe('other');
    expect(results[0].sourceTool)
      .toBe('npu-check');
    expect(results[0].fileLink)
      .toBe('/usr/local/cuda/include/sm_30_intrinsics.hpp');
    expect(results[0].row)
      .toBe(110);
    expect(results[0].col)
      .toBeUndefined();
    expect(results[1].type)
      .toBe('warning');
    expect(results[1].exceptionName)
      .toBe('illegal read of size 4064');
    expect(results[1].questionType)
      .toBe('other');
    expect(results[1].sourceTool)
      .toBe('npu-check');
    expect(results[1].fileLink)
      .toBe('/mnt/workspace/op989467/op989467.asc');
    expect(results[1].row)
      .toBe(84);
    expect(results[1].col)
      .toBe(9);
  });

  it('keeps tool headers and blank separators out of originData', () => {
    const parser = new NpuCheckParser();
    const results = parser.parseAll(FULL_SAMPLE);

    expect(results[0].originData)
      .toContain('========= ERROR: Barrier error detected. Invalid arguments');
    expect(results[0].originData)
      .toContain('=========  Device Frame:');
    expect(results[0].originData)
      .toContain('=========     #0 __syncwarp(unsigned int)+0xf0 in /usr/local/cuda/include/sm_30_intrinsics.hpp:110');
    expect(results[0].originData)
      .not
      .toContain('NPUSAN');
    expect(results[0].originData)
      .not
      .toContain('NPU CHECK');
    expect(results[0].originData)
      .not
      .toMatch(/\n\s*$/);
    expect(results[1].originData)
      .toContain('=========  Device Frame:');
    expect(results[1].originData)
      .toContain('=========     #0 /mnt/workspace/op989467/op989467.asc:84:9');
    expect(results[1].originData)
      .not
      .toContain('NPU CHECK');
  });

  it('resets state between parseAll calls', () => {
    const parser = new NpuCheckParser();

    expect(parser.parseAll(FULL_SAMPLE))
      .toHaveLength(2);
    expect(parser.parseAll(FULL_SAMPLE))
      .toHaveLength(2);
  });

  it('leaves fileLink unset for blocks without a Device Frame section', () => {
    const parser = new NpuCheckParser();
    const results = parser.parseAll(`==== ERROR: first failure
====     some detail line
==== ERROR: second failure
====     another detail line`);

    expect(results)
      .toHaveLength(2);
    expect(results[0].exceptionName)
      .toBe('first failure');
    expect(results[0].fileLink)
      .toBeUndefined();
    expect(results[0].row)
      .toBeUndefined();
    expect(results[1].exceptionName)
      .toBe('second failure');
  });

  it('keeps the path for invalid line numbers and falls through to the next frame with a path', () => {
    const parser = new NpuCheckParser();
    const results = parser.parseAll(`========= ERROR: bad line number
=========  Device Frame:
=========     #0 /path/to/a.cu:abc
========= ERROR: frame without path
=========  Device Frame:
=========     #0 somefunc+0x30
=========     #1 /path/b.cu:12`);

    expect(results)
      .toHaveLength(2);
    expect(results[0].fileLink)
      .toBe('/path/to/a.cu');
    expect(results[0].row)
      .toBeUndefined();
    expect(results[0].col)
      .toBeUndefined();
    expect(results[1].fileLink)
      .toBe('/path/b.cu');
    expect(results[1].row)
      .toBe(12);
  });

  it('tolerates varying equals and spaces, including the plural Device Frames header', () => {
    const parser = new NpuCheckParser();
    const results = parser.parseAll(`==== ERROR: x
====  Device Frame:
====     #0 /p/q.cu:1
==========      ERROR: y
===   WARNING: z
==  Device Frames:
==     #0 /r/s.cu:2`);

    expect(results)
      .toHaveLength(3);
    expect(results.map((r) => r.exceptionName))
      .toEqual([
        'x',
        'y',
        'z',
      ]);
    expect(results[0].fileLink)
      .toBe('/p/q.cu');
    expect(results[0].row)
      .toBe(1);
    expect(results[1].fileLink)
      .toBeUndefined();
    expect(results[2].fileLink)
      .toBe('/r/s.cu');
    expect(results[2].row)
      .toBe(2);
  });

  it('recognizes Device Frame, Device Frames and lowercase headers', () => {
    const parser = new NpuCheckParser();
    const results = parser.parseAll(`========= ERROR: singular
=========  Device Frame:
=========     #0 /a/b.c:1
========= WARNING: plural
=========  Device Frames:
=========     #0 /c/d.c:2
========= ERROR: lowercase
=========  device frame:
=========     #0 /e/f.c:3`);

    expect(results)
      .toHaveLength(3);
    expect(results[0].fileLink)
      .toBe('/a/b.c');
    expect(results[1].fileLink)
      .toBe('/c/d.c');
    expect(results[2].fileLink)
      .toBe('/e/f.c');
    expect(results[2].row)
      .toBe(3);
  });

  it('splits consecutive blocks with no blank line between them', () => {
    const parser = new NpuCheckParser();
    const results = parser.parseAll(`========= ERROR: first issue
=========     at 0x1000
========= WARNING: second issue
=========     in block aiv(0)
========= ERROR: third issue`);

    expect(results)
      .toHaveLength(3);
    expect(results.map((r) => r.exceptionName))
      .toEqual([
        'first issue',
        'second issue',
        'third issue',
      ]);
    expect(results.map((r) => r.type))
      .toEqual([
        'error',
        'warning',
        'error',
      ]);
  });

  it('does not treat description lines containing the in keyword as stack frames', () => {
    const parser = new NpuCheckParser();
    const results = parser.parseAll(`========= WARNING: illegal read of size 8
=========     at 0x1000 on GM in "myfunc(unsigned char*, unsigned char*)"
=========     in block aiv(0) on device 0
=========  Device Frame:
=========     #0 /src/kernel/my_kernel.cu:42`);

    expect(results)
      .toHaveLength(1);
    expect(results[0].fileLink)
      .toBe('/src/kernel/my_kernel.cu');
    expect(results[0].row)
      .toBe(42);
    expect(results[0].originData)
      .toContain('at 0x1000 on GM in "myfunc(unsigned char*, unsigned char*)"');
  });
});

describe('parseNpuCheckStackFrame', () => {
  it('parses "#N function in path:line" frames', () => {
    const frame = parseNpuCheckStackFrame('#0 __syncwarp(unsigned int)+0xf0 in /usr/local/cuda/include/sm_30_intrinsics.hpp:110');

    expect(frame)
      .toMatchObject({
        index: 0,
        filePath: '/usr/local/cuda/include/sm_30_intrinsics.hpp',
        row: 110,
        raw: '__syncwarp(unsigned int)+0xf0 in /usr/local/cuda/include/sm_30_intrinsics.hpp:110',
      });
    expect(frame?.col)
      .toBeUndefined();
  });

  it('parses "#N Device Frame:function in path:line" frames', () => {
    const frame = parseNpuCheckStackFrame('#1 Device Frame:myKernel(int *)+0x3c0 in /home/cuda/github/compute-sanitizer-samples/Synccheck/illegal_syncwarp.cu:48');

    expect(frame)
      .toMatchObject({
        index: 1,
        filePath: '/home/cuda/github/compute-sanitizer-samples/Synccheck/illegal_syncwarp.cu',
        row: 48,
      });
  });

  it('parses "#N path:line:col" frames', () => {
    const frame = parseNpuCheckStackFrame('#0 /mnt/workspace/op989467/op989467.asc:84:9');

    expect(frame)
      .toMatchObject({
        index: 0,
        filePath: '/mnt/workspace/op989467/op989467.asc',
        row: 84,
        col: 9,
      });
  });

  it('parses "#N path:line" frames', () => {
    const frame = parseNpuCheckStackFrame('#2 /path/to/file.cu:12');

    expect(frame)
      .toMatchObject({
        index: 2,
        filePath: '/path/to/file.cu',
        row: 12,
      });
    expect(frame?.col)
      .toBeUndefined();
  });

  it('keeps the path but drops invalid line numbers', () => {
    const frame = parseNpuCheckStackFrame('#0 /path/to/a.cu:abc');

    expect(frame)
      .toMatchObject({
        index: 0,
        filePath: '/path/to/a.cu',
      });
    expect(frame?.row)
      .toBeUndefined();
    expect(frame?.col)
      .toBeUndefined();
  });

  it('returns frames without any path with undefined filePath', () => {
    const frame = parseNpuCheckStackFrame('#0 somefunc+0x30');

    expect(frame)
      .toMatchObject({
        index: 0,
        raw: 'somefunc+0x30',
      });
    expect(frame?.filePath)
      .toBeUndefined();
    expect(frame?.row)
      .toBeUndefined();
  });

  it('returns null for non-frame lines', () => {
    expect(parseNpuCheckStackFrame('at 0x1000 on GM in "func()"'))
      .toBeNull();
    expect(parseNpuCheckStackFrame('Device Frame:'))
      .toBeNull();
    expect(parseNpuCheckStackFrame('#abc foo'))
      .toBeNull();
    expect(parseNpuCheckStackFrame('#0'))
      .toBeNull();
    expect(parseNpuCheckStackFrame(''))
      .toBeNull();
  });
});
