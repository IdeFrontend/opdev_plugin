/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getAllProjects } from '@plugin/domain/models/project-model';
import { OperatorProjectType } from '@plugin/domain/services/operator-project-detector';

/**
 * 算子工程文件夹装饰提供者
 * 参考 D:\msttObj\各种demo\icon-file 的实现方式
 * 只提供文件夹颜色装饰，不管理图标主题
 */
export class OperatorProjectIconTheme implements vscode.FileDecorationProvider {
  private static instance: OperatorProjectIconTheme;
  private decorationProviderDisposable?: vscode.Disposable;
  private onDidChangeFileDecorationsEmitter?: vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>;

  private constructor(context: vscode.ExtensionContext) {
    // 注册文件装饰提供者
    this.decorationProviderDisposable = vscode.window.registerFileDecorationProvider(this);
    context.subscriptions.push(this.decorationProviderDisposable);
  }

  static getInstance(context: vscode.ExtensionContext): OperatorProjectIconTheme {
    if (!OperatorProjectIconTheme.instance) {
      OperatorProjectIconTheme.instance = new OperatorProjectIconTheme(context);
    }
    return OperatorProjectIconTheme.instance;
  }

  /**
   * FileDecorationProvider 实现 - 提供文件装饰（颜色）
   */
  provideFileDecoration(uri: vscode.Uri): vscode.ProviderResult<vscode.FileDecoration> {
    const folderPath = uri.fsPath;

    // 检查是否为文件夹
    try {
      const stats = fs.statSync(folderPath);
      if (!stats.isDirectory()) {
        return undefined;
      }
    } catch {
      return undefined;
    }

    // 从项目配置文件中查找所有项目
    const allProjects = this.getAllProjectsFromConfig();

    // 遍历所有项目，查找当前文件夹是否在某个项目的配置中
    for (const project of allProjects) {
      // 检查当前文件夹是否在项目的 ops_meet 中（算子工程集合）
      if (project.ops_meet && project.ops_meet.some(collection =>
          path.normalize(collection.path) === path.normalize(folderPath))) {
        // 算子工程集合 - 紫色
        return {
          tooltip: '算子工程集合',
          color: new vscode.ThemeColor('charts.purple'),
        };
      }

      // 检查当前文件夹是否在项目的 ops_list 或 experimental_ops_list 中（算子工程）
      const isOperatorProject =
        (project.ops_list && project.ops_list.some(op =>
          path.normalize(op.path) === path.normalize(folderPath))) ||
        (project.experimental_ops_list && project.experimental_ops_list.some(op =>
          path.normalize(op.path) === path.normalize(folderPath)));

      if (isOperatorProject) {
        // 单个算子工程 - 蓝色
        return {
          tooltip: '算子工程',
          color: new vscode.ThemeColor('charts.blue'),
        };
      }
    }

    // 如果没找到匹配的配置，返回 undefined
    return undefined;
  }

  /**
   * 从配置中获取所有项目
   */
  private getAllProjectsFromConfig(): any[] {
    try {
      return getAllProjects();
    } catch (error) {
      console.error('[OperatorProjectIconTheme] 获取所有项目失败:', error);
      return [];
    }
  }

  /**
   * FileDecorationProvider 事件
   */
  get onDidChangeFileDecorations(): vscode.Event<vscode.Uri | vscode.Uri[] | undefined> {
    if (!this.onDidChangeFileDecorationsEmitter) {
      this.onDidChangeFileDecorationsEmitter = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
    }
    return this.onDidChangeFileDecorationsEmitter.event;
  }

  /**
   * 触发装饰更新（公开方法供外部调用）
   */
  fireDecorationUpdate(uris?: vscode.Uri | vscode.Uri[]): void {
    if (this.onDidChangeFileDecorationsEmitter) {
      this.onDidChangeFileDecorationsEmitter.fire(uris);
    }
  }
}
