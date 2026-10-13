/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
const mockQueryExecutionRecords = jest.fn();
const mockMarkRecord = jest.fn();
const mockUnmarkRecord = jest.fn();
const mockDownloadReport = jest.fn();
const mockDiffFiles = jest.fn();

jest.mock('@plugin/service/dump-tensor-service', () => ({
  DumpTensorData: {
    getInstance: () => ({
      queryExecutionRecords: mockQueryExecutionRecords,
      markRecord: mockMarkRecord,
      unmarkRecord: mockUnmarkRecord,
    }),
  },
}));

jest.mock('@plugin/controller/performance-data-controller', () => ({
  performanceMethods: {
    downloadReport: mockDownloadReport,
    diffFiles: mockDiffFiles,
  },
}));

import { dumpTensorMethods } from '@plugin/controller/dump-tensor-controller';
import { performanceMethods } from '@plugin/controller/performance-data-controller';

describe('dumpTensorMethods.getDumpTensorData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the records queried with the requested sort order', async () => {
    mockQueryExecutionRecords.mockResolvedValue([
      {
        id: 'dump-1',
        timestamp: 100,
      },
    ]);

    const result = await dumpTensorMethods.getDumpTensorData({
      sort: {
        by: 'timestamp',
        order: 'asc',
      },
    });

    expect(mockQueryExecutionRecords)
      .toHaveBeenCalledWith('timestamp', 'asc');
    expect(result)
      .toEqual({
        data: [
          {
            id: 'dump-1',
            timestamp: 100,
          },
        ],
      });
  });

  it('propagates failures from the dump tensor service', async () => {
    mockQueryExecutionRecords.mockRejectedValue(new Error('log corrupted'));

    await expect(dumpTensorMethods.getDumpTensorData({
      sort: {
        by: 'timestamp',
        order: 'desc',
      },
    }))
      .rejects
      .toThrow('log corrupted');
  });
});

describe('dumpTensorMethods.toggleRecordMark', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks the record when the marked flag is set', () => {
    dumpTensorMethods.toggleRecordMark({
      key: 'run-1',
      marked: true,
    });

    expect(mockMarkRecord)
      .toHaveBeenCalledWith('run-1');
    expect(mockUnmarkRecord)
      .not.toHaveBeenCalled();
  });

  it('unmarks the record when the marked flag is not set', () => {
    dumpTensorMethods.toggleRecordMark({
      key: 'run-1',
      marked: false,
    });

    expect(mockUnmarkRecord)
      .toHaveBeenCalledWith('run-1');
    expect(mockMarkRecord)
      .not.toHaveBeenCalled();
  });
});

describe('dumpTensorMethods report actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDownloadReport.mockResolvedValue(undefined);
    mockDiffFiles.mockResolvedValue(undefined);
  });

  it('delegates downloadReport and diffFiles to the performance methods', async () => {
    expect(dumpTensorMethods.downloadReport)
      .toBe(performanceMethods.downloadReport);
    expect(dumpTensorMethods.diffFiles)
      .toBe(performanceMethods.diffFiles);

    await dumpTensorMethods.downloadReport({ dirPath: '/data/run-1' });
    await dumpTensorMethods.diffFiles({
      filePath1: '/data/run-1/a.txt',
      filePath2: '/data/run-2/a.txt',
    });

    expect(mockDownloadReport)
      .toHaveBeenCalledWith({ dirPath: '/data/run-1' });
    expect(mockDiffFiles)
      .toHaveBeenCalledWith({
        filePath1: '/data/run-1/a.txt',
        filePath2: '/data/run-2/a.txt',
      });
  });

  it('propagates download failures from the performance methods', async () => {
    mockDownloadReport.mockRejectedValue(new Error('disk full'));

    await expect(dumpTensorMethods.downloadReport({ dirPath: '/data/run-1' }))
      .rejects
      .toThrow('disk full');
  });
});
