import fs from 'fs-extra';

import {
  getIdeSettingsFilePath,
  joinIdeConfigPath,
} from '@plugin/helpers/ide-config-dir';

/** MindStudio Debug expects kernel sources (e.g. Triton `.cce`) as C++ for breakpoints. */
export const MSDEBUG_KERNEL_FILE_ASSOCIATIONS: Readonly<Record<string, string>> = { '*.cce': 'cpp' };

/**
 * Merge msdebug-related `files.associations` into workspace `<ide>/settings.json`
 * without removing existing user settings.
 */
export async function ensureMsdebugBreakpointFileAssociations(workspaceRoot: string): Promise<void> {
  const settingsPath = getIdeSettingsFilePath(workspaceRoot);
  let settings: Record<string, unknown> = {};

  if (await fs.pathExists(settingsPath)) {
    try {
      settings = JSON.parse(await fs.readFile(settingsPath, 'utf-8')) as Record<string, unknown>;
    }
    catch {
      settings = {};
    }
  }

  const associations = {
    ...(typeof settings['files.associations'] === 'object' && settings['files.associations'] !== null
      ? settings['files.associations'] as Record<string, string>
      : {}),
    ...MSDEBUG_KERNEL_FILE_ASSOCIATIONS,
  };

  const next = {
    ...settings,
    'files.associations': associations,
  };

  await fs.ensureDir(joinIdeConfigPath(workspaceRoot));
  await fs.writeFile(settingsPath, JSON.stringify(next, null, 2), 'utf-8');
}
