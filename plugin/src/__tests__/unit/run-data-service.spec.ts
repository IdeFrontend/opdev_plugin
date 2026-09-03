const mockStorageGet = jest.fn();
const mockStorageSet = jest.fn();
const mockQueryExecutionRecords = jest.fn();
const mockMarkRecord = jest.fn();
const mockUnmarkRecord = jest.fn();
const mockCollectSanitizerLogReports = jest.fn();
const mockReadWorkspaceCache = jest.fn();
const mockJoinIdeConfigPath = jest.fn();
const mockExistsSync = jest.fn();
const mockStatSync = jest.fn();

jest.mock('fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  statSync: (...args: unknown[]) => mockStatSync(...args),
}));

jest.mock('vscode', () => ({ workspace: { workspaceFolders: [{ uri: { fsPath: '/ws' } }] } }));

jest.mock('@plugin/helpers/ide-config-dir', () => ({ joinIdeConfigPath: mockJoinIdeConfigPath }));

jest.mock('@plugin/helpers/sanitizer-log-reports', () => {
  const actual = jest.requireActual('@plugin/helpers/sanitizer-log-reports');

  return {
    ...actual,
    collectSanitizerLogReports: mockCollectSanitizerLogReports,
  };
});

jest.mock('@plugin/helpers/workspace-cache', () => ({ readWorkspaceCache: mockReadWorkspaceCache }));

jest.mock('@plugin/class/permanent-storage', () => ({
  PermanentStorage: {
    getInstance: () => ({
      get: mockStorageGet,
      set: mockStorageSet,
    }),
  },
}));

jest.mock('@plugin/core/performance/performance-run-data', () => ({
  PerformanceRunData: {
    getInstance: () => ({
      queryExecutionRecords: mockQueryExecutionRecords,
      markRecord: mockMarkRecord,
      unmarkRecord: mockUnmarkRecord,
    }),
  },
}));

import * as fs from 'fs';
import * as vscode from 'vscode';
import { runDataService } from '@plugin/service/run-data-service';

const WORKSPACE_PATH = '/ws';
const LOG_PATH = '/ws/.vscode/mindstudio_sanitizer_log';
const MARKED_KEY = 'msSanitizer_marks';

describe('RunDataService.getPerformanceRunData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the records queried with the requested sort order', async () => {
    mockQueryExecutionRecords.mockResolvedValue([
      {
        id: 'run-1',
        timestamp: 100,
      },
    ]);

    const result = await runDataService.getPerformanceRunData({
      sort: {
        by: 'time',
        order: 'desc',
      },
    });

    expect(mockQueryExecutionRecords)
      .toHaveBeenCalledWith('time', 'desc');
    expect(result)
      .toEqual({
        data: [
          {
            id: 'run-1',
            timestamp: 100,
          },
        ],
      });
  });

  it('propagates failures from the performance run data store', async () => {
    mockQueryExecutionRecords.mockRejectedValue(new Error('store broken'));

    await expect(runDataService.getPerformanceRunData({
      sort: {
        by: 'time',
        order: 'asc',
      },
    }))
      .rejects
      .toThrow('store broken');
  });
});

describe('RunDataService.togglePerformanceRecordMark', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks the record when the marked flag is set', () => {
    runDataService.togglePerformanceRecordMark({
      key: 'run-1',
      marked: true,
    });

    expect(mockMarkRecord)
      .toHaveBeenCalledWith('run-1');
    expect(mockUnmarkRecord)
      .not.toHaveBeenCalled();
  });

  it('unmarks the record when the marked flag is not set', () => {
    runDataService.togglePerformanceRecordMark({
      key: 'run-1',
      marked: false,
    });

    expect(mockUnmarkRecord)
      .toHaveBeenCalledWith('run-1');
    expect(mockMarkRecord)
      .not.toHaveBeenCalled();
  });
});

