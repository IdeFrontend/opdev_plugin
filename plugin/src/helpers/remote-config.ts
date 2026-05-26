/**
 * Remote configuration management module
 * Used to store and read configuration information on remote servers
 * Configuration file storage location: ~/<ide-server>/data/ms-op-suite/config.json
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { joinIdeServerRelative } from '@plugin/helpers/ide-config-dir';

/**
 * Data structure of configuration file storage
 */
interface RemoteConfigData {
  lastProjectPath?: string;
  [key: string]: unknown;
}

/**
 * Remote configuration management class
 */
export class RemoteConfig {
  private static CONFIG_FILE = 'config.json';

  private static getConfigDir(): string {
    return joinIdeServerRelative('data', 'ms-op-suite');
  }

  /**
   * Get the full path to the configuration file
   */
  private static getConfigPath(): string {
    const homeDir = os.homedir();
    const configDir = path.join(homeDir, this.getConfigDir());

    return path.join(configDir, this.CONFIG_FILE);
  }

  /**
   * Make sure the configuration directory exists
   */
  private static ensureConfigDir(): void {
    const homeDir = os.homedir();
    const configDir = path.join(homeDir, this.getConfigDir());

    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
  }

  /**
   * Read configuration file
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
      console.error('Failed to read remote config file:', error);
    }

    return {};
  }

  /**
   * Write configuration file
   */
  private static writeConfig(config: RemoteConfigData): void {
    this.ensureConfigDir();
    const configPath = this.getConfigPath();

    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    }
    catch (error) {
      console.error('Failed to write remote config file:', error);
      throw error;
    }
  }

  /**
   * Get the last used project path
   */
  static getLastProjectPath(): string | null {
    const config = this.readConfig();

    return config.lastProjectPath || null;
  }

  /**
   * Set the last used project path
   */
  static setLastProjectPath(projectPath: string): void {
    const config = this.readConfig();

    config.lastProjectPath = projectPath;
    this.writeConfig(config);
  }

  /**
   * Clear the last used project path
   */
  static clearLastProjectPath(): void {
    const config = this.readConfig();

    delete config.lastProjectPath;
    this.writeConfig(config);
  }

  /**
   * Get configuration items
   */
  static get(key: string): unknown {
    const config = this.readConfig();

    return config[key];
  }

  /**
   * Set configuration items
   */
  static set(key: string, value: unknown): void {
    const config = this.readConfig();

    config[key] = value;
    this.writeConfig(config);
  }

  /**
   * Delete configuration item
   */
  static delete(key: string): void {
    const config = this.readConfig();

    delete config[key];
    this.writeConfig(config);
  }

  /**
   * Clear all configuration
   */
  static clear(): void {
    this.writeConfig({});
  }

  /**
   * search path
   * @param params search parameters
   */
  static async searchPath(params: {
    keyword: string;
    type: string;
  }): Promise<{ type: string;
    list: Array<{ path: string }> }> {
    const {
      keyword, type,
    } = params;

    // If the keyword is empty, an empty list is returned
    if (!keyword) {
      return {
        type,
        list: [],
      };
    }

    // If it is an absolute path
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
        // ignore errors
      }
    }

    // Default behavior: Attempt to list directory contents or return matches
    // Here is a simple implementation: if the path exists and is a directory, return the file in the directory; otherwise, return empty
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
      // ignore errors
    }

    return {
      type,
      list: [],
    };
  }
}
