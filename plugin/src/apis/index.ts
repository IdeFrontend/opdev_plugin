import { ApiGroup } from 'plugin:/core/ApiServer';

import { commonMethods } from './common';
import { performanceMethods } from './performance';
import { msSanitizerMethods } from './ms-sanitizer';
import { viewMethods } from './view';
import { opsMethods } from './ops';
import { webviewMethods } from './webview/index';

export const apis: ApiGroup = {
  common: commonMethods,
  performance: performanceMethods,
  view: viewMethods,
  msSanitizer: msSanitizerMethods,
  // ops: opsMethods,
  webview: webviewMethods,
};
