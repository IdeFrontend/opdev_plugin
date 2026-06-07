import { ProjectManager } from '@plugin/core/project/project-manager';
import { getFirstWorkspaceFolderPath } from '@plugin/helpers/operator-project-workspace-config';

export type WorkspaceRootPreference = 'projectFirst' | 'workspaceFolderFirst';

export function resolveWorkspaceRoot(
  explicitRoot?: string,
  preference: WorkspaceRootPreference = 'projectFirst',
): string | undefined {
  if (explicitRoot) {
    return explicitRoot;
  }

  const projectPath = ProjectManager.getInstance().getProjectInfo()?.path;
  const folderPath = getFirstWorkspaceFolderPath();

  if (preference === 'workspaceFolderFirst') {
    return folderPath ?? projectPath;
  }

  return projectPath ?? folderPath;
}
