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

/** 保存文件返回结果（Web 版本返回文件数据，桌面版本返回 boolean） */
export type SaveFileResult = boolean | {
  /** Base64 编码的文件数据 */
  data: string;
  /** 文件名 */
  filename: string;
};
