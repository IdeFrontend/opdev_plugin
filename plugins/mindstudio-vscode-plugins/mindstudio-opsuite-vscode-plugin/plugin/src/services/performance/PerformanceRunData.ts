import { PerformanceExecutionRecord } from 'shared:/api-types';
import { PermanentStorage } from 'plugin:/class/PermanentStorage';

const MARKED_STORAGE_KEY = 'marked_performance_records';

const mockData = [
  {
    title: 'msProf-20251014',
    key: 'msProf-20251014',
    timestamp: new Date('2025-10-14 08:50:00').getTime(),
    children: [
      {
        title: '算子性能数据文件',
        key: 'msProf-20251014-folder',
        children: [
          {
            title: 'example2.csv',
            key: 'msProf-20251014-example2',
            filePath: 'D:\\msttObj\\alldemos\\打开csv\\example2.csv',
            fileType: 'csv',
          },
          {
            title: 'example3.csv',
            key: 'msProf-20251014-example3',
            filePath: 'D:\\msttObj\\alldemos\\打开csv\\example3.csv',
            fileType: 'csv',
          },
          {
            title: 'data.BIN',
            key: 'msProf-20251014-data',
            filePath: 'D:\\msttObj\\alldemos\\打开csv\\data.BIN',
            fileType: 'bin',
          },
        ],
      },
    ],
  },
  {
    title: 'msProf-20251015',
    key: 'msProf-20251015',
    timestamp: new Date('2025-10-15 14:30:00').getTime(),
    children: [
      {
        title: '算子性能数据文件',
        key: 'msProf-20251015-folder',
        children: [
          {
            title: 'example.csv',
            key: 'msProf-20251015-example',
            filePath: 'D:\\msttObj\\alldemos\\打开csv\\example.csv',
            fileType: 'csv',
          },
          {
            title: 'data.BIN',
            key: 'msProf-20251015-data',
            filePath: 'D:\\msttObj\\alldemos\\打开csv\\data.BIN',
            fileType: 'bin',
          },
        ],
      },
    ],
  },
];

export class PerformanceRunData {
  private static instance: PerformanceRunData;

  static getInstance(): PerformanceRunData {
    if (!PerformanceRunData.instance) {
      PerformanceRunData.instance = new PerformanceRunData();
    }
    return PerformanceRunData.instance;
  }

  /**
   * 读取性能调优执行记录
   */
  public queryExecutionRecords(sortBy: string, order: 'asc' | 'desc', markedOnly: boolean): PerformanceExecutionRecord[] {
    // TODO mock
    const markedKeySet = this.queryMarkedRecordKeySet();
    return mockData.map((item) => ({
      ...item,
      marked: markedKeySet.has(item.key),
    }));
  }

  public markRecord(key: string): void {
    const keySet = this.queryMarkedRecordKeySet();
    keySet.add(key);
    PermanentStorage.getInstance().set<string[]>(MARKED_STORAGE_KEY, [...keySet]);
  }

  public unmarkRecord(key: string): void {
    const keySet = this.queryMarkedRecordKeySet();
    keySet.delete(key);
    PermanentStorage.getInstance().set<string[]>(MARKED_STORAGE_KEY, [...keySet]);
  }

  private queryMarkedRecordKeySet(): Set<string> {
    const storageValue = PermanentStorage.getInstance().get<string[]>(MARKED_STORAGE_KEY, []);
    return new Set(storageValue);
  }
}
