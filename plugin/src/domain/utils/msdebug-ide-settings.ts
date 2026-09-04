import { getIdeSettingsFilePath } from '@plugin/helpers/ide-config-dir';
import { guardedPersistIdeSettingsFile } from '@plugin/helpers/ide-settings-persist';

/** MindStudio Debug expects kernel sources (e.g. Triton `.cce`/`.asc`) as C++ for breakpoints. */
export const MSDEBUG_KERNEL_FILE_ASSOCIATIONS: Readonly<Record<string, string>> = {
  '*.cce': 'cpp',
  '*.asc': 'cpp',
};

/**
 * Merge msdebug-related `files.associations` into workspace `<ide>/settings.json`
 * without removing existing user settings. Goes through the shared guarded persist
 * (serialized with other settings.json writers, content-diff guard, tolerant read —
 * a corrupt settings.json is never overwritten, the write backs off instead of throwing).
 */
export async function ensureMsdebugBreakpointFileAssociations(workspaceRoot: string): Promise<void> {
  const settingsPath = getIdeSettingsFilePath(workspaceRoot);

  await guardedPersistIdeSettingsFile(settingsPath, (current) => {
    const associations = {
      ...MSDEBUG_KERNEL_FILE_ASSOCIATIONS,
      ...(typeof current['files.associations'] === 'object' && current['files.associations'] !== null
        ? current['files.associations'] as Record<string, string>
        : {}),
    };

    return {
      next: {
        ...current,
        'files.associations': associations,
      },
    };
  });
}
