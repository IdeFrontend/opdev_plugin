import { homeMethods } from './home-controller';
import { linkMethods } from './link-controller';
import { configMethods } from './config-controller';
import { scriptMethods } from './script-controller';
import { taskMethods } from './task-controller';
import { sanitizerViewMethods } from './sanitizer-controller';
import { performanceDataMethods } from './performance-controller';
import { welcomeMethods } from './welcome-controller';

export const webviewMethods = {
  ...homeMethods,
  ...linkMethods,
  ...configMethods,
  ...scriptMethods,
  ...taskMethods,
  ...sanitizerViewMethods,
  ...performanceDataMethods,
  ...welcomeMethods,
};
