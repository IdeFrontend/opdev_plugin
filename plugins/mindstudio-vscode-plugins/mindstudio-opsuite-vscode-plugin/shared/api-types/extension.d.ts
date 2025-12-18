export type InstallRemoteExtensionParams = {
  host: string;
  port?: number;
  username: string;
  password: string;
  privateKey: string;
};

export type InstallRemoteExtensionResult = ReadableStream<number>;
