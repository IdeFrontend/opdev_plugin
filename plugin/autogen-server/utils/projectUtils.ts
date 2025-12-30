import fs from 'fs-extra';
import path from 'path';
import * as os from 'os';
import debugLaunch from './debug-launch.json';
import { promisify } from 'util';
import { exec } from 'child_process';
import * as vscode from 'vscode';

const execAsync = promisify(exec);
export async function ensureLaunchJsonExists(project_path: string, create_by?: string | null) {
  if (!project_path || typeof project_path !== 'string') {
    return;
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
  // await fs.writeFile(launchJsonPath, JSON.stringify(debugLaunch, null, 2), 'utf-8');
  // 创建 devtool_config.json 文件
  const devtoolConfig = { type: create_by || '1' };
  console.log('生成了devtool_config.json');
  await fs.writeFile(devtoolConfigPath, JSON.stringify(devtoolConfig, null, 2), 'utf-8');
  console.log('执行了');
  await exportEnvToFile(projectDir);
  
}

export function getDefaultDirectory(): string {
  // os.homedir() 返回当前用户的主目录（跨平台）
  // Windows: C:\Users\zhangsan
  // macOS: /Users/zhangsan
  // Linux: /home/zhangsan
  const homeDir = os.homedir();
  return path.join(homeDir, 'OpDevtoolsDownloads')
}

/**
 * 在扩展根目录执行环境导出命令
 */
async function exportEnvToFile(projectDir:string) {
  // 优先使用当前工作区根目录作为执行目录，其次回退到扩展安装目录
  // const selectedFiles = ExplorerRootUtils.getPrimaryRoot();
  // console.log(selectedFiles);
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  console.log('workspaceFolder', workspaceFolder);
  const cwd = projectDir;
  console.log('cwd', cwd)
  const targetDir = path.join(cwd, '.arts');
  const targetFile = path.join(targetDir, 'env');
  try {
    await fs.promises.mkdir(targetDir, { recursive: true });
    await execAsync('. /etc/profile && env > ./.arts/.env', {
      cwd,
      shell: '/bin/bash',
      windowsHide: true,
    });
    console.log(`环境变量已导出到: ${targetFile}`);
  } catch (error) {
    console.error('导出环境变量失败:', error);
  }
}