import { t } from 'i18next';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

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

  /**
   * Main entrance: Check whether the target plug-in has been activated. If it is not installed, it will be automatically installed according to the current environment.
   */
  async installIfNeeded(): Promise<void> {
    const { pluginId } = this.options;

    // If the plug-in is activated, return directly
    if (vscode.extensions.getExtension(pluginId)) {
      console.log(`✅ ${pluginId} already active.`);

      return;
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

      // ✅[Key] First determine whether it is VS Code official Remote (SSH / WSL / Container)
      const isVSCodeOfficialRemote =
        // The official Remote will definitely set this
        process.env.VSCODE_AGENT_FOLDER !== undefined
        // Or the process path contains the official server identifier
        || process.execPath.includes('.vscode-server')
        || process.execPath.includes('.vscode-remote');

      if (isVSCodeOfficialRemote) {
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
   * Get the extensions directory of code-server or CodeArts
   * Return the CodeArts path first (~/.codearts-server/extensions)
   */
  private getCodeServerExtensionsDir(): string {
    const codeartsDir = path.join(
      os.homedir(),
      '.codearts-server',
      'extensions',
    );

    if (fs.existsSync(codeartsDir) || process.env.CODEARTS_SERVER_VERSION) {
      return codeartsDir;
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

    // Avoid duplicate registration
    const exists = manifest.some((ext) => ext.identifier?.id === id && ext.version === version);

    if (exists) {
      console.log(`✅ Extension ${id}@${version} already registered in extensions.json`);

      return;
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
        await vscode.window.showWarningMessage(
          t('mindStudio.webManualConfig'),
          t('common.confirm'),
        );

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
