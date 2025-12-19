export type CheckPathExistsParams = {
  path: string;
  mustFile?: boolean;
  ssh?: {
    host: string;
    port?: number;
    username: string;
    password: string;
    privateKey: string;
  };
};
