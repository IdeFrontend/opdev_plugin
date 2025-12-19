export type CheckPathExistsParams = {
  path: string;
  ssh?: {
    host: string;
    port?: number;
    username: string;
    password: string;
    privateKey: string;
  };
};
