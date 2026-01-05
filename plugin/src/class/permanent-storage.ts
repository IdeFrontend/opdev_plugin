/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as vscode from 'vscode';

/**
 * VSCode 插件永久性数据存储类
 * 使用 VSCode 的 ExtensionContext.globalState 实现数据持久化
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
   * 存储数据
   * @param key 存储键名
   * @param value 存储的值（支持任何可序列化的数据）
   */
  async set<T>(key: string, value: T): Promise<void> {
    await this.context.globalState.update(key, value);
  }

  /**
   * 获取数据
   * @param key 要获取的键名
   * @returns 存储的值或默认值
   */
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  get<T>(key: string, defaultValue?: T): T | undefined {
    return this.context.globalState.get(key, defaultValue);
  }

  /**
   * 检查键是否存在
   * @param key 要检查的键名
   * @returns 是否存在
   */
  has(key: string): boolean {
    return this.context.globalState.get(key) !== undefined;
  }

  /**
   * 删除指定键值对
   * @param key 要删除的键名
   */
  async delete(key: string): Promise<void> {
    await this.context.globalState.update(key, undefined);
  }

  /**
   * 获取所有存储的键
   * @returns 所有键的数组
   */
  keys(): readonly string[] {
    // 注意：globalState.keys() 返回的是当前扩展的所有状态键
    return this.context.globalState.keys();
  }

  /**
   * 清空所有存储的数据
   */
  async clear(): Promise<void> {
    const allKeys = this.keys();

    for (const key of allKeys) {
      await this.delete(key);
    }
  }

  /**
   * 获取整个存储对象（用于调试或备份）
   * @returns 包含所有键值对的对象
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
   * 批量设置多个键值对
   * @param items 键值对对象
   */
  async setMultiple(items: { [key: string]: any }): Promise<void> {
    for (const [key, value] of Object.entries(items)) {
      await this.set(key, value);
    }
  }

  /**
   * 批量获取多个键的值
   * @param keys 要获取的键名数组
   * @returns 对应的值对象
   */
  getMultiple(keys: string[]): { [key: string]: any } {
    const result: { [key: string]: any } = {};

    for (const key of keys) {
      result[key] = this.get(key);
    }

    return result;
  }
}
