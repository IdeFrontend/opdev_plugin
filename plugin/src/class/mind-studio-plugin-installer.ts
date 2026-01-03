import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

/**
 * 插件安装配置选项
 */
export interface InstallOptions {
  /** 目标插件的 ID，例如 'ascend.mindstudio-debug-vscode-plugin' */
  pluginId: string;
  /** .vsix 文件相对于当前插件根目录的路径 */
  vsixRelativePath: string;
  /** 插件版本号，用于构建目标文件夹名和注册信息 */
  pluginVersion: string;
}

/**
 * MindStudio 插件自动安装器
 * 支持多环境：桌面 VS Code / code-server / 华为 CodeArts Server / Codespaces / Gitpod
 */
export class MindStudioPluginInstaller {
  private readonly context: vscode.ExtensionContext;
  private readonly options: InstallOptions;

  constructor(context: vscode.ExtensionContext, options: InstallOptions) {
    this.context = context;
    this.options = options;
  }

  /**
   * 主入口：检查目标插件是否已激活，若未安装则根据当前环境自动安装
   */
  async installIfNeeded(): Promise<void> {
    const { pluginId } = this.options;

    // 如果插件已激活，直接返回
    if (vscode.extensions.getExtension(pluginId)) {
      console.log(`✅ ${pluginId} already active.`);

      return;
    }

    // 检测当前运行环境
    const env = this.detectEnvironment();

    console.log(env);

    // 优先处理基于 code-server 的环境（包括华为 CodeArts）
    if (env.isCodeServer) {
      console.log('🔧 Detected code-server or CodeArts environment.');
      await this.installForCodeServer();
    }
    // 处理 Web 浏览器环境（如 GitHub Codespaces、Gitpod）
    else if (env.isWeb) {
      console.log('☁️ Detected web-based IDE environment.');
      await this.handleWebIDE(env);
    }
    // 最后回退到桌面 VS Code
    else {
      console.log('💻 Detected desktop VS Code environment.');
      await this.installViaVsixCommand();
    }
  }

  // ===================================================================
  // 🌍 环境检测：精准识别运行平台
  // ===================================================================
  private detectEnvironment() {
    const isWeb = typeof navigator !== 'undefined';
    let isCodeServer = false;
    let isCodeArts = false;
    let isCodespaces = false;
    let isGitpod = false;

    // --- Web 环境（浏览器中运行）---
    if (isWeb && typeof window !== 'undefined') {
      const origin = window.location?.origin || '';

      console.log(origin);
      isCodespaces = /github\.dev|codespaces/i.test(origin);
      isGitpod = /gitpod/i.test(origin);
    }

    // --- Node.js 环境（桌面或服务端）---
    if (!isWeb && typeof process !== 'undefined') {
      console.log(process.env);
      console.log(process.execPath);
      console.log(process.argv);

      // ✅【关键】先判断是否是 VS Code 官方 Remote（SSH / WSL / Container）
      const isVSCodeOfficialRemote =
        // 官方 Remote 一定会设置这个
        process.env.VSCODE_AGENT_FOLDER !== undefined ||
        // 或者进程路径包含官方 server 标识
        process.execPath.includes('.vscode-server') ||
        process.execPath.includes('.vscode-remote');

      if (isVSCodeOfficialRemote) {
        // 明确不是 code-server / CodeArts
        return {
          isWeb: false,
          isCodeServer: false,
          isCodeArts: false,
          isCodespaces: false,
          isGitpod: false,
        };
      }

      // 显式检测 华为 CodeArts Server（关键！避免误判为桌面）
      if (
        process.env.CODEARTS_SERVER_VERSION !== undefined ||
        (process.env.HOSTNAME && process.env.HOSTNAME.includes('codearts')) ||
        process.execPath.includes('codearts') ||
        process.argv.some((arg) => arg.includes('codearts'))
      ) {
        isCodeArts = true;
        isCodeServer = true; // CodeArts 基于 code-server，归为一类
      }
      // 检测开源版 code-server
      else if (
        process.env.CODE_SERVER_VERSION !== undefined ||
        process.argv.some((arg) => arg.includes('code-server')) ||
        process.execPath.includes('code-server')
      ) {
        isCodeServer = true;
      }
      // 否则默认为桌面 VS Code
    }

    return { isWeb, isCodeServer, isCodeArts, isCodespaces, isGitpod };
  }

