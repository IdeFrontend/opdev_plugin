import fs from 'node:fs';
import os from 'node:os';

import { ApiGroup } from 'plugin:/core/ApiServer';
import { CheckPathExistsParams, GetPerformanceRunDataParams, GetPerformanceRunDataResult } from 'shared:/api-types';
import { PerformanceRunData } from 'plugin:/services/performance/PerformanceRunData';

export const apis: ApiGroup = {
  common: {
    // TODO 页面重构期间临时使用，预加载Webview渲染前的数据
    loadBeforeWebviewRender() {
      return {
        userInfo: os.userInfo(),
      };
    },
    pathExists(params: CheckPathExistsParams): Promise<boolean> {
      return new Promise((resolve) => {
        fs.stat(params.path, (err, stats) => {
          if (params.mustFile) {
            resolve(!err && stats.isFile());
          } else {
            resolve(!err);
          }
        });
      });
    },
  },
  performance: {
    getRunData(params: GetPerformanceRunDataParams): GetPerformanceRunDataResult {
      return { data: PerformanceRunData.getInstance().queryExecutionRecords() };
    },
  },
};
