/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { t } from 'i18next';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

import {
  getIdeServerDirName,
  isCodeArtsIde,
  joinIdeServerRelative,
} from '@plugin/helpers/ide-config-dir';

/**
 * Plug-in installation configuration options
 */
export interface InstallOptions {
  /** The ID of the target plugin, e.g. 'ascend.mindstudio-debug-vscode-plugin' */
  pluginId: string;
  /** The path to the .vsix file relative to the current plug-in root directory */
  vsixRelativePath: string;
  /** Plug-in version number, used to build target folder name and registration information */
  pluginVersion: string;
}

/**
 * MindStudio plug-in automatic installer
 * Supports multiple environments: desktop VS Code / code-server / Huawei CodeArts Server / Codespaces / Gitpod
 */
export class MindStudioPluginInstaller {
  private readonly context: vscode.ExtensionContext;
  private readonly options: InstallOptions;

  constructor(context: vscode.ExtensionContext, options: InstallOptions) {
    this.context = context;
    this.options = options;
  }

  private isCursorHost(): boolean {
    return /cursor/i.test(vscode.env.appName || '');
  }

  /**
   * Main entrance: install the bundled plugin when it is missing or when the
   * installed version is older than the bundled one. If the installed version
   * already matches the bundled version, this is a no-op.
   *
   * Note: version comparison is intentional — the previous logic only checked
   * whether the extension was installed (regardless of version), so stale
   * builds never got refreshed after an OP DevTools upgrade.
   */
  async installIfNeeded(): Promise<void> {
    const {
      pluginId, pluginVersion,
    } = this.options;
    const existing = vscode.extensions.getExtension(pluginId);

    // Installed and version matches → nothing to do
    if (existing && existing.packageJSON?.version === pluginVersion) {
      console.log(`✅ ${pluginId}@${existing.packageJSON.version} already installed.`);

      return;
    }

    if (existing) {
      console.log(`⬆️ ${pluginId}@${existing.packageJSON?.version ?? 'unknown'} installed, upgrading to bundled ${pluginVersion}.`);
    }
    else {
      console.log(`📦 ${pluginId} not installed, installing ${pluginVersion}.`);
    }

    // Detect current operating environment
    const env = this.detectEnvironment();

    console.log(env);

    // Prioritize code-server-based environments (including Huawei CodeArts)
    if (env.isCodeServer) {
      console.log('🔧 Detected code-server or CodeArts environment.');
      await this.installForCodeServer();
    }
    // Handle web browser environments (e.g. GitHub Codespaces, Gitpod)
    else if (env.isWeb) {
      console.log('☁️ Detected web-based IDE environment.');
      await this.handleWebIDE(env);
    }
    // Finally return to the desktop VS Code
    else {
      console.log('💻 Detected desktop VS Code environment.');
      await this.installViaVsixCommand();
    }
  }