  // ===================================================================
  // 💻 桌面 VS Code 安装方式（使用内置命令）
  // 注意：此方法在 code-server/CodeArts 中不可靠，应避免调用
  // ===================================================================
  private async installViaVsixCommand(): Promise<void> {
    const { pluginId, vsixRelativePath } = this.options;

    try {
      // 构建 .vsix 文件的 URI（相对于当前插件）
      const vsixUri = vscode.Uri.joinPath(
        this.context.extensionUri,
        vsixRelativePath,
      );

      // 验证文件是否存在
      await vscode.workspace.fs.stat(vsixUri);
      // 调用 VS Code 内置安装命令
      await vscode.commands.executeCommand(
        'workbench.extensions.installExtension',
        vsixUri,
      );

      // 提示用户 debug 插件已自动安装完成
      vscode.window.showInformationMessage(
        '✅ 相关 Debug 插件已自动安装完成，可立即使用。',
      );
    } catch (err) {
      console.error('Desktop install failed:', err);
      vscode.window.showErrorMessage(`安装失败：${(err as Error).message}`);
    }
  }

  // ===================================================================
  // 🐳 code-server / CodeArts Server 安装方式（手动解压 + 注册）
  // ===================================================================
  private async installForCodeServer(): Promise<void> {
    const { pluginId, vsixRelativePath, pluginVersion } = this.options;

    try {
      // 获取正确的 extensions 目录（优先 CodeArts）
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

      // 确保目录存在
      if (!fs.existsSync(extensionsDir)) {
        fs.mkdirSync(extensionsDir, { recursive: true });
      }

      // 构建 .vsix 的绝对路径（注意：必须从 extensionPath 取，不是 extensionUri）
      const vsixPath = path.join(this.context.extensionPath, vsixRelativePath);

      if (!fs.existsSync(vsixPath)) {
        throw new Error(`.vsix file not found at: ${vsixPath}`);
      }
      console.log(`📦 Using .vsix from: ${vsixPath}`);

      // 动态导入 adm-zip（避免 Web 环境报错）
      const AdmZip = (await import('adm-zip')).default;
      const zip = new AdmZip(vsixPath);

      // 创建临时目录
      const tempDir = path.join(targetDir, '..', 'temp-unzip-' + Date.now());

      fs.mkdirSync(tempDir, { recursive: true });

      // 先全部解压
      zip.extractAllTo(tempDir, true);

      // 把 extension/ 内容移动到 targetDir
      const extensionDir = path.join(tempDir, 'extension');

      if (fs.existsSync(extensionDir)) {
        fs.cpSync(extensionDir, targetDir, { recursive: true });
      }

      // 清理临时目录
      fs.rmSync(tempDir, { recursive: true, force: true });
      // 更新 extensions.json，使其被 CodeArts 识别
      await this.updateExtensionsJson(extensionsDir, pluginId, pluginVersion);

      // 提示用户 debug 插件已自动安装完成
      vscode.window.showInformationMessage(
        '✅ 相关 Debug 插件已自动安装完成，可立即使用。',
      );
    } catch (err) {
      console.error('code-server/CodeArts install failed:', err);
      vscode.window.showErrorMessage(`安装失败：${(err as Error).message}`);
    }
  }

