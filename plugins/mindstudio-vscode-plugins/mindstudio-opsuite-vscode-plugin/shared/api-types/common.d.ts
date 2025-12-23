export type CheckPathExistsParams = {
  path: string;
  mustFile?: boolean;
};

export type SaveFileParams = {
  /** 源文件/目录路径 */
  sourcePath: string;

  /** 保存的文件名和后缀 */
  filename: string;

  /** 对话框标题 */
  dialogTitle?: string;

  /** 允许保存的文件类型 */
  allowedTypes?: string[];
};