  // ===================================================================
  // 🌍 Environmental detection: Accurately identify the operating platform
  // ===================================================================
  private detectEnvironment() {
    const isWeb = typeof navigator !== 'undefined';
    let isCodeServer = false;
    let isCodeArts = false;
    let isCodespaces = false;
    let isGitpod = false;

    // ---Web environment (running in browser)---
    if (isWeb && typeof window !== 'undefined') {
      const origin = window.location?.origin || '';

      console.log(origin);
      isCodespaces = /github\.dev|codespaces/i.test(origin);
      isGitpod = /gitpod/i.test(origin);
    }

    // --- Node.js environment (desktop or server) ---
    if (!isWeb && typeof process !== 'undefined') {
      console.log(process.env);
      console.log(process.execPath);
      console.log(process.argv);

      // Official remote agent for the current IDE product (VS Code or CodeArts)
      const isOfficialIdeRemote =
        process.env.VSCODE_AGENT_FOLDER !== undefined
        || process.execPath.includes(getIdeServerDirName())
        || (!isCodeArtsIde() && process.execPath.includes('.vscode-remote'));

      if (isOfficialIdeRemote) {
        // Explicitly not code-server/CodeArts
        return {
          isWeb: false,
          isCodeServer: false,
          isCodeArts: false,
          isCodespaces: false,
          isGitpod: false,
        };
      }

      // Explicitly detect Huawei CodeArts Server (key! Avoid misjudgment as desktop)
      if (
        process.env.CODEARTS_SERVER_VERSION !== undefined
        || (process.env.HOSTNAME && process.env.HOSTNAME.includes('codearts'))
        || process.execPath.includes('codearts')
        || process.argv.some((arg) => arg.includes('codearts'))
      ) {
        isCodeArts = true;
        isCodeServer = true; // CodeArts is based on code-server and is grouped together
      }
      // Detect open source version code-server
      else if (
        process.env.CODE_SERVER_VERSION !== undefined
        || process.argv.some((arg) => arg.includes('code-server'))
        || process.execPath.includes('code-server')
      ) {
        isCodeServer = true;
      }
      // Otherwise it defaults to desktop VS Code
    }

    return {
      isWeb,
      isCodeServer,
      isCodeArts,
      isCodespaces,
      isGitpod,
    };
  }

  // ===================================================================
  // 💻 Desktop VS Code installation method (using built-in commands)
  // NOTE: This method is not reliable in code-server/CodeArts and should be avoided calling
  // ===================================================================
  private async installViaVsixCommand(): Promise<void> {
    const { vsixRelativePath } = this.options;

    try {
      // URI of the build .vsix file (relative to the current plugin)
      const vsixUri = vscode.Uri.joinPath(
        this.context.extensionUri,
        vsixRelativePath,
      );

      // Verify file exists
      await vscode.workspace.fs.stat(vsixUri);
      // Call the VS Code built-in installation command
      await vscode.commands.executeCommand(
        'workbench.extensions.installExtension',
        vsixUri,
      );

      // Prompts the user that the debug plug-in has been automatically installed.
      vscode.window.showInformationMessage(t('mindStudio.debugPluginsInstalled'));
    }
    catch (err) {
      console.error('Desktop install failed:', err);
      vscode.window.showErrorMessage(t('mindStudio.installFailed', { error: (err as Error).message }));
    }
  }

  // ===================================================================
  // 🐳 code-server / CodeArts Server installation method (manual decompression + registration)
  // ===================================================================
  private async installForCodeServer(): Promise<void> {
    const {
      pluginId, vsixRelativePath, pluginVersion,
    } = this.options;

    try {
      // Get the correct extensions directory (CodeArts first)
      const extensionsDir = this.getCodeServerExtensionsDir();

      console.log(`🎯 Extensions directory: ${extensionsDir}`);

      const targetDir = path.join(
        extensionsDir,
        `${pluginId}-${pluginVersion}`,
      );

      if (fs.existsSync(targetDir)) {
        console.log(`📁 Already installed at ${targetDir}`);

        return;
      }

      // Upgrade path: remove directories of previously installed plugin
      // versions before extracting the new build. Otherwise stale
      // `${pluginId}-${oldVersion}` folders linger alongside the new one,
      // and code-server may load the older build.
      this.removeOldPluginVersions(extensionsDir, pluginId, pluginVersion);

      // Make sure the directory exists
      if (!fs.existsSync(extensionsDir)) {
        fs.mkdirSync(extensionsDir, { recursive: true });
      }

      // Absolute path to build .vsix (note: must be taken from extensionPath, not extensionUri)
      const vsixPath = path.join(this.context.extensionPath, vsixRelativePath);

      if (!fs.existsSync(vsixPath)) {
        throw new Error(`.vsix file not found at: ${vsixPath}`);
      }

      console.log(`📦 Using .vsix from: ${vsixPath}`);

      // Dynamically import adm-zip (to avoid errors in the Web environment)
      const AdmZip = (await import('adm-zip')).default;
      const zip = new AdmZip(vsixPath);

      // Create temporary directory
      const tempDir = path.join(targetDir, '..', 'temp-unzip-' + Date.now());

      fs.mkdirSync(tempDir, { recursive: true });

      // Unzip everything first
      zip.extractAllTo(tempDir, true);

      // Move extension/ content to targetDir
      const extensionDir = path.join(tempDir, 'extension');

      if (fs.existsSync(extensionDir)) {
        fs.cpSync(extensionDir, targetDir, { recursive: true });
      }

      // Clean up temporary directory
      fs.rmSync(tempDir, {
        recursive: true,
        force: true,
      });
      // Update extensions.json so it is recognized by CodeArts
      await this.updateExtensionsJson(extensionsDir, pluginId, pluginVersion);

      // Prompts the user that the debug plug-in has been automatically installed.
      vscode.window.showInformationMessage(t('mindStudio.debugPluginsInstalled'));
    }
    catch (err) {
      console.error('code-server/CodeArts install failed:', err);
      vscode.window.showErrorMessage(t('mindStudio.installFailed', { error: (err as Error).message }));
    }
  }

