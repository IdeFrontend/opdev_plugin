const mockOpenCsvPreview = jest.fn();
const mockOpenInsight = jest.fn();

jest.mock('vscode', () => ({ Uri: { file: (fsPath: string) => ({ fsPath }) } }));

jest.mock('@plugin/core/view/view-opener', () => ({
  ViewOpener: {
    openCsvPreview: mockOpenCsvPreview,
    openInsight: mockOpenInsight,
  },
}));

import { viewService } from '@plugin/service/view-service';

describe('ViewService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOpenCsvPreview.mockResolvedValue(undefined);
    mockOpenInsight.mockResolvedValue(undefined);
  });

  it('opens a CSV preview for the file uri', async () => {
    await viewService.openCsvFile('/ws/report/data.csv');

    expect(mockOpenCsvPreview)
      .toHaveBeenCalledWith({ fsPath: '/ws/report/data.csv' });
    expect(mockOpenInsight)
      .not.toHaveBeenCalled();
  });

  it('opens the insight data view for the file uri', async () => {
    await viewService.openInsight('/ws/report/insight.json');

    expect(mockOpenInsight)
      .toHaveBeenCalledWith({ fsPath: '/ws/report/insight.json' });
    expect(mockOpenCsvPreview)
      .not.toHaveBeenCalled();
  });
});