describe('RunDataService.getSanitizerRunData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: WORKSPACE_PATH } }];
    mockJoinIdeConfigPath.mockReturnValue(LOG_PATH);
    mockStorageGet.mockReturnValue([]);
    mockCollectSanitizerLogReports.mockReturnValue([]);
    mockReadWorkspaceCache.mockReturnValue({});
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ isFile: () => true });
  });

  it('returns an empty list when no workspace folder is open', async () => {
    vscode.workspace.workspaceFolders = undefined;

    await expect(runDataService.getSanitizerRunData())
      .resolves
      .toEqual([]);
    expect(mockStorageGet)
      .not.toHaveBeenCalled();
  });

  it('returns an empty list when the workspace folder list is empty', async () => {
    vscode.workspace.workspaceFolders = [];

    await expect(runDataService.getSanitizerRunData())
      .resolves
      .toEqual([]);
  });

  it('combines sanitizer log reports with cache entries sorted by time desc', async () => {
    mockStorageGet.mockReturnValue(['sanitizer_/ws/map1.txt']);
    mockCollectSanitizerLogReports.mockReturnValue([
      {
        title: 'log-a',
        timestamp: 100,
        id: 'log-1',
        path: `${LOG_PATH}/mssanitizer_100.log`,
        marked: false,
      },
    ]);
    mockReadWorkspaceCache.mockReturnValue({
      fileMapLists: {
        sanitizer: [
          {
            filePath: '/ws/map1.txt',
            reportTime: 200,
          },
          {
            filePath: '/ws/map2.txt',
            reportTime: 300,
          },
        ],
      },
    });

    const result = await runDataService.getSanitizerRunData();

    expect(mockJoinIdeConfigPath)
      .toHaveBeenCalledWith(WORKSPACE_PATH, 'mindstudio_sanitizer_log');
    expect(mockStorageGet)
      .toHaveBeenCalledWith(MARKED_KEY, []);
    expect(result)
      .toEqual([
        {
          title: 'map2.txt',
          timestamp: 300,
          id: 'sanitizer_/ws/map2.txt',
          path: '/ws/map2.txt',
          marked: false,
        },
        {
          title: 'map1.txt',
          timestamp: 200,
          id: 'sanitizer_/ws/map1.txt',
          path: '/ws/map1.txt',
          marked: true,
        },
        {
          title: 'log-a',
          timestamp: 100,
          id: 'log-1',
          path: `${LOG_PATH}/mssanitizer_100.log`,
          marked: false,
        },
      ]);
  });

  it('titles a manually imported npu-check report like a log-directory one', async () => {
    mockReadWorkspaceCache.mockReturnValue({
      fileMapLists: {
        sanitizer: [
          {
            filePath: '/ws/mssanitizer_1766419043134-npu-check.log',
            reportTime: 200,
          },
        ],
      },
    });

    const result = await runDataService.getSanitizerRunData();

    // The title date is derived from the local timezone, so compute the
    // expected YYYYMMDD the same way instead of hard-coding one zone's date.
    const date = new Date(1766419043134);
    const expectedDate = [
      date.getFullYear(),
      (date.getMonth() + 1).toString()
        .padStart(2, '0'),
      date.getDate()
        .toString()
        .padStart(2, '0'),
    ].join('');

    expect(result)
      .toEqual([
        {
          title: `npu-check-${expectedDate}`,
          timestamp: 1766419043134,
          id: 'sanitizer_/ws/mssanitizer_1766419043134-npu-check.log',
          path: '/ws/mssanitizer_1766419043134-npu-check.log',
          marked: false,
        },
      ]);
  });

  it('titles a manually imported plain mssanitizer report with the mssanitizer prefix', async () => {
    mockReadWorkspaceCache.mockReturnValue({
      fileMapLists: {
        sanitizer: [
          {
            filePath: '/ws/mssanitizer_1700000000000.log',
            reportTime: 200,
          },
        ],
      },
    });

    const result = await runDataService.getSanitizerRunData();
    const date = new Date(1700000000000);
    const expectedDate = [
      date.getFullYear(),
      (date.getMonth() + 1).toString()
        .padStart(2, '0'),
      date.getDate()
        .toString()
        .padStart(2, '0'),
    ].join('');

    expect(result[0].title)
      .toBe(`mssanitizer-${expectedDate}`);
    expect(result[0].timestamp)
      .toBe(1700000000000);
  });

  it('keeps the raw file name for an imported report outside the mssanitizer naming scheme', async () => {
    mockReadWorkspaceCache.mockReturnValue({
      fileMapLists: {
        sanitizer: [
          {
            filePath: '/ws/custom-report.log',
            reportTime: 200,
          },
        ],
      },
    });

    const result = await runDataService.getSanitizerRunData();

    expect(result[0].title)
      .toBe('custom-report.log');
    expect(result[0].timestamp)
      .toBe(200);
  });

  it('falls back to an empty file map list when the cache has no sanitizer list', async () => {
    mockReadWorkspaceCache.mockReturnValue({});

    const result = await runDataService.getSanitizerRunData();

    expect(mockStatSync)
      .not.toHaveBeenCalled();
    expect(result)
      .toEqual([]);
  });

  it('skips cache entries whose file is missing on disk', async () => {
    mockReadWorkspaceCache.mockReturnValue({
      fileMapLists: {
        sanitizer: [
          {
            filePath: '/ws/map1.txt',
            reportTime: 200,
          },
        ],
      },
    });
    mockExistsSync.mockReturnValue(false);

    const result = await runDataService.getSanitizerRunData();

    expect(mockStatSync)
      .not.toHaveBeenCalled();
    expect(result)
      .toEqual([]);
  });

  it('skips cache entries whose file is not a regular file', async () => {
    mockReadWorkspaceCache.mockReturnValue({
      fileMapLists: {
        sanitizer: [
          {
            filePath: '/ws/dir.txt',
            reportTime: 200,
          },
        ],
      },
    });
    mockStatSync.mockReturnValue({ isFile: () => false });

    const result = await runDataService.getSanitizerRunData();

    expect(result)
      .toEqual([]);
  });
});

describe('RunDataService.toggleSanitizerMark', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('removes the id from the stored marks when it is already marked', async () => {
    mockStorageGet.mockReturnValue([
      'sanitizer_/ws/map1.txt',
      'sanitizer_/ws/map2.txt',
    ]);

    await runDataService.toggleSanitizerMark({ id: 'sanitizer_/ws/map1.txt' });

    expect(mockStorageSet)
      .toHaveBeenCalledWith(MARKED_KEY, ['sanitizer_/ws/map2.txt']);
  });

  it('adds the id to the stored marks when it is not marked yet', async () => {
    mockStorageGet.mockReturnValue(['sanitizer_/ws/map1.txt']);

    await runDataService.toggleSanitizerMark({ id: 'sanitizer_/ws/map2.txt' });

    expect(mockStorageSet)
      .toHaveBeenCalledWith(MARKED_KEY, [
        'sanitizer_/ws/map1.txt',
        'sanitizer_/ws/map2.txt',
      ]);
  });
});