  /**
   * Remove directories of previously installed plugin versions (upgrade path).
   * Without this, `${pluginId}-${oldVersion}` folders linger alongside the new
   * `${pluginId}-${pluginVersion}`, and code-server may load the stale build.
   */
  private removeOldPluginVersions(
    extensionsDir: string,
    pluginId: string,
    currentVersion: string,
  ): void {
    if (!fs.existsSync(extensionsDir)) {
      return;
    }

    const prefix = `${pluginId}-`;
    let removed = 0;

    for (const entry of fs.readdirSync(extensionsDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith(prefix)) {
        continue;
      }

      const entryVersion = entry.name.slice(prefix.length);

      if (entryVersion === currentVersion) {
        continue;
      }

      const oldDir = path.join(extensionsDir, entry.name);

      try {
        fs.rmSync(oldDir, {
          recursive: true,
          force: true,
        });
        removed++;
        console.log(`🧹 Removed old plugin version dir: ${entry.name}`);
      }
      catch (err) {
        console.warn(`Failed to remove old version ${entry.name}:`, err);
      }
    }

    if (removed > 0) {
      console.log(`🧹 Removed ${removed} old plugin version directory/directories for ${pluginId}.`);
    }
  }

  /**
   * Get the extensions directory of code-server or the current IDE server.
   */
  private getCodeServerExtensionsDir(): string {
    if (isCodeArtsIde() || process.env.CODEARTS_SERVER_VERSION) {
      return path.join(os.homedir(), joinIdeServerRelative('extensions'));
    }

    // Fallback to standard code-server path
    return path.join(
      os.homedir(),
      '.local',
      'share',
      'code-server',
      'extensions',
    );
  }

  /**
   * Update extensions.json to be compatible with CodeArts Server format
   * The generated structure is completely consistent with the actual environment, ensuring plug-in persistence
   */
  private async updateExtensionsJson(
    dir: string,
    id: string,
    version: string,
  ): Promise<void> {
    const jsonPath = path.join(dir, 'extensions.json');
    let manifest: any[] = [];

    // Read existing configuration if it exists
    if (fs.existsSync(jsonPath)) {
      try {
        const content = fs.readFileSync(jsonPath, 'utf8');

        manifest = JSON.parse(content);
      }
      catch {
        console.warn('Failed to parse extensions.json, starting fresh.');
      }
    }

    // Remove any prior entries for this plugin (regardless of version).
    // Otherwise multiple `pinned: true` rows for the same id coexist and
    // code-server may load an older build after an OP DevTools upgrade.
    const before = manifest.length;

    manifest = manifest.filter((ext) => ext.identifier?.id !== id);
    const removed = before - manifest.length;

    if (removed > 0) {
      console.log(`🧹 Removed ${removed} stale extensions.json entries for ${id}.`);
    }

    // Constructing CodeArts-compatible entries
    const relativeLocation = `${id}-${version}`;
    const fsPath = path.join(dir, relativeLocation);
    const externalUrl = `file://${fsPath.replace(/\\/g, '/')}`; // Always use forward slashes

    const newEntry = {
      identifier: { id },
      version,
      location: {
        $mid: 1,
        fsPath,
        external: externalUrl,
        path: fsPath,
        scheme: 'file',
      },
      relativeLocation,
      metadata: {
        installedTimestamp: Date.now(),
        pinned: true,
        source: 'vsix',
      },
    };

    manifest.push(newEntry);
    fs.writeFileSync(jsonPath, JSON.stringify(manifest, null, 2), 'utf8');
    console.log(`📝 Successfully updated extensions.json for ${id}`);
  }