  /**
   * 获取 code-server 或 CodeArts 的 extensions 目录
   * 优先返回 CodeArts 路径（~/.codearts-server/extensions）
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

    // 回退到标准 code-server 路径
    return path.join(
      os.homedir(),
      '.local',
      'share',
      'code-server',
      'extensions',
    );
  }

  /**
   * 更新 extensions.json，使其兼容 CodeArts Server 的格式
   * 生成结构与实际环境完全一致，确保插件持久化
   */
  private async updateExtensionsJson(
    dir: string,
    id: string,
    version: string,
  ): Promise<void> {
    const jsonPath = path.join(dir, 'extensions.json');
    let manifest: any[] = [];

    // 读取现有配置（如果存在）
    if (fs.existsSync(jsonPath)) {
      try {
        const content = fs.readFileSync(jsonPath, 'utf8');

        manifest = JSON.parse(content);
      } catch (e) {
        console.warn('Failed to parse extensions.json, starting fresh.');
      }
    }

    // 避免重复注册
    const exists = manifest.some(
      (ext) => ext.identifier?.id === id && ext.version === version,
    );

    if (exists) {
      console.log(
        `✅ Extension ${id}@${version} already registered in extensions.json`,
      );

      return;
    }

    // 构造 CodeArts 兼容的条目
    const relativeLocation = `${id}-${version}`;
    const fsPath = path.join(dir, relativeLocation);
    const externalUrl = `file://${fsPath.replace(/\\/g, '/')}`; // 统一使用正斜杠

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
  // ☁️ Web IDE（Codespaces / Gitpod）处理：生成配置文件
  // ===================================================================
  private async handleWebIDE(
    env: ReturnType<MindStudioPluginInstaller['detectEnvironment']>,
  ): Promise<void> {
    const { pluginId } = this.options;
    let generated = false;
    let configPath = '';

    try {
      if (env.isCodespaces) {
        generated = await this.generateDevContainerConfig();
        configPath = '.devcontainer/devcontainer.json';
      } else if (env.isGitpod) {
        generated = await this.generateGitpodConfig();
        configPath = '.gitpod.yml';
      } else {
        await vscode.window.showWarningMessage(
          `当前 Web 环境不支持自动安装，请手动配置。`,
          '确定',
        );

        return;
      }
    } catch (err) {
      vscode.window.showErrorMessage(
        `配置文件生成失败：${(err as Error).message}`,
      );

      return;
    }

    if (generated) {
      // 提示用户 debug 插件已自动安装完成
      vscode.window.showInformationMessage(
        '✅ 相关 Debug 插件已自动安装完成，可立即使用。',
      );
    }
  }

  /**
   * 为 GitHub Codespaces 生成 devcontainer.json
   */
  private async generateDevContainerConfig(): Promise<boolean> {
    const wsFolder = vscode.workspace.workspaceFolders?.[0];

    if (!wsFolder) throw new Error('No workspace folder.');

    const dir = vscode.Uri.joinPath(wsFolder.uri, '.devcontainer');
    const file = vscode.Uri.joinPath(dir, 'devcontainer.json');

    // 检查是否已包含该插件
    try {
      const buf = await vscode.workspace.fs.readFile(file);
      const text = new TextDecoder().decode(buf);

      if (text.includes(this.options.pluginId)) return false;
    } catch {
      // 文件不存在，继续创建
    }

    await vscode.workspace.fs.createDirectory(dir);

    const config = {
      name: 'MindStudio Dev',
      image: 'mcr.microsoft.com/devcontainers/base:ubuntu',
      customizations: {
        vscode: {
          extensions: [this.options.pluginId],
        },
      },
    };

    const content = new TextEncoder().encode(JSON.stringify(config, null, 2));

    await vscode.workspace.fs.writeFile(file, content);

    return true;
  }

  /**
   * 为 Gitpod 生成 .gitpod.yml
   */
  private async generateGitpodConfig(): Promise<boolean> {
    const wsFolder = vscode.workspace.workspaceFolders?.[0];

    if (!wsFolder) throw new Error('No workspace folder.');

    const file = vscode.Uri.joinPath(wsFolder.uri, '.gitpod.yml');

    try {
      const buf = await vscode.workspace.fs.readFile(file);
      const text = new TextDecoder().decode(buf);

      if (text.includes(this.options.pluginId)) return false;
    } catch {
      // 文件不存在
    }

    const yaml = `image: gitpod/workspace-full

vscode:
  extensions:
    - ${this.options.pluginId}
`;

    await vscode.workspace.fs.writeFile(file, new TextEncoder().encode(yaml));

    return true;
  }
}
