import path from 'path';
import os from 'os';
import fs from 'fs-extra';

function getUserDataDir(): string {
  const home = os.homedir();
  const dataDir = path.join(home, '.vscode-server', 'data', 'ms-op-suite');
  fs.ensureDirSync(dataDir);
  return dataDir;
}

const user_data_dir = getUserDataDir();

const db = {
  DATABASE_PATH: path.join(user_data_dir, 'data', 'plugin.db'),
};

export default { user_data_dir, db };
