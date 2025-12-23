export type CheckPathExistsParams = {
  path: string;
  mustFile?: boolean;
};

export type SaveFileParams = {
  filename: string;
  title?: string;
  allowedTypes?: string[];
};
