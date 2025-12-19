export type PerformanceRunData = {
  title: string;
  timestamp: number;
  children: (PerformanceRunDataFolder | PerformanceRunDataFile)[];
};

export type PerformanceRunDataFolder = {
  title: string;
  children: (PerformanceRunDataFolder | PerformanceRunDataFile)[];
};

export type PerformanceRunDataFile = {
  title: string;
  filePath: string;
  fileType: string;
};

export type GetPerformanceRunDataParams = {
  sort: { by: keyof PerformanceRunData; order: 'asc' | 'desc' };
  markedOnly: boolean;
};

export type GetPerformanceRunDataResult = {
  data: PerformanceRunData[];
};
