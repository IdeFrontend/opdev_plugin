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
  public queryExecutionRecords() {
    // TODO mock
    return [
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
                isLeaf: true,
                filePath: 'D:\\msttObj\\alldemos\\打开csv\\example2.csv',
                fileType: 'csv',
              },
              {
                title: 'example3.csv',
                key: 'msProf-20251014-example3',
                isLeaf: true,
                filePath: 'D:\\msttObj\\alldemos\\打开csv\\example3.csv',
                fileType: 'csv',
              },
              {
                title: 'data.BIN',
                key: 'msProf-20251014-data',
                isLeaf: true,
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
                isLeaf: true,
                filePath: 'D:\\msttObj\\alldemos\\打开csv\\example.csv',
                fileType: 'csv',
              },
              {
                title: 'data.BIN',
                key: 'msProf-20251015-data',
                isLeaf: true,
                filePath: 'D:\\msttObj\\alldemos\\打开csv\\data.BIN',
                fileType: 'bin',
              },
            ],
          },
        ],
      },
    ];
  }
}
