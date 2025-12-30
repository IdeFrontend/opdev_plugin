import { ApiGroup } from 'plugin:/core/ApiServer';

import { commonApis } from './common';
import { performanceApis } from './performance';
import { msSanitizerApis } from './msSanitizer';
import { viewApis } from './view';

export const apis: ApiGroup = {
  ...commonApis,
  ...performanceApis,
  ...viewApis,
  ...msSanitizerApis
};
