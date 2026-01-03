import { CheckPathExistsParams, SaveFileParams } from 'shared:/api-types';
import { fileService } from '../service/file-service';

export const commonMethods = {
  /**
   * 检查路径是否存在
   */
  pathExists(params: CheckPathExistsParams): Promise<boolean> {
    return fileService.pathExists(params);
  },

  /**
   * 保存文件到本地
   */
  async saveFileToLocal(params: SaveFileParams): Promise<boolean> {
    return await fileService.saveFileToLocal(params);
  },
};
