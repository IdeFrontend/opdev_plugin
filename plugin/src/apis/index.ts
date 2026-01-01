import { ApiGroup } from 'plugin:/core/ApiServer';

import { commonApis } from './common';
import { performanceApis } from './performance';
import { msSanitizerApis } from './ms-sanitizer';
import { viewApis } from './view';
import { opsApis } from './ops';
import { webviewApis } from './webview';

export const apis: ApiGroup = {
  ...commonApis,
  ...performanceApis,
  ...viewApis,
  ...msSanitizerApis,
  ...opsApis,
  ...webviewApis,
};
