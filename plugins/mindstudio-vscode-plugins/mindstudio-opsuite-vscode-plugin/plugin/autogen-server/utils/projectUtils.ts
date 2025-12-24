import fs from 'fs-extra';
import path from 'path';
import debugLaunch from './debug-launch.json';

export async function ensureLaunchJsonExists(project_path: string, create_by?: string | null) {
  if (!project_path || typeof project_path !== 'string') {
    const e = new Error('project_path参数无效');
    (e as any).name = 'InvalidRequest';
    throw e;
  }

  const projectDir = path.resolve(project_path);
  const vscodeDir = path.join(projectDir, '.vscode');
  const launchJsonPath = path.join(vscodeDir, 'launch.json');
  const devtoolConfigPath = path.join(vscodeDir, 'devtool_config.json');

  if (!fs.existsSync(projectDir)) {
    const e = new Error('project_dir不存在');
    (e as any).name = 'InvalidRequest';
    throw e;
  }
  if (fs.existsSync(launchJsonPath)) return;
  await fs.ensureDir(vscodeDir);
  await fs.writeFile(launchJsonPath, JSON.stringify(debugLaunch, null, 2), 'utf-8');
  // 创建 devtool_config.json 文件
  const devtoolConfig = { type: create_by || '1' };
  await fs.writeFile(devtoolConfigPath, JSON.stringify(devtoolConfig, null, 2), 'utf-8');
}
