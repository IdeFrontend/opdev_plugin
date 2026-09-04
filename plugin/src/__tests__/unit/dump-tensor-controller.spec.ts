const mockQueryExecutionRecords = jest.fn();

jest.mock('@plugin/service/dump-tensor-service', () => ({ DumpTensorData: { getInstance: () => ({ queryExecutionRecords: mockQueryExecutionRecords }) } }));

import { dumpTensorMethods } from '@plugin/controller/dump-tensor-controller';

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
