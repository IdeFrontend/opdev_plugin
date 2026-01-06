import fs from 'fs-extra';
import path from 'path';
import * as os from 'os';
import { promisify } from 'util';
import { exec } from 'child_process';
import * as vscode from 'vscode';

const execAsync = promisify(exec);

export async function ensureLaunchJsonExists(
  op_path: string | undefined,
  create_by?: string | null,
) {
  console.log('ensureLaunchJsonExists 被调用，op_path:', op_path, 'create_by:', create_by);
  
  if (!op_path || typeof op_path !== 'string') {
    console.warn('ensureLaunchJsonExists: op_path 无效，跳过创建配置文件');
    return;
  }

  const projectDir = path.resolve(op_path);
  const vscodeDir = path.join(projectDir, '.vscode');
  const devtoolConfigPath = path.join(vscodeDir, 'devtool_config.json');

  console.log('ensureLaunchJsonExists: 项目目录:', projectDir);
  console.log('ensureLaunchJsonExists: .vscode 目录:', vscodeDir);
  console.log('ensureLaunchJsonExists: 配置文件路径:', devtoolConfigPath);

  if (!fs.existsSync(projectDir)) {
    console.error('ensureLaunchJsonExists: 项目目录不存在:', projectDir);
    const e = new Error('project_dir不存在');

    (e as Error & { name: string }).name = 'InvalidRequest';
    throw e;
  }
  
  if (fs.existsSync(devtoolConfigPath)) {
    console.log('ensureLaunchJsonExists: 配置文件已存在，跳过创建');
    return;
  }
  
  console.log('ensureLaunchJsonExists: 创建 .vscode 目录...');
  await fs.ensureDir(vscodeDir);
  console.log('ensureLaunchJsonExists: .vscode 目录创建成功');
  
  // 创建 devtool_config.json 文件
  const devtoolConfig = { type: create_by || '1' };

  console.log('ensureLaunchJsonExists: 创建 devtool_config.json 文件...');
  await fs.writeFile(
    devtoolConfigPath,
    JSON.stringify(devtoolConfig, null, 2),
    'utf-8',
  );
  console.log('ensureLaunchJsonExists: devtool_config.json 文件创建成功');
  
  try {
    await exportEnvToFile(projectDir);
    console.log('ensureLaunchJsonExists: 环境变量导出完成');
  } catch (error) {
    console.error('ensureLaunchJsonExists: 环境变量导出失败:', error);
    // 环境变量导出失败不影响配置文件创建
  }
}

export function getDefaultDirectory(): string {
  // os.homedir() 返回当前用户的主目录（跨平台）
  // Windows: C:\Users\zhangsan
  // macOS: /Users/zhangsan
  // Linux: /home/zhangsan
  const homeDir = os.homedir();

  return path.join(homeDir, 'OpDevtoolsDownloads');
}

/**
 * 在扩展根目录执行环境导出命令
 */
async function exportEnvToFile(projectDir: string) {
  // 优先使用当前工作区根目录作为执行目录，其次回退到扩展安装目录
  // const selectedFiles = ExplorerRootUtils.getPrimaryRoot();
  // console.log(selectedFiles);
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  console.log('workspaceFolder', workspaceFolder);
  const cwd = projectDir;

  console.log('cwd', cwd);
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
