/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getProjectByPath } from '@plugin/domain/models/project-model';
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
  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
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

    // 获取项目信息
    // 注意：getProjectByPath 内部会进行路径规范化（normalize + replace + toLowerCase）
    // 所以这里直接传入原始路径即可
    const project = getProjectByPath(folderPath);
    
    if (!project) {
      // 调试日志：记录未找到项目的路径
      console.log(`[OperatorProjectIconTheme] 未找到项目: ${folderPath}`);
      return undefined;
    }

    // 调试日志：记录找到的项目
    console.log(`[OperatorProjectIconTheme] 找到项目: ${project.project_name} (${project.project_path}), 类型: ${project.project_type}`);

    // 根据项目类型返回不同的装饰
    if (project.project_type === OperatorProjectType.MULTI_PROJECT) {
      // 算子工程合集 - 紫色
      return {
        tooltip: '算子工程集合',
        color: new vscode.ThemeColor('charts.purple'),
      };
    } else if (project.project_type) {
      // 单个算子工程 - 蓝色
      return {
        tooltip: '算子工程',
        color: new vscode.ThemeColor('charts.blue'),
      };
    }

    return undefined;
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
