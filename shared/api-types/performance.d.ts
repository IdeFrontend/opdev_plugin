export type PerformanceExecutionRecord = {
  key: string;
  title: string;
  timestamp: number;
  dirPath: string;
  children: (PerformanceRunDataFolder | PerformanceRunDataFile)[];
  marked?: boolean;
};

export type PerformanceRunDataFolder = {
  title: string;
  children: (PerformanceRunDataFolder | PerformanceRunDataFile)[];
};

export type PerformanceRunDataFile = {
  key: string;
  title: string;
  filePath: string;
  fileType: string;
};

export type GetPerformanceRunDataParams = {
  sort: { by: 'timestamp'; order: 'asc' | 'desc' };
};

export type GetPerformanceRunDataResult = {
  data: PerformanceExecutionRecord[];
};

export type MarkRecordParams = {
  key: string;
  marked: boolean;
};
