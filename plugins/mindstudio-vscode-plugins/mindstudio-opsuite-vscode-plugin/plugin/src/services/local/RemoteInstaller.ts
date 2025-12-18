import { ReadableStream } from 'node:stream/web';
import { ExtensionConfig } from '../ExtensionConfig';
import DirectoryZipper from './DirectoryZipper';
import RemoteServer, { RemoteServerConfig } from './RemoteServer';

/** VSCode 远程服务器扩展存放根目录 */
const VSCODE_SERVER_EXTENSIONS_ROOT = '.vscode-server/extensions/';

/** 源代码目录名称 */
const SOURCE_CODE_DIR_NAME = 'mindstudio-opsuite-vscode-plugin';

/**
 * 远程安装服务类，提供远程安装相关功能
 */
export class RemoteInstaller {
  private remoteServer: RemoteServer;

  constructor(config: RemoteServerConfig) {
    this.remoteServer = new RemoteServer(config);
  }

  public installOnRemoteServer(): ReadableStream<number> {
    return new ReadableStream({
      start: async (controller) => {
        await this.remoteServer.connect();
        const remoteExtensionPath = `${VSCODE_SERVER_EXTENSIONS_ROOT}${ExtensionConfig.packageName}`;
        const hasRemoteExtension = await this.checkExtensionExistsOnRemote(remoteExtensionPath);
        if (!hasRemoteExtension) {
          controller.enqueue(20);
          const zipFileName = `${ExtensionConfig.extensionName}.zip`;
          const zipFilePath = await this.zipLocalExtension(zipFileName);
          controller.enqueue(50);
          await this.remoteServer.uploadFile(zipFilePath, zipFileName, VSCODE_SERVER_EXTENSIONS_ROOT);
          controller.enqueue(80);
          await this.remoteServer.unzipFile(`${VSCODE_SERVER_EXTENSIONS_ROOT}${zipFileName}`, remoteExtensionPath, { zipType: 'zip' });
          controller.enqueue(90);
          await this.executeInstallCommand(remoteExtensionPath);
        }
        controller.enqueue(100);
        controller.close();
      },
    });
  }

  /**
   * 检查远端是否已安装插件
   * @param remoteExtensionPath 远端插件路径
   * @returns 是否已安装
   */
  private async checkExtensionExistsOnRemote(remoteExtensionPath: string): Promise<boolean> {
    const cmdOut = await this.remoteServer.executeCommand(`cd ${remoteExtensionPath}`);
    return !(cmdOut.stderr && cmdOut.stderr.indexOf('No such file or directory') !== -1);
  }

  /**
   * 打包本地插件代码
   * @param zipFileName 压缩文件名称
   * @returns 压缩文件地址
   */
  private async zipLocalExtension(zipFileName: string): Promise<string> {
    const zipper = new DirectoryZipper();
    zipper.setCurrentDirectory(__dirname);
    let zipFilePath = await zipper.findAndZipDirectory(ExtensionConfig.packageName, zipFileName);
    if (!zipFilePath) {
      // 开发模式，打包整个插件目录
      zipFilePath = await zipper.findAndZipDirectory(SOURCE_CODE_DIR_NAME, zipFileName);
    }
    return zipFilePath;
  }

  /**
   * 执行安装命令
   * @param remoteExtensionPath 远端插件路径
   */
  private async executeInstallCommand(remoteExtensionPath: string): Promise<void> {
    const commandFilePath = `${remoteExtensionPath}/out/shells/register_extension.sh`;
    await this.remoteServer.executeCommand(`chmod +x  ${commandFilePath}`);
    await this.remoteServer.executeCommand(`${commandFilePath} ${ExtensionConfig.publisher} ${ExtensionConfig.extensionName} ${ExtensionConfig.version}`);
  }
}
