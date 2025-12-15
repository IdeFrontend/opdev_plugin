import fs from 'fs-extra';
import path from 'path';
import { getResourcePath } from './resourceUtils';

export async function ensureLaunchJsonExists(project_path: string) {
  const projectDir = path.resolve(project_path);
  const vscodeDir = path.join(projectDir, '.vscode');
  const launchJsonPath = path.join(vscodeDir, 'launch.json');
  const resourceLaunch = path.join(getResourcePath('resource/launch.json'));

  if (!fs.existsSync(projectDir)) {
    const e = new Error('project_dir不存在');
    (e as any).name = 'InvalidRequest';
    throw e;
  }

  if (fs.existsSync(launchJsonPath)) return;
  if (!fs.existsSync(resourceLaunch)) {
    const e = new Error('资源文件不存在: launch');
    (e as any).name = 'InvalidRequest';
    throw e;
  }
  await fs.ensureDir(vscodeDir);
  await fs.copy(resourceLaunch, launchJsonPath);
}
