export interface QuestionData {
  // 问题名称
  title: string;
  // 错误类型
  type: 'error' | 'warning';
  // 问题类型
  questionType: QuestionType;
  // 问题
  question: string;
  // 源码文件
  fileLink?: string;
  // 行数
  row?: number;
  // 列数
  col?: number;
  // 原始数据
  originData: string;
}

// 问题大类
export type QuestionType =
  | 'memory'
  | 'memoryContention'
  | 'uninitialized'
  | 'synchronize';

// 内存大类
export const memorySet = new Set([
  'illegal read of size',
  'illegal write of size',
  'out of bounds of size',
  'misaligned access of size',
  'LeakCheck: detected memory leaks',
  'illegal free()',
  'Unused memory',
]);

// 内存竞争大类
export const memoryContentionSet = new Set([
  'Potential RAW hazard detected',
  'Potential WAW hazard detected',
  'Potential WAR hazard detected',
]);

// 未初始化大类
export const uninitializedSet = new Set(['uninitialized read of size']);

// 同步异常大类
export const synchronizeSet = new Set(['Unpaired set_flag insetructions detected']);

// 问题名称键值对
export const questionMap = new Map([
  [
    'illegal read of size',
    '非法读',
  ],
  [
    'illegal write of size',
    '非法写',
  ],
  [
    'out of bounds of size',
    '多核踩踏',
  ],
  [
    'misaligned access of size',
    '非对齐访问',
  ],
  [
    'LeakCheck: detected memory leaks',
    '内存泄漏',
  ],
  [
    'illegal free()',
    '非法释放',
  ],
  [
    'Unused memory',
    '非配内存未使用',
  ],
  [
    'Potential RAW hazard detected',
    '(Read-After-Write)内存数据竞争访问',
  ],
  [
    'Potential WAW hazard detected',
    '(Write-After-Write)内存数据竞争访问',
  ],
  [
    'Potential WAR hazard detected',
    '(Write-After-Read)内存数据竞争访问',
  ],
  [
    'uninitialized read of size',
    '未初始化异常',
  ],
  [
    'Unpaired set_flag insetructions detected',
    '同步异常',
  ],
]);

export const questionHandlerMap = new Map([
  [
    'illegal read of size',
    '非法读写异常信息的产生是由于算子程序中，通过读或写的方式访问了一块未分配的内存。此错误一般发生在GM或片上内存上，GM异常是由于GM分配的大小与实际算子程序中访问的范围不一致导致，而片上内存的异常是由于算子程序的访问范围超过硬件容量上限导致。',
  ],
  [
    'illegal write of size',
    '非法读写异常信息的产生是由于算子程序中，通过读或写的方式访问了一块未分配的内存。此错误一般发生在GM或片上内存上，GM异常是由于GM分配的大小与实际算子程序中访问的范围不一致导致，而片上内存的异常是由于算子程序的访问范围超过硬件容量上限导致。',
  ],
  [
    'out of bounds of size',
    'AI Core是昇腾AI处理器中的计算核心，AI处理器内部有多个AI Core，算子运行就在这些AI Core上。这些AI Core会在计算过程中从GM上搬入或搬出数据。当没有显式地进行核间同步时，如果各个核之间访问的GM内存存在重叠并且至少有一个核对重叠地址进行写入时，则会发生多核踩踏问题。这里我们通过所有者的概念来保证多核之间不会发生踩踏问题，当一块内存被某一个核写入后，这块内存就由该核所有。当其他核对这块内存进行访问时就会产生out of bounds异常。',
  ],
  [
    'misaligned access of size',
    '昇腾处理器上包含多种类型的内存，当通过DMA进行访问时，不同类型的内存在不同处理器上有不同的最小访问粒度。当访问的内存地址与最小访问粒度不对齐时，会发生数据异常或AI Core异常等问题。访问对齐检测可以在对齐问题发生时输出对齐异常信息。',
  ],
  [
    'LeakCheck: detected memory leaks',
    '内存检测可以检测出Device侧的内存泄漏问题，这些问题通常是开发者没有正确释放使用AscendCL接口申请的内存导致的，由于内部存储（Local Memory）目前不存在内存分配的概念，因此内存泄漏只可能出现在GM上。通过指定命令行参数“--leak-check=yes”可以开启内存泄漏检测。',
  ],
  [
    'illegal free()',
    '非法释放是指对一个未分配的地址或者已释放的地址进行了释放操作，一般发生在GM上。',
  ],
  [
    'Unused memory',
    '分配内存未使用是指算子运行时申请了内存，但直到算子运行完成，都没有使用该内存。该异常场景一般是算子使用了错误的内存或算子逻辑存在问题，一般发生在GM上。',
  ],
  [
    'Potential RAW hazard detected',
    '当两个内存事件（一个事件执行读取操作，另一个事件执行写入操作）尝试访问同一块内存时，可能存在这种异常，即读操作事件实际在写操作事件之前执行完毕，并导致读取到的内存值还未更新。',
  ],
  [
    'Potential WAW hazard detected',
    '当两个内存事件尝试向同一块内存写入时，可能存在这种异常，导致内存结果值取决于两个内存事件的实际访问顺序。',
  ],
  [
    'Potential WAR hazard detected',
    '当两个内存事件（一个事件执行读取操作，另一个事件执行写入操作）尝试访问同一块内存时，可能存在这种异常，即写操作事件实际在读操作事件之前执行完毕，并导致读取到的内存值并非预期起始值。',
  ],
  [
    'uninitialized read of size',
    '内存申请后为未初始化状态，未对内存进行写入，直接读取未初始化的值导致的异常。',
  ],
  [
    'Unpaired set_flag insetructions detected',
    '算子中存在未配对的SetFlag同步指令时，虽然对当前算子的功能没有直接影响，却会引发计数器状态错误。可能会扰乱后续算子的同步指令配对，进而影响后续算子的计算精度。',
  ],
]);
