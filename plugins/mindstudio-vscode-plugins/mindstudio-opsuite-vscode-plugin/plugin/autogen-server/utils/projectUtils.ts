import fs from 'fs-extra';
import path from 'path';
import * as os from 'os';
import debugLaunch from './debug-launch.json';

export async function ensureLaunchJsonExists(project_path: string) {
  const projectDir = path.resolve(project_path);
  const vscodeDir = path.join(projectDir, '.vscode');
  const launchJsonPath = path.join(vscodeDir, 'launch.json');

  if (!fs.existsSync(projectDir)) {
    const e = new Error('project_dir不存在');
    (e as any).name = 'InvalidRequest';
    throw e;
  }

  if (fs.existsSync(launchJsonPath)) return;

  await fs.ensureDir(vscodeDir);
  await fs.writeFile(launchJsonPath, JSON.stringify(debugLaunch, null, 2), 'utf-8');
}

export function getDefaultDirectory(): string {
  // os.homedir() 返回当前用户的主目录（跨平台）
  // Windows: C:\Users\zhangsan
  // macOS: /Users/zhangsan
  // Linux: /home/zhangsan
  const homeDir = os.homedir();
  return path.join(homeDir, 'OpDevtoolsDownloads')
}