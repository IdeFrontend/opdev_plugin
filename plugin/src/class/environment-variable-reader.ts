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
 * environment variable reader
 * Priority is given to reading directly from process.env. If it cannot be obtained, it is read from the .arts/.env file in the vscode working directory.
 */
export class EnvironmentVariableReader {
  private static envCache: Map<string, string> = new Map();
  private static isEnvLoaded: boolean = false;

  /**
   * Get the specified environment variable value
   * @param varName environment variable name
   * @param fallbackToEnvFile If direct reading fails, whether to try to read from .arts/.env file (default true)
   * @returns environment variable value, if it does not exist, return undefined
   */
  static getEnv(
    varName: string,
    fallbackToEnvFile: boolean = true,
  ): string | undefined {
    // Prioritize reading directly from process.env
    const directValue = process.env[varName];

    if (directValue) {
      console.log(`[EnvironmentVariableReader] Read environment variable ${varName} directly from process.env: ${directValue}`);

      return directValue;
    }

    // If direct reading fails and reading from .env file is allowed
    if (fallbackToEnvFile) {
      try {
        // Load the .env file if it is not already loaded
        if (!this.isEnvLoaded) {
          this.loadEnvFile();
        }

        // Read from cache
        const cachedValue = this.envCache.get(varName);

        if (cachedValue) {
          console.log(`[EnvironmentVariableReader] Read environment variable ${varName} from .arts/.env: ${cachedValue}`);

          return cachedValue;
        }
      }
      catch (error) {
        console.warn(
          `[EnvironmentVariableReader] Failed to read ${varName} from .arts/.env:`,
          error,
        );
      }
    }

    console.warn(`[EnvironmentVariableReader] Environment variable ${varName} does not exist`);

    return undefined;
  }

  /**
   * Load environment variables from the .arts/.env file in the vscode working directory
   */
  private static loadEnvFile(): void {
    if (this.isEnvLoaded) {
      return;
    }

    try {
      // Get workspace folder
      const workspaceFolders = vscode.workspace.workspaceFolders;

      if (!workspaceFolders || workspaceFolders.length === 0) {
        console.warn('[EnvironmentVariableReader] Workspace folder not found, cannot load .arts/.env file');
        this.isEnvLoaded = true;

        return;
      }

      // Use the first workspace folder
      const workspacePath = workspaceFolders[0].uri.fsPath;
      const envFilePath = path.join(workspacePath, '.arts', '.env');

      // Check if the file exists
      if (!fs.existsSync(envFilePath)) {
        console.warn(`[EnvironmentVariableReader] .env file does not exist: ${envFilePath}`);
        this.isEnvLoaded = true;

        return;
      }

      // Read file contents
      const envContent = fs.readFileSync(envFilePath, 'utf-8');

      // Parse environment variables
      this.parseEnvFile(envContent);
      this.isEnvLoaded = true;
      console.log(`[EnvironmentVariableReader] Successfully loaded environment variables from .arts/.env, total ${this.envCache.size}`);
    }
    catch (error: any) {
      console.error(
        '[EnvironmentVariableReader] Failed to load .arts/.env file:',
        error.message,
      );
      // Mark as loaded even if it fails to avoid repeated attempts
      this.isEnvLoaded = true;
    }
  }

  /**
   * Parse .env file contents
   * @param content .env file content
   */
  private static parseEnvFile(content: string): void {
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip empty lines and comment lines
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue;
      }

      // Parsing format: VAR_NAME=value or VAR_NAME="value" or VAR_NAME='value'
      // Supports possible spaces before and after the equal sign
      const match = trimmedLine.match(/^\s*([^=#\s]+)\s*=\s*(.*)$/);

      if (match) {
        const varName = match[1].trim();
        let varValue = match[2].trim();

        // Remove quotes (if any)
        if (
          (varValue.startsWith('"') && varValue.endsWith('"'))
          || (varValue.startsWith("'") && varValue.endsWith("'"))
        ) {
          varValue = varValue.slice(1, -1);
        }

        // Process end-of-line comments (content after #)
        const commentIndex = varValue.indexOf('#');

        if (commentIndex !== -1) {
          // Check if # is inside quotes
          const beforeComment = varValue.substring(0, commentIndex);
          const quoteCount = (beforeComment.match(/"/g) || []).length;

          if (quoteCount % 2 === 0) {
            // # Without quotes, remove comments
            varValue = beforeComment.trim();

            // Check the quotes again
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
   * Clear environment variable cache
   * Used to force a reload of .env files
   */
  static clearCache(): void {
    this.envCache.clear();
    this.isEnvLoaded = false;
    console.log('[EnvironmentVariableReader] Cleared environment variable cache');
  }

  /**
   * Get all cached environment variables
   * @returns environment variable key-value pair mapping
   */
  static getAllCachedEnv(): Map<string, string> {
    return new Map(this.envCache);
  }
}
