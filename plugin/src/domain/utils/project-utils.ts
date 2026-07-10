import fs from 'fs-extra';
import path from 'path';
import { t } from 'i18next';
import * as os from 'os';
import { promisify } from 'util';
import { exec } from 'child_process';
import * as vscode from 'vscode';
import { OperatorProjectViewId } from '@shared/project-type-view-id';
import {
  getIdeConfigDir, getIdeConfigDirName, joinIdeConfigPath,
} from '@plugin/helpers/ide-config-dir';

import debugLaunch from './debug-launch.json';
import { ensureMsdebugBreakpointFileAssociations } from './msdebug-ide-settings';
import {
  ensureMsdebugLibInEnvFile,
  getKnownSetEnvScriptPath,
} from './msdebug-env';

const execAsync = promisify(exec);

function buildDebugLaunchConfig(): typeof debugLaunch {
  const envScript = `\${workspaceFolder}/${getIdeConfigDirName()}/.env`;

  return {
    configurations: debugLaunch.configurations.map((config) => ({
      ...config,
      environmentScripts: [envScript],
    })),
  };
}

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
  const ideConfigDir = getIdeConfigDir(projectDir);
  const devtoolConfigPath = joinIdeConfigPath(projectDir, 'devtool_config.json');
  const launchJsonPath = joinIdeConfigPath(projectDir, 'launch.json');

  console.log('ensureLaunchJsonExists: project directory:', projectDir);
  console.log(`ensureLaunchJsonExists: ${getIdeConfigDirName()} directory:`, ideConfigDir);
  console.log('ensureLaunchJsonExists: config file path:', devtoolConfigPath);
  console.log('ensureLaunchJsonExists: launch.json path:', launchJsonPath);

  if (!fs.existsSync(projectDir)) {
    console.error('ensureLaunchJsonExists: project directory does not exist:', projectDir);
    const e = new Error(t('project.projectDirNotExist'));

    (e as Error & { name: string }).name = 'InvalidRequest';
    throw e;
  }

  if (fs.existsSync(devtoolConfigPath)) {
    console.log('ensureLaunchJsonExists: config file already exists, skip creation');

    try {
      await ensureMsdebugBreakpointFileAssociations(projectDir);
      console.log('ensureLaunchJsonExists: workspace file associations ensured');
    }
    catch (error) {
      console.warn('ensureLaunchJsonExists: failed to ensure file associations:', error);
    }

    return;
  }

  console.log(`ensureLaunchJsonExists: creating ${getIdeConfigDirName()} directory...`);
  await fs.ensureDir(ideConfigDir);
  console.log(`ensureLaunchJsonExists: ${getIdeConfigDirName()} directory created successfully`);

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
    const launchJsonContent = JSON.stringify(buildDebugLaunchConfig(), null, 2);

    await fs.writeFile(
      launchJsonPath,
      launchJsonContent,
      'utf-8',
    );
    console.log('ensureLaunchJsonExists: launch.json file created successfully');
  }
  else {
    console.log('ensureLaunchJsonExists: launch.json file already exists, skip creation');
  }

  try {
    await ensureMsdebugBreakpointFileAssociations(projectDir);
    console.log('ensureLaunchJsonExists: msdebug breakpoint file associations ensured');
  }
  catch (error) {
    console.warn('ensureLaunchJsonExists: failed to ensure msdebug settings:', error);
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
  const ideDirName = getIdeConfigDirName();
  const targetDir = path.join(cwd, ideDirName);
  const targetFile = path.join(targetDir, 'env');

  try {
    await fs.promises.mkdir(targetDir, { recursive: true });
    await execAsync(`. /etc/profile && env > ./${ideDirName}/.env`, {
      cwd,
      shell: '/bin/bash',
      windowsHide: true,
    });

    // GH-87: the msdebug-mi adapter needs CANN tools/msdebug/lib on
    // LD_LIBRARY_PATH, but the plain `env` dump above does not include it.
    try {
      await ensureMsdebugLibInEnvFile(cwd, getKnownSetEnvScriptPath());
    }
    catch (error) {
      console.warn('exportEnvToFile: failed to add msdebug lib dir to LD_LIBRARY_PATH:', error);
    }

    await execAsync(`chmod -R 750 ${ideDirName}/`, {
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

export function viewIdToProjectType(id: string | number | undefined) {
  if (!id) {
    return 'cann';
  }

  if (id === OperatorProjectViewId.CANN) {
    return 'cann';
  }

  if (id === OperatorProjectViewId.STANDARD_CUSTOM) {
    return 'ascend';
  }

  if (id === OperatorProjectViewId.PYASC) {
    return 'pyasc';
  }

  if (id === OperatorProjectViewId.TRITON) {
    return 'triton';
  }

  if (id === 'standard-custom') {
    return 'ascend';
  }

  if (id === 'ascend-c' || id === 'torch-library') {
    return 'cann';
  }

  if (id === 'pyasc') {
    return 'pyasc';
  }

  if (id === 'triton') {
    return 'triton';
  }

  return 'cann';
}
