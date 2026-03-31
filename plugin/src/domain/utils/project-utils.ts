import fs from 'fs-extra';
import path from 'path';
import * as os from 'os';
import { promisify } from 'util';
import { exec } from 'child_process';
import * as vscode from 'vscode';
import debugLaunch from './debug-launch.json';

const execAsync = promisify(exec);

export async function ensureLaunchJsonExists(
  op_path: string | undefined,
  create_by?: string | null,
) {
  console.log('ensureLaunchJsonExists called, op_path:', op_path, 'create_by:', create_by);

  if (!op_path || typeof op_path !== 'string') {
    console.warn('ensureLaunchJsonExists: op_path is invalid, skipping config file creation');

    return;
  }

  const projectDir = path.resolve(op_path);
  const vscodeDir = path.join(projectDir, '.vscode');
  const devtoolConfigPath = path.join(vscodeDir, 'devtool_config.json');
  const launchJsonPath = path.join(vscodeDir, 'launch.json');

  console.log('ensureLaunchJsonExists: project directory:', projectDir);
  console.log('ensureLaunchJsonExists: .vscode directory:', vscodeDir);
  console.log('ensureLaunchJsonExists: config file path:', devtoolConfigPath);
  console.log('ensureLaunchJsonExists: launch.json path:', launchJsonPath);

  if (!fs.existsSync(projectDir)) {
    console.error('ensureLaunchJsonExists: project directory does not exist:', projectDir);
    const e = new Error('project_dir不存在');

    (e as Error & { name: string }).name = 'InvalidRequest';
    throw e;
  }

  if (fs.existsSync(devtoolConfigPath)) {
    console.log('ensureLaunchJsonExists: config file already exists, skip creation');

    return;
  }

  console.log('ensureLaunchJsonExists: creating .vscode directory...');
  await fs.ensureDir(vscodeDir);
  console.log('ensureLaunchJsonExists: .vscode directory created successfully');

  // Create devtool_config.json file
  const devtoolConfig = { type: create_by || '1' };

  console.log('ensureLaunchJsonExists: creating devtool_config.json file...');
  await fs.writeFile(
    devtoolConfigPath,
    JSON.stringify(devtoolConfig, null, 2),
    'utf-8',
  );
  console.log('ensureLaunchJsonExists: devtool_config.json file created successfully');

  // Create launch.json
  if (!fs.existsSync(launchJsonPath)) {
    console.log('ensureLaunchJsonExists: creating launch.json file...');
    const launchJsonContent = JSON.stringify(debugLaunch, null, 2);
    await fs.writeFile(
      launchJsonPath,
      launchJsonContent,
      'utf-8',
    );
    console.log('ensureLaunchJsonExists: launch.json file created successfully');

    // At the same time, create a copy of launch.json in the .arts directory
    const artsDir = path.join(projectDir, '.arts');
    const artsLaunchJsonPath = path.join(artsDir, 'launch.json');
    try {
      await fs.ensureDir(artsDir);
      await fs.writeFile(
        artsLaunchJsonPath,
        launchJsonContent,
        'utf-8',
      );
      console.log('ensureLaunchJsonExists: .arts/launch.json file created successfully');
    }
    catch (error) {
      console.error('ensureLaunchJsonExists: failed to create .arts/launch.json:', error);
      // Does not affect the main process, only errors are recorded
    }
  }
  else {
    console.log('ensureLaunchJsonExists: launch.json file already exists, skip creation');
  }

  try {
    await exportEnvToFile(projectDir);
    console.log('ensureLaunchJsonExists: environment variables exported');
  }
  catch (error) {
    console.error('ensureLaunchJsonExists: failed to export environment variables:', error);
    // Failure to export environment variables does not affect configuration file creation
  }
}

export function getDefaultDirectory(): string {
  // os.homedir() returns the current user’s home directory (cross-platform)
  // Windows: C:\Users\zhangsan
  // macOS: /Users/zhangsan
  // Linux: /home/zhangsan
  const homeDir = os.homedir();

  return path.join(homeDir, 'OpDevtoolsDownloads');
}

/**
 * Execute the environment export command in the extension root directory
 */
async function exportEnvToFile(projectDir: string) {
  // Prioritize using the current workspace root directory as the execution directory, and then fall back to the extension installation directory.
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
    await execAsync('chmod -R 750 .vscode/', {
      cwd,
      shell: '/bin/bash',
      windowsHide: true,
    });
    console.log(`Environment variables exported to: ${targetFile}`);

    await execAsync('mkdir build', {
      cwd,
      shell: '/bin/bash',
      windowsHide: true,
    });
  }
  catch (error) {
    console.error('Failed to export environment variables:', error);
  }
}

const map = {
  1: 'cann',
  2: 'ascend',
  3: 'pyasc',
  'standard-custom': 'ascend',
  'ascend-c': 'cann',
  'torch-library': 'cann',
  'pyasc': 'pyasc',
}
export function viewIdToProjectType(id: string | number | undefined) {
  if (!id) {
    return 'cann'
  }
  return map[id] || 'cann'
}