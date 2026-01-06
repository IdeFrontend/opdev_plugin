/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * 环境变量读取器
 * 优先从 process.env 直接读取，如果取不到则从 vscode 工作目录下的 .arts/.env 文件读取
 */
export class EnvironmentVariableReader {
  private static envCache: Map<string, string> = new Map();
  private static isEnvLoaded: boolean = false;

  /**
   * 获取指定的环境变量值
   * @param varName 环境变量名称
   * @param fallbackToEnvFile 如果直接读取失败，是否尝试从 .arts/.env 文件读取（默认 true）
   * @returns 环境变量值，如果不存在则返回 undefined
   */
  static getEnv(
    varName: string,
    fallbackToEnvFile: boolean = true,
  ): string | undefined {
    // 优先从 process.env 直接读取
    const directValue = process.env[varName];

    if (directValue) {
      console.log(`[EnvironmentVariableReader] 从 process.env 直接获取环境变量 ${varName}: ${directValue}`);

      return directValue;
    }

    // 如果直接读取失败且允许从 .env 文件读取
    if (fallbackToEnvFile) {
      try {
        // 加载 .env 文件（如果尚未加载）
        if (!this.isEnvLoaded) {
          this.loadEnvFile();
        }

        // 从缓存中读取
        const cachedValue = this.envCache.get(varName);

        if (cachedValue) {
          console.log(`[EnvironmentVariableReader] 从 .arts/.env 文件获取环境变量 ${varName}: ${cachedValue}`);

          return cachedValue;
        }
      }
      catch (error) {
        console.warn(
          `[EnvironmentVariableReader] 从 .arts/.env 文件读取 ${varName} 失败:`,
          error,
        );
      }
    }

    console.warn(`[EnvironmentVariableReader] 环境变量 ${varName} 不存在`);

    return undefined;
  }

  /**
   * 从 vscode 工作目录下的 .arts/.env 文件加载环境变量
   */
  private static loadEnvFile(): void {
    if (this.isEnvLoaded) {
      return;
    }

    try {
      // 获取工作区文件夹
      const workspaceFolders = vscode.workspace.workspaceFolders;

      if (!workspaceFolders || workspaceFolders.length === 0) {
        console.warn('[EnvironmentVariableReader] 未找到工作区文件夹，无法加载 .arts/.env 文件');
        this.isEnvLoaded = true;

        return;
      }

      // 使用第一个工作区文件夹
      const workspacePath = workspaceFolders[0].uri.fsPath;
      const envFilePath = path.join(workspacePath, '.arts', '.env');

      // 检查文件是否存在
      if (!fs.existsSync(envFilePath)) {
        console.warn(`[EnvironmentVariableReader] .env 文件不存在: ${envFilePath}`);
        this.isEnvLoaded = true;

        return;
      }

      // 读取文件内容
      const envContent = fs.readFileSync(envFilePath, 'utf-8');

      // 解析环境变量
      this.parseEnvFile(envContent);
      this.isEnvLoaded = true;
      console.log(`[EnvironmentVariableReader] 成功从 .arts/.env 文件加载环境变量，共 ${this.envCache.size} 个`);
    }
    catch (error: any) {
      console.error(
        '[EnvironmentVariableReader] 加载 .arts/.env 文件失败:',
        error.message,
      );
      // 即使失败也标记为已加载，避免重复尝试
      this.isEnvLoaded = true;
    }
  }

  /**
   * 解析 .env 文件内容
   * @param content .env 文件内容
   */
  private static parseEnvFile(content: string): void {
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();

      // 跳过空行和注释行
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue;
      }

      // 解析格式：VAR_NAME=value 或 VAR_NAME="value" 或 VAR_NAME='value'
      // 支持等号前后可能有空格
      const match = trimmedLine.match(/^\s*([^=#\s]+)\s*=\s*(.*)$/);

      if (match) {
        const varName = match[1].trim();
        let varValue = match[2].trim();

        // 移除引号（如果有）
        if (
          (varValue.startsWith('"') && varValue.endsWith('"'))
          || (varValue.startsWith("'") && varValue.endsWith("'"))
        ) {
          varValue = varValue.slice(1, -1);
        }

        // 处理行尾注释（# 后面的内容）
        const commentIndex = varValue.indexOf('#');

        if (commentIndex !== -1) {
          // 检查 # 是否在引号内
          const beforeComment = varValue.substring(0, commentIndex);
          const quoteCount = (beforeComment.match(/"/g) || []).length;

          if (quoteCount % 2 === 0) {
            // # 不在引号内，移除注释
            varValue = beforeComment.trim();

            // 再次检查引号
            if (
              (varValue.startsWith('"') && varValue.endsWith('"'))
              || (varValue.startsWith("'") && varValue.endsWith("'"))
            ) {
              varValue = varValue.slice(1, -1);
            }
          }
        }

        this.envCache.set(varName, varValue);
      }
    }
  }

  /**
   * 清除环境变量缓存
   * 用于强制重新加载 .env 文件
   */
  static clearCache(): void {
    this.envCache.clear();
    this.isEnvLoaded = false;
    console.log('[EnvironmentVariableReader] 已清除环境变量缓存');
  }

  /**
   * 获取所有已缓存的环境变量
   * @returns 环境变量键值对映射
   */
  static getAllCachedEnv(): Map<string, string> {
    return new Map(this.envCache);
  }
}
