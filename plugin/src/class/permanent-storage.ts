/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as vscode from 'vscode';

/**
 * VSCode plug-in permanent data storage class
 * Use VSCode’s ExtensionContext.globalState to achieve data persistence
 */
export class PermanentStorage {
  private static instance: PermanentStorage;
  static getInstance(): PermanentStorage {
    return PermanentStorage.instance;
  }

  static setInstance(context: vscode.ExtensionContext): void {
    PermanentStorage.instance = new PermanentStorage(context);
  }

  private readonly context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Store data
   * @param key storage key name
   * @param value stored value (supports any serializable data)
   */
  async set<T>(key: string, value: T): Promise<void> {
    await this.context.globalState.update(key, value);
  }

  /**
   * Get data
   * @param key The key name to be obtained
   * @returns stored value or default value
   */
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  get<T>(key: string, defaultValue?: T): T | undefined {
    return this.context.globalState.get(key, defaultValue);
  }

  /**
   * Check if key exists
   * @param key The key name to check
   * @returns exists
   */
  has(key: string): boolean {
    return this.context.globalState.get(key) !== undefined;
  }

  /**
   * Delete the specified key-value pair
   * @param key The key name to be deleted
   */
  async delete(key: string): Promise<void> {
    await this.context.globalState.update(key, undefined);
  }

  /**
   * Get all stored keys
   * @returns array of all keys
   */
  keys(): readonly string[] {
    // Note: globalState.keys() returns all state keys of the current expansion
    return this.context.globalState.keys();
  }

  /**
   * Clear all stored data
   */
  async clear(): Promise<void> {
    const allKeys = this.keys();

    for (const key of allKeys) {
      await this.delete(key);
    }
  }

  /**
   * Get the entire storage object (for debugging or backup)
   * @returns an object containing all key-value pairs
   */
  getAll(): { [key: string]: any } {
    const result: { [key: string]: any } = {};
    const allKeys = this.keys();

    for (const key of allKeys) {
      result[key] = this.get(key);
    }

    return result;
  }

  /**
   * Set multiple key-value pairs in batches
   * @param items key-value pair object
   */
  async setMultiple(items: { [key: string]: any }): Promise<void> {
    for (const [
      key,
      value,
    ] of Object.entries(items)) {
      await this.set(key, value);
    }
  }

  /**
   * Get the values ​​of multiple keys in batches
   * @param keys The array of key names to be obtained
   * @returns corresponding value object
   */
  getMultiple(keys: string[]): { [key: string]: any } {
    const result: { [key: string]: any } = {};

    for (const key of keys) {
      result[key] = this.get(key);
    }

    return result;
  }
}
