import * as fs from 'fs';
import * as path from 'path';

/** Default operator-generation command for standard-custom projects. */
export const DEFAULT_GEN_OP_COMMAND = 'bash build.sh --genop={path}/{operatorname}';

/** Escape the shell-significant characters and wrap a value in double quotes. */
function shellDoubleQuote(value: string): string {
  const escaped = value.replace(/([\\"$`])/g, '\\$1');

  return '"' + escaped + '"';
}

/**
 * A value is safe to leave unquoted only when every character is meaningless to a POSIX
 * shell word (alphanumerics and conservative path punctuation). A space, `$`, `&`, `(`,
 * `'`, etc. — or an empty value — requires quoting.
 */
function needsShellQuoting(value: string): boolean {
  return value === '' || !/^[A-Za-z0-9_/.@%+:,=-]+$/.test(value);
}

/**
 * Quote a value for safe shell interpolation, but only when it actually needs it, so a
 * plain path renders as `/a/b` instead of `"/a/b"`. A quoted value is still concatenated
 * by the shell into a single word, so mixing quoted and unquoted placeholders across
 * `{path}/{operatorname}` stays safe (e.g. `"/a b"/c` is the single argument `/a b/c`).
 */
function maybeShellQuote(value: string): string {
  return needsShellQuoting(value) ? shellDoubleQuote(value) : value;
}

/** Substitute `{path}` and `{operatorname}` in the command template (shell-safe). */
export function buildGenOpCommand(
  template: string,
  projectPath: string,
  operatorName: string,
): string {
  return template
    .replace(/\{path\}/g, () => maybeShellQuote(projectPath))
    .replace(/\{operatorname\}/g, () => maybeShellQuote(operatorName));
}

/**
 * True when `opDir` exists and contains the operator-source signature that
 * `generateStructure`'s `executeGeneration()` would otherwise produce. Used to confirm
 * genop actually generated source before we skip the plugin's own source generation.
 * `existsSync` is injectable for testing.
 */
export function genopProducedOperatorSource(
  opDir: string,
  deps: { existsSync: (p: string)=> boolean } = fs,
): boolean {
  if (!deps.existsSync(opDir)) {
    return false;
  }

  return (
    deps.existsSync(path.join(opDir, 'CMakeLists.txt'))
    || deps.existsSync(path.join(opDir, 'op_host'))
  );
}

/**
 * Skip the plugin's source generation only when the genop command both succeeded AND
 * left operator source on disk. "Exit 0 without files" must still fall back — see spec.
 */
export function decideSkipFileGeneration(opts: {
  commandSucceeded: boolean;
  opDir: string;
  existsSync?: (p: string)=> boolean;
}): boolean {
  if (!opts.commandSucceeded) {
    return false;
  }

  return genopProducedOperatorSource(
    opts.opDir,
    opts.existsSync ? { existsSync: opts.existsSync } : fs,
  );
}