  // ===================================================================
  // ☁️ Web IDE (Codespaces/Gitpod) processing: generate configuration files
  // ===================================================================
  private async handleWebIDE(env: ReturnType<MindStudioPluginInstaller['detectEnvironment']>): Promise<void> {
    let generated = false;

    try {
      if (env.isCodespaces) {
        generated = await this.generateDevContainerConfig();
      }
      else if (env.isGitpod) {
        generated = await this.generateGitpodConfig();
      }
      else {
        if (!this.isCursorHost()) {
          await vscode.window.showWarningMessage(
            t('mindStudio.webManualConfig'),
            t('common.confirm'),
          );
        }

        return;
      }
    }
    catch (err) {
      vscode.window.showErrorMessage(t('mindStudio.configGenerateFailed', { error: (err as Error).message }));

      return;
    }

    if (generated) {
      // Prompts the user that the debug plug-in has been automatically installed.
      vscode.window.showInformationMessage(t('mindStudio.debugPluginsInstalled'));
    }
  }

  /**
   * Generate devcontainer.json for GitHub Codespaces
   */
  private async generateDevContainerConfig(): Promise<boolean> {
    const wsFolder = vscode.workspace.workspaceFolders?.[0];

    if (!wsFolder) {
      throw new Error('No workspace folder.');
    }

    const dir = vscode.Uri.joinPath(wsFolder.uri, '.devcontainer');
    const file = vscode.Uri.joinPath(dir, 'devcontainer.json');

    // Check if the plugin is included
    try {
      const buf = await vscode.workspace.fs.readFile(file);
      const text = new TextDecoder()
        .decode(buf);

      if (text.includes(this.options.pluginId)) {
        return false;
      }
    }
    catch {
      // File does not exist, continue to create
    }

    await vscode.workspace.fs.createDirectory(dir);

    const config = {
      name: 'MindStudio Dev',
      image: 'mcr.microsoft.com/devcontainers/base:ubuntu',
      customizations: { vscode: { extensions: [this.options.pluginId] } },
    };

    const content = new TextEncoder()
      .encode(JSON.stringify(config, null, 2));

    await vscode.workspace.fs.writeFile(file, content);

    return true;
  }

  /**
   * Generate .gitpod.yml for Gitpod
   */
  private async generateGitpodConfig(): Promise<boolean> {
    const wsFolder = vscode.workspace.workspaceFolders?.[0];

    if (!wsFolder) {
      throw new Error('No workspace folder.');
    }

    const file = vscode.Uri.joinPath(wsFolder.uri, '.gitpod.yml');

    try {
      const buf = await vscode.workspace.fs.readFile(file);
      const text = new TextDecoder()
        .decode(buf);

      if (text.includes(this.options.pluginId)) {
        return false;
      }
    }
    catch {
      // File does not exist
    }

    const yaml = `image: gitpod/workspace-full

vscode:
  extensions:
    - ${this.options.pluginId}
`;

    await vscode.workspace.fs.writeFile(file, new TextEncoder()
      .encode(yaml));

    return true;
  }
}
