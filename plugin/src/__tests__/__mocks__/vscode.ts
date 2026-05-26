export const workspace = {
  workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
  getConfiguration: () => ({
    get: () => undefined,
    inspect: () => undefined,
  }),
};
