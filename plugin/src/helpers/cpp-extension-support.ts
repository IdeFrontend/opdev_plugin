import { t } from 'i18next';
import * as vscode from 'vscode';

import { EXTENSION_ID } from '@shared/flavor';

/** Installed only when the workspace has no C/C++ provider at all. */
export const MICROSOFT_CPP_EXTENSION_ID = 'ms-vscode.cpptools';

export const CPP_EXTENSION_PROMPT_DISMISSED_KEY = 'opDevtools.cppExtensionPromptDismissed';

const CPP_LANGUAGE_IDS = [
  'c',
  'cpp',
];

type ExtensionManifest = {
  isBuiltin?: boolean;
  contributes?: {
    languages?: Array<{ id?: string }>;
  };
};

/**
 * Every VS Code build ships `vscode.cpp`, a built-in that contributes the `c` /
 * `cpp` language ids (grammars and brackets only, no IntelliSense). Counting it
 * as a provider would silence the install prompt everywhere, so built-ins are
 * excluded: they are marked `isBuiltin` and all use the reserved `vscode.`
 * publisher.
 */
function isBuiltinExtension(extension: vscode.Extension<unknown>): boolean {
  return (extension.packageJSON as ExtensionManifest | undefined)?.isBuiltin === true
    || extension.id.toLowerCase()
      .startsWith('vscode.');
}

/**
 * True when some installed extension provides C/C++ language support —
 * Microsoft C/C++, Huawei C/C++ or CodeArts C/C++ alike. Detection is by
 * contributed language id rather than by publisher id, so a vendor fork we do
 * not know the id of still counts.
 */
export function hasCppLanguageSupportExtension(): boolean {
  return vscode.extensions.all.some((extension) => {
    if (extension.id === EXTENSION_ID || isBuiltinExtension(extension)) {
      return false;
    }

    const languages = (extension.packageJSON as ExtensionManifest | undefined)?.contributes?.languages;

    return Array.isArray(languages)
      && languages.some((language) => CPP_LANGUAGE_IDS.includes(language?.id ?? ''));
  });
}

/**
 * Offers the Microsoft C/C++ extension when nothing in the IDE handles C/C++.
 * Replaces the unconditional `extensionPack` entry, which installed Microsoft
 * C/C++ on top of an existing Huawei / CodeArts provider.
 */
export async function maybePromptInstallCppExtension(
  context: vscode.ExtensionContext,
  logDebug: (message: string, payload?: unknown)=> void,
): Promise<void> {
  if (hasCppLanguageSupportExtension()) {
    return;
  }

  if (context.globalState.get<boolean>(CPP_EXTENSION_PROMPT_DISMISSED_KEY)) {
    return;
  }

  const installLabel = t('extension.cppSupport.install');
  const dismissLabel = t('extension.cppSupport.dontAskAgain');
  const choice = await vscode.window
    .showInformationMessage(t('extension.cppSupport.missing'), installLabel, dismissLabel);

  if (choice === dismissLabel) {
    await context.globalState.update(CPP_EXTENSION_PROMPT_DISMISSED_KEY, true);

    return;
  }

  if (choice !== installLabel) {
    return;
  }

  try {
    await vscode.commands.executeCommand('workbench.extensions.installExtension', MICROSOFT_CPP_EXTENSION_ID);
    vscode.window.showInformationMessage(t('extension.cppSupport.installed'));
  }
  catch (error) {
    logDebug('cppSupport:install:error', error);
    vscode.window.showWarningMessage(t('extension.cppSupport.installFailed', { id: MICROSOFT_CPP_EXTENSION_ID }));
  }
}
