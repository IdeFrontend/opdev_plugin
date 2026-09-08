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

// CANN 9.2.0 aclsan report: the first line of every logger message carries an
// "npu_check: <LEVEL>" tag before the "=" decoration, the diagnostic is
// followed by the example's own program output, and the report ends with
// SUMMARY/SESSION_END metadata lines.
const TAGGED_SAMPLE = [
  'npu_check: DIAGNOSTIC ========= ERROR: Invalid GM read of size 8256 bytes',
  '=========     at CopyGmToUbufAlignV2<float, (AscendC::PaddingMode)0>+0x0 in /home/cty/cann_0819/cann-9.2.0/asc/include/basic_api/../../impl/basic_api/dav_3510/core_mng/roc/../../kernel_operator_data_copy_impl.h:84',
  '=========     by aicore (75) type (AIV) block (7) pipe (MTE2)',
  '=========     Address 0x120000025000 is out of bounds',
  '=========     and is 64 bytes after the nearest allocation at 0x120000017000 of size 65536 bytes',
  '=========  Device Frames:',
  '=========     [CALL-STACK] pc=0x188 status=available binary_id=1',
  '=========       #0 CopyGmToUbufAlignV2<float, (AscendC::PaddingMode)0> at /home/cty/cann_0819/cann-9.2.0/asc/include/basic_api/../../impl/basic_api/dav_3510/core_mng/roc/../../kernel_operator_data_copy_impl.h:84:13',
  '=========       #1 DataCopyGM2UBImpl<float> at /home/cty/cann_0819/cann-9.2.0/asc/include/basic_api/../../impl/basic_api/dav_3510/core_mng/roc/../../kernel_operator_data_copy_impl.h:262:13',
  '=========       #2 DataCopy<float> at /home/cty/cann_0819/cann-9.2.0/asc/include/basic_api/../../impl/basic_api/dav_3510/core_mng/roc/../../kernel_operator_data_copy_impl.h:79:9',
  '=========       #3 DataCopy<float> at /home/cty/cann_0819/cann-9.2.0/asc/include/basic_api/../../impl/basic_api/dav_3510/core_mng/roc/../../kernel_operator_data_copy_impl.h:833:5',
  '=========       #4 add_custom<2048U> at /home/cty/asc-tools-aclsan/npu_sanitizer/demo/examples/add/add.asc:45:5',
  '=========     #0 CopyGmToUbufAlignV2<float, (AscendC::PaddingMode)0> [0x188] in /home/cty/cann_0819/cann-9.2.0/asc/include/basic_api/../../impl/basic_api/dav_3510/core_mng/roc/../../kernel_operator_data_copy_impl.h:84:13',
  '=========     #1 DataCopyGM2UBImpl<float> [0x188] in /home/cty/cann_0819/cann-9.2.0/asc/include/basic_api/../../impl/basic_api/dav_3510/core_mng/roc/../../kernel_operator_data_copy_impl.h:262:13',
  '=========     #2 DataCopy<float> [0x188] in /home/cty/cann_0819/cann-9.2.0/asc/include/basic_api/../../impl/basic_api/dav_3510/core_mng/roc/../../kernel_operator_data_copy_impl.h:79:9',
  '=========     #3 DataCopy<float> [0x188] in /home/cty/cann_0819/cann-9.2.0/asc/include/basic_api/../../impl/basic_api/dav_3510/core_mng/roc/../../kernel_operator_data_copy_impl.h:833:5',
  '=========     #4 add_custom<2048U> [0x188] in /home/cty/asc-tools-aclsan/npu_sanitizer/demo/examples/add/add.asc:45:5',
  '',
  'Output: 0 0.3 0.6 0.9 1.2 1.5 1.8 2.1 2.4 2.7 3 3.3 3.6 3.9 4.2 4.5 4.8 5.1 5.4 5.7 ...',
  'Golden: 0 0.3 0.6 0.9 1.2 1.5 1.8 2.1 2.4 2.7 3 3.3 3.6 3.9 4.2 4.5 4.8 5.1 5.4 5.7 ...',
  'test pass!',
  'npu_check: SUMMARY tool=memcheck allocations=3 frees=3 device_operations=24 synchronizations=1 errors=1 warnings=0 pending_device_operations=0 dropped_device_operations=0 callbacks=31 malformed_callbacks=0 framework_errors=0 dropped_messages=0',
  'npu_check: SESSION_END status=complete aclsan_unsubscribe=0 dropped_messages=0',
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

  it('parses reports whose logger lines carry the "npu_check: <LEVEL>" tag', () => {
    const parser = new NpuCheckParser();
    const results = parser.parseAll(TAGGED_SAMPLE);

    expect(results)
      .toHaveLength(1);
    expect(results[0].type)
      .toBe('error');
    expect(results[0].exceptionName)
      .toBe('Invalid GM read of size 8256 bytes');
    expect(results[0].sourceTool)
      .toBe('npu-check');
    expect(results[0].fileLink)
      .toBe('/home/cty/cann_0819/cann-9.2.0/asc/include/basic_api/../../impl/basic_api/dav_3510/core_mng/roc/../../kernel_operator_data_copy_impl.h');
    expect(results[0].row)
      .toBe(84);
    expect(results[0].col)
      .toBe(13);
  });

  it('keeps program output and logger metadata lines out of tagged results', () => {
    const parser = new NpuCheckParser();
    const results = parser.parseAll(TAGGED_SAMPLE);

    expect(results[0].originData)
      .toContain('npu_check: DIAGNOSTIC ========= ERROR: Invalid GM read of size 8256 bytes');
    expect(results[0].originData)
      .toContain('#4 add_custom<2048U> at /home/cty/asc-tools-aclsan/npu_sanitizer/demo/examples/add/add.asc:45:5');
    expect(results[0].originData)
      .not
      .toContain('Output:');
    expect(results[0].originData)
      .not
      .toContain('Golden:');
    expect(results[0].originData)
      .not
      .toContain('SUMMARY');
    expect(results[0].originData)
      .not
      .toContain('SESSION_END');
  });

  it('ends the current block at a logger metadata line even without a blank separator', () => {
    const parser = new NpuCheckParser();
    const results = parser.parseAll(`npu_check: DIAGNOSTIC ========= WARNING: illegal read of size 4064
=========     at somefunc in /src/kernel/k.cu:42
npu_check: SUMMARY tool=memcheck errors=1
npu_check: SESSION_END status=complete`);

    expect(results)
      .toHaveLength(1);
    expect(results[0].type)
      .toBe('warning');
    expect(results[0].exceptionName)
      .toBe('illegal read of size 4064');
    expect(results[0].originData)
      .toContain('at somefunc in /src/kernel/k.cu:42');
    expect(results[0].originData)
      .not
      .toContain('SUMMARY');
    expect(results[0].originData)
      .not
      .toContain('SESSION_END');
  });

  it('parses the bracketed group tag after ERROR:/WARNING: into groupName', () => {
    const parser = new NpuCheckParser();
    const results = parser.parseAll(`========= ERROR:[MEMCHECK] Invalid GM read of size 32 bytes
=========     at 0x1000
========= WARNING:[INITCHECK] Invalid GM read of size 8 bytes
=========     at 0x2000
========= ERROR:[RACECHECK] Invalid GM read of size 4 bytes
=========     at 0x3000
========= ERROR: no group on this one
=========     at 0x4000`);

    expect(results)
      .toHaveLength(4);
    expect(results.map((r) => r.groupName))
      .toEqual([
        'MEMCHECK',
        'INITCHECK',
        'RACECHECK',
        undefined,
      ]);
    // The group tag is stripped from the title/exception name.
    expect(results[0].exceptionName)
      .toBe('Invalid GM read of size 32 bytes');
    expect(results[0].title)
      .toBe('Invalid GM read of size 32 bytes');
    expect(results[0].question)
      .toBe('Invalid GM read of size 32 bytes');
    expect(results[1].exceptionName)
      .toBe('Invalid GM read of size 8 bytes');
    expect(results[3].exceptionName)
      .toBe('no group on this one');
    // The raw block keeps the original line including the group tag.
    expect(results[0].originData)
      .toContain('ERROR:[MEMCHECK] Invalid GM read of size 32 bytes');
  });

  it('jumps to the first frame located inside the configured project directory', () => {
    const parser = new NpuCheckParser({ matchPath: '/home/cty/asc-tools-aclsan/npu_tools/npu_sanitizer' });
    const results = parser.parseAll(`========= ERROR:[MEMCHECK] Invalid GM read of size 32 bytes
=========  Device Frames:
=========       #0 asc_sync_notify_impl_aiv at /home/cty/cann_0831/cann-9.2.0/asc/impl/c_api/instr_impl/npu_arch_3510/sync_impl/asc_sync_notify_impl.h:85:13
=========       #1 asc_sync_notify_impl at /home/cty/cann_0831/cann-9.2.0/asc/impl/c_api/instr_impl/npu_arch_3510/sync_impl/asc_sync_notify_impl.h:113:9
=========       #2 asc_sync_notify at /home/cty/cann_0831/cann-9.2.0/asc/impl/c_api/instr_impl/npu_arch_3510/sync_impl.h:47:81
=========       #3 UnconsumedSetFlag at /home/cty/asc-tools-aclsan/npu_tools/npu_sanitizer/demo/examples/basic_func/dual_tool_multi_launch_aggregate/dual_tool_multi_launch_aggregate.asc:62:5
=========       #4 UnconsumedGetEnv at /home/cty/asc-tools-aclsan/npu_tools/npu_sanitizer/demo/examples/basic_func/dual_tool_multi_launch_aggregate/dual_tool_multi_launch_aggregate.asc:85:4`);

    expect(results)
      .toHaveLength(1);
    expect(results[0].fileLink)
      .toBe('/home/cty/asc-tools-aclsan/npu_tools/npu_sanitizer/demo/examples/basic_func/dual_tool_multi_launch_aggregate/dual_tool_multi_launch_aggregate.asc');
    expect(results[0].row)
      .toBe(62);
    expect(results[0].col)
      .toBe(5);
  });

  it('falls back to the first frame with a path when no frame is inside the project', () => {
    const parser = new NpuCheckParser({ matchPath: '/home/somewhere/else' });
    const results = parser.parseAll(`========= ERROR:[MEMCHECK] Invalid GM read of size 32 bytes
=========  Device Frames:
=========       #0 asc_sync_notify_impl_aiv at /home/cty/cann_0831/asc_sync_notify_impl.h:85:13
=========       #1 UnconsumedSetFlag at /home/cty/asc-tools-aclsan/npu_sanitizer/dual_tool_multi_launch_aggregate.asc:62:5`);

    expect(results[0].fileLink)
      .toBe('/home/cty/cann_0831/asc_sync_notify_impl.h');
    expect(results[0].row)
      .toBe(85);
  });

  it('matches project paths with a trailing separator and Windows-style separators', () => {
    const parser = new NpuCheckParser({ matchPath: 'D:\\proj\\ops\\' });
    const results = parser.parseAll(`========= ERROR:[MEMCHECK] bad access
=========  Device Frames:
=========       #0 kernel at D:/proj/ops/src/kernel.cu:12:3
=========       #1 other at /usr/local/cuda/include/x.h:1:1`);

    expect(results[0].fileLink)
      .toBe('D:/proj/ops/src/kernel.cu');
    expect(results[0].row)
      .toBe(12);
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
