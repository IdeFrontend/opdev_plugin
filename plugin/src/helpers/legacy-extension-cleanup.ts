/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import {
  getIdeServerDirName,
  isCodeArtsIde,
  joinIdeServerRelative,
} from './ide-config-dir';

/**
 * Extension id retired by the marketplace publisher migration
 * (`hicann` → `cann-pub`). Users upgrading from an old build may still have
 * it installed; keeping both extensions active leaves duplicate commands,
 * views and settings on the machine, so the new build uninstalls the legacy
 * one during initialization.
 */
export const LEGACY_ASCEND_C_TOOLKIT_EXTENSION_ID = 'hicann.ascend-c-toolkit';

const UNINSTALL_EXTENSION_COMMAND = 'workbench.extensions.uninstallExtension';

/** Environments the cleanup knows how to handle. */
export type LegacyCleanupIdeKind = 'desktop' | 'web' | 'ide-server' | 'code-server';

/**
 * Classifies the host the extension is running in. Mirrors the detection in
 * `MindStudioPluginInstaller`:
 * - `web`: extension host runs in a browser (Codespaces/Gitpod web); no local fs access.
 * - `ide-server`: official IDE server remote (`.vscode-server` / `.codearts-server`);
 *   extensions persist under `~/<ide-server>/extensions`.
 * - `code-server`: open-source code-server; extensions persist under
 *   `~/.local/share/code-server/extensions`.
 * - `desktop`: plain desktop VS Code / CodeArts.
 */
export function detectLegacyCleanupIdeKind(): LegacyCleanupIdeKind {
  if (typeof navigator !== 'undefined') {
    return 'web';
  }

  if (typeof process === 'undefined') {
    return 'desktop';
  }

  // Official remote agent of the current IDE product (VS Code or CodeArts)
  const isOfficialIdeRemote =
    process.env.VSCODE_AGENT_FOLDER !== undefined
    || process.execPath.includes(getIdeServerDirName())
    || (!isCodeArtsIde() && process.execPath.includes('.vscode-remote'));

  if (isOfficialIdeRemote) {
    return 'ide-server';
  }

  if (
    process.env.CODEARTS_SERVER_VERSION !== undefined
    || (process.env.HOSTNAME && process.env.HOSTNAME.includes('codearts'))
    || process.execPath.includes('codearts')
    || process.argv.some((arg) => arg.includes('codearts'))
  ) {
    // CodeArts Server is based on code-server; the extensions dir of the
    // WebIDE host is `~/.codearts-server/extensions`.
    return 'ide-server';
  }

  if (
    process.env.CODE_SERVER_VERSION !== undefined
    || process.argv.some((arg) => arg.includes('code-server'))
    || process.execPath.includes('code-server')
  ) {
    return 'code-server';
  }

  return 'desktop';
}

function resolveServerExtensionsDir(kind: LegacyCleanupIdeKind): string {
  if (kind === 'code-server') {
    return path.join(
      os.homedir(),
      '.local',
      'share',
      'code-server',
      'extensions',
    );
  }

  // ide-server: `~/.vscode-server/extensions` or `~/.codearts-server/extensions`
  // depending on the product's uri scheme.
  return path.join(os.homedir(), joinIdeServerRelative('extensions'));
}

function isLegacyExtensionDir(dirName: string, extensionId: string): boolean {
  const prefix = `${extensionId}-`;
  const lowerDirName = dirName.toLowerCase();
  const lowerPrefix = prefix.toLowerCase();

  return lowerDirName.startsWith(lowerPrefix) && lowerDirName !== lowerPrefix;
}

/**
 * Removes a manually-persisted server install: the `${id}-${version}`
 * directories plus the matching rows in `extensions.json`. This is the
 * reverse of what `MindStudioPluginInstaller` writes and the only way to
 * uninstall in code-server/CodeArts WebIDE hosts where the workbench
 * uninstall command cannot see manually dropped builds.
 *
 * @returns number of removed artifacts (directories + json entries)
 */
export function removeLegacyServerInstall(extensionsDir: string, extensionId: string): number {
  if (!fs.existsSync(extensionsDir)) {
    return 0;
  }

  let removed = 0;

  for (const entry of fs.readdirSync(extensionsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !isLegacyExtensionDir(entry.name, extensionId)) {
      continue;
    }

    const legacyDir = path.join(extensionsDir, entry.name);

    try {
      fs.rmSync(legacyDir, {
        recursive: true,
        force: true,
      });
      removed++;
    }
    catch (error) {
      console.warn(`Failed to remove legacy extension dir ${entry.name}:`, error);
    }
  }

  const jsonPath = path.join(extensionsDir, 'extensions.json');

  if (fs.existsSync(jsonPath)) {
    try {
      const manifest: Array<{ identifier?: { id?: string } }> =
        JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      const filtered = manifest.filter((ext) => (ext.identifier?.id ?? '').toLowerCase() !== extensionId.toLowerCase());

      removed += manifest.length - filtered.length;

      if (filtered.length !== manifest.length) {
        fs.writeFileSync(jsonPath, JSON.stringify(filtered, null, 2), 'utf8');
      }
    }
    catch (error) {
      console.warn('Failed to clean legacy entries in extensions.json:', error);
    }
  }

  return removed;
}

/**
 * Uninstalls the legacy `hicann.ascend-c-toolkit` extension when present.
 * Safe to call on every activation: a missing extension is a no-op.
 *
 * Strategy per environment:
 * - everywhere: the workbench uninstall command runs first (renderer-side
 *   extension management handles marketplace installs on desktop and remotes).
 * - ide-server / code-server: a filesystem fallback additionally removes the
 *   legacy install directories and `extensions.json` rows, covering WebIDE
 *   hosts (`.codearts-server`) where the command may not know manually
 *   dropped builds. Both steps are idempotent.
 */
export async function uninstallLegacyAscendToolkitExtension(logDebug: (message: string, payload?: unknown)=> void): Promise<void> {
  const legacyId = LEGACY_ASCEND_C_TOOLKIT_EXTENSION_ID;
  const installed = vscode.extensions.getExtension(legacyId);

  if (!installed) {
    return;
  }

  const kind = detectLegacyCleanupIdeKind();

  logDebug('legacyExtensionCleanup:detected', {
    legacyId,
    version: installed.packageJSON?.version,
    kind,
  });

  try {
    await vscode.commands.executeCommand(UNINSTALL_EXTENSION_COMMAND, legacyId);
    logDebug('legacyExtensionCleanup:commandExecuted', { legacyId });
  }
  catch (error) {
    logDebug('legacyExtensionCleanup:commandFailed', {
      legacyId,
      error,
    });
  }

  if (kind === 'ide-server' || kind === 'code-server') {
    try {
      const extensionsDir = resolveServerExtensionsDir(kind);
      const removed = removeLegacyServerInstall(extensionsDir, legacyId);

      logDebug('legacyExtensionCleanup:serverDirCleanup', {
        legacyId,
        extensionsDir,
        removed,
      });
    }
    catch (error) {
      logDebug('legacyExtensionCleanup:serverDirCleanupFailed', {
        legacyId,
        error,
      });
    }
  }
}
