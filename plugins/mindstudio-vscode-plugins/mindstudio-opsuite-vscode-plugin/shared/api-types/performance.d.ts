export type PerformanceExecutionRecord = {
  key: string;
  title: string;
  timestamp: number;
  marked?: boolean;
  children: (PerformanceRunDataFolder | PerformanceRunDataFile)[];
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
  sort: { by: keyof PerformanceExecutionRecord; order: 'asc' | 'desc' };
  markedOnly: boolean;
};

export type GetPerformanceRunDataResult = {
  data: PerformanceExecutionRecord[];
};

export type MarkRecordParams = {
  key: string;
  marked: boolean;
}