import { homeMethods } from './home-controller';
import { configMethods } from './config-controller';
import { performanceDataMethods } from './performance-controller';
import { welcomeMethods } from './welcome-controller';

export const webviewMethods = {
  getHome: homeMethods.getHome,
  getWorkspace: homeMethods.getWorkspace,
  getProjectType: homeMethods.getProjectType,

  remotePathSearch: configMethods.remotePathSearch,

  createdProject: welcomeMethods.createdProject,

  selectFolder: performanceDataMethods.selectFolder,
  selectFile: performanceDataMethods.selectFile,
};
