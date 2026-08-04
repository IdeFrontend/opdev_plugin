import { buildShHelpSupportsOptionSync } from '@plugin/domain/plugins/detection-utils';

/**
 * Checks whether build.sh at the given root directory advertises --bisheng_flags.
 * Used to determine whether bisheng-specific compile options should be applied.
 *
 */
export function checkBuildShHasBishengConfig(rootPath: string): boolean {
  return buildShHelpSupportsOptionSync(rootPath, '--bisheng_flags');
}
