import { t } from 'i18next';
import * as path from 'path';
import * as vscode from 'vscode';

export type StTestCompletionNotificationParams = {
  workspaceRoot: string;
  outputPaths: readonly string[];
  runDirectory: string;
};

type StTestResultPick = vscode.QuickPickItem & {
  outputPath: string;
};

export function resolveStTestDisplayPath(
  workspaceRoot: string,
  targetPath: string,
): string {
  const resolvedWorkspace = path.resolve(workspaceRoot);
  const resolvedTarget = path.resolve(targetPath);
  const relative = path.relative(resolvedWorkspace, resolvedTarget);
  const isOutside = path.isAbsolute(relative)
    || relative === '..'
    || relative.startsWith(`..${path.sep}`);

  if (isOutside) {
    return resolvedTarget;
  }

  return relative || '.';
}

async function pickResultPath(params: StTestCompletionNotificationParams): Promise<string | undefined> {
  if (params.outputPaths.length === 1) {
    return params.outputPaths[0];
  }

  const picks: StTestResultPick[] = params.outputPaths.map((outputPath) => ({
    label: resolveStTestDisplayPath(params.workspaceRoot, outputPath),
    outputPath,
  }));
  const selected = await vscode.window.showQuickPick(picks, { placeHolder: t('stTest.pickResultFile') });

  return selected?.outputPath;
}

async function openResultFile(outputPath: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(outputPath));

  await vscode.window.showTextDocument(document, { preview: true });
}

async function reportOpenFailure(error: unknown): Promise<void> {
  const detail = error instanceof Error ? error.message : String(error);

  try {
    await vscode.window.showErrorMessage(t('stTest.openResultFailed', { error: detail }));
  }
  catch (reportError) {
    console.error('[ST test] Could not report result-file open failure:', reportError);
  }
}

export async function showStTestCompletionNotification(params: StTestCompletionNotificationParams): Promise<void> {
  const openFileAction = t('stTest.openFile');
  const displayPath = resolveStTestDisplayPath(
    params.workspaceRoot,
    params.outputPaths.length === 1 ? params.outputPaths[0] : params.runDirectory,
  );

  try {
    const action = await vscode.window.showInformationMessage(t('stTest.completed', {
      count: params.outputPaths.length,
      path: displayPath,
    }), openFileAction);

    if (action !== openFileAction) {
      return;
    }

    const outputPath = await pickResultPath(params);

    if (!outputPath) {
      return;
    }

    await openResultFile(outputPath);
  }
  catch (error) {
    await reportOpenFailure(error);
  }
}
