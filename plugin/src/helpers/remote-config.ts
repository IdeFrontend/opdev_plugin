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
  [key: string]: unknown;
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
    }
    catch (error) {
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
    }
    catch (error) {
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
  static get(key: string): unknown {
    const config = this.readConfig();

    return config[key];
  }

  /**
   * 设置配置项
   */
  static set(key: string, value: unknown): void {
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

  /**
   * 搜索路径
   * @param params 搜索参数
   */
  static async searchPath(params: {
    keyword: string;
    type: string;
  }): Promise<{ type: string;
    list: Array<{ path: string }> }> {
    const {
      keyword, type,
    } = params;

    // 如果关键词为空，返回空列表
    if (!keyword) {
      return {
        type,
        list: [],
      };
    }

    // 如果是绝对路径
    if (path.isAbsolute(keyword)) {
      try {
        const stats = await fs.promises.stat(keyword);
        
        if (stats.isDirectory()) {
          const files = await fs.promises.readdir(keyword);

          return {
            type,
            list: files.map((file) => ({ path: path.join(keyword, file) })),
          };
        }
      }
      catch {
        // 忽略错误
      }
    }

    // 默认行为：尝试列出目录内容或返回匹配项
    // 这里简单实现：如果路径存在且是目录，返回目录下的文件；否则返回空
    try {
      if (fs.existsSync(keyword)) {
        const stats = await fs.promises.stat(keyword);

        if (stats.isDirectory()) {
          const files = await fs.promises.readdir(keyword);
          const fullPaths = files.map((file) => path.join(keyword, file));
          
          return {
            type,
            list: fullPaths.map((p) => ({ path: p })),
          };
        }
      }
    }
    catch {
      // 忽略错误
    }

    return {
      type,
      list: [],
    };
  }
}
