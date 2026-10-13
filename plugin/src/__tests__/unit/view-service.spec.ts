/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
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
