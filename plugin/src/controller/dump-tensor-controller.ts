/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import {
  GetPerformanceRunDataParams,
  GetPerformanceRunDataResult,
  MarkRecordParams,
} from '@shared/api-types';
import { DumpTensorData } from '@plugin/service/dump-tensor-service';
import { performanceMethods } from '@plugin/controller/performance-data-controller';

export const dumpTensorMethods = {
  /**
   * Get DumpTensor operation result data
   * @param params query parameters
   * @returns running data results
   */
  async getDumpTensorData(params: GetPerformanceRunDataParams): Promise<GetPerformanceRunDataResult> {
    const data = await DumpTensorData.getInstance()
      .queryExecutionRecords(
        params.sort.by,
        params.sort.order,
      );

    return { data };
  },

  /**
   * Toggle the marking status of a record
   * @param params mark parameters
   */
  toggleRecordMark(params: MarkRecordParams): void {
    if (params.marked) {
      DumpTensorData.getInstance()
        .markRecord(params.key);
    }
    else {
      DumpTensorData.getInstance()
        .unmarkRecord(params.key);
    }
  },

  downloadReport: performanceMethods.downloadReport,
  diffFiles: performanceMethods.diffFiles,
};
