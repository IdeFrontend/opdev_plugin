import { homeMethods } from './home-controller';
import { linkMethods } from './link-controller';
import { configMethods } from './config-controller';
import { performanceDataMethods } from './performance-controller';
import { welcomeMethods } from './welcome-controller';
import { dumpTensorMethods } from './dump-tensor-controller';

export const webviewMethods = {
  getHome: homeMethods.getHome,
  getLastProjectPath: homeMethods.getLastProjectPath,
  getWorkspace: homeMethods.getWorkspace,
  getProjectType: homeMethods.getProjectType,
  validatePyascForAnalysis: homeMethods.validatePyascForAnalysis,

  openFile: linkMethods.openFile,

  remotePathSearch: configMethods.remotePathSearch,

  createdProject: welcomeMethods.createdProject,
  openProject: welcomeMethods.openProject,

  getDumpTensorData: dumpTensorMethods.getDumpTensorData,

  downloadData: performanceDataMethods.downloadData,
  deleteNode: performanceDataMethods.deleteNode,
  selectFolder: performanceDataMethods.selectFolder,
  selectFile: performanceDataMethods.selectFile,
  jumpToFile: performanceDataMethods.jumpToFile,
};
