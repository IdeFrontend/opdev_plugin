/**
 * 远程配置管理模块
 * 用于在远程服务器上存储和读取配置信息
 * 配置文件存储位置: ~/.vscode-server/data/ms-op-suite/config.json
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * 配置文件存储的数据结构
 */
interface RemoteConfigData {
  lastProjectPath?: string;
  [key: string]: any;
}

/**
 * 远程配置管理类
 */
export class RemoteConfig {
  private static CONFIG_DIR = '.vscode-server/data/ms-op-suite';
  private static CONFIG_FILE = 'config.json';

  /**
   * 获取配置文件的完整路径
   */
  private static getConfigPath(): string {
    const homeDir = os.homedir();
    const configDir = path.join(homeDir, this.CONFIG_DIR);

    return path.join(configDir, this.CONFIG_FILE);
  }

  /**
   * 确保配置目录存在
   */
  private static ensureConfigDir(): void {
    const homeDir = os.homedir();
    const configDir = path.join(homeDir, this.CONFIG_DIR);

    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
  }

  /**
   * 读取配置文件
   */
  private static readConfig(): RemoteConfigData {
    const configPath = this.getConfigPath();

    try {
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8');

        return JSON.parse(content);
      }
    } catch (error) {
      console.error('读取远程配置文件失败:', error);
    }

    return {};
  }

  /**
   * 写入配置文件
   */
  private static writeConfig(config: RemoteConfigData): void {
    this.ensureConfigDir();
    const configPath = this.getConfigPath();

    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    } catch (error) {
      console.error('写入远程配置文件失败:', error);
      throw error;
    }
  }

  /**
   * 获取最后使用的项目路径
   */
  static getLastProjectPath(): string | null {
    const config = this.readConfig();

    return config.lastProjectPath || null;
  }

  /**
   * 设置最后使用的项目路径
   */
  static setLastProjectPath(projectPath: string): void {
    const config = this.readConfig();

    config.lastProjectPath = projectPath;
    this.writeConfig(config);
  }

  /**
   * 清除最后使用的项目路径
   */
  static clearLastProjectPath(): void {
    const config = this.readConfig();

    delete config.lastProjectPath;
    this.writeConfig(config);
  }

  /**
   * 获取配置项
   */
  static get(key: string): any {
    const config = this.readConfig();

    return config[key];
  }

  /**
   * 设置配置项
   */
  static set(key: string, value: any): void {
    const config = this.readConfig();

    config[key] = value;
    this.writeConfig(config);
  }

  /**
   * 删除配置项
   */
  static delete(key: string): void {
    const config = this.readConfig();

    delete config[key];
    this.writeConfig(config);
  }

  /**
   * 清空所有配置
   */
  static clear(): void {
    this.writeConfig({});
  }
}
