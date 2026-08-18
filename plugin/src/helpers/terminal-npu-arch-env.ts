/**
 * Minimal shape of VS Code's `EnvironmentVariableCollection` that we mutate. Declared
 * structurally so the logic can be unit-tested without the VS Code API.
 */
export interface MutableEnvVarCollection {
  replace(variable: string, value: string): void;
  delete(variable: string): void;
}

/** Env var read by the generated cann/AscendC `build.sh` and `CMakeLists.txt`. */
export const NPU_ARCH_ENV_VAR = 'NPU_ARCH';

/** The extension's terminal env collection, or undefined before activation (tests). */
export function getTerminalEnvCollection(): MutableEnvVarCollection | undefined {
  return (globalThis as unknown as {
    extensionContext?: { environmentVariableCollection?: MutableEnvVarCollection };
  }).extensionContext?.environmentVariableCollection;
}

/**
 * Inject the resolved `NPU_ARCH` into the integrated-terminal environment (issue #37).
 * A manually typed `bash build.sh` / `cmake` then inherits `NPU_ARCH`, so a project
 * reopened with "Open Folder" builds without running a plugin command first — the gap
 * the spawn-env exports cannot close, because a bare terminal never reads settings.json.
 *
 * Clears the variable for a blank arch so terminals do not inherit a stale chip profile.
 *
 * @returns true when the collection was updated
 */
export function applyNpuArchToTerminalEnv(
  collection: MutableEnvVarCollection | undefined,
  npuArch: string | null | undefined,
): boolean {
  if (!collection) {
    return false;
  }

  const arch = (npuArch ?? '').trim();

  if (!arch) {
    collection.delete(NPU_ARCH_ENV_VAR);

    return true;
  }

  collection.replace(NPU_ARCH_ENV_VAR, arch);

  return true;
}
