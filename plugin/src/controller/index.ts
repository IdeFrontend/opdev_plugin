import { homeMethods } from './home-controller';
import { linkMethods } from './link-controller';
import { configMethods } from './config-controller';
import { performanceDataMethods } from './performance-controller';
import { welcomeMethods } from './welcome-controller';
import { dumpTensorMethods } from './dump-tensor-controller';

export const webviewMethods = {
  getHome: homeMethods.getHome,
  getWorkspace: homeMethods.getWorkspace,
  getProjectType: homeMethods.getProjectType,

  openFile: linkMethods.openFile,

  remotePathSearch: configMethods.remotePathSearch,

  createdProject: welcomeMethods.createdProject,

  getDumpTensorData: dumpTensorMethods.getDumpTensorData,

  selectFolder: performanceDataMethods.selectFolder,
  selectFile: performanceDataMethods.selectFile,
};
