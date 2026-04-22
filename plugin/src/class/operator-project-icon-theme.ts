/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { t } from 'i18next';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getAllProjects } from '@plugin/domain/models/project-model';
import { OperatorProjectType } from '@plugin/domain/services/operator-project-detector';

/**
 * Operator project folder decoration provider
 * Refer to the implementation of D:\msttObj\various demo\icon-file
 * Only provides folder color decoration and does not manage icon themes
 */
export class OperatorProjectIconTheme implements vscode.FileDecorationProvider {
  private static instance: OperatorProjectIconTheme;
  private decorationProviderDisposable?: vscode.Disposable;
  private onDidChangeFileDecorationsEmitter?: vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>;

  private constructor(context: vscode.ExtensionContext) {
    // Register file decoration provider
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
   * FileDecorationProvider implementation - provides file decoration (color)
   */
  provideFileDecoration(uri: vscode.Uri): vscode.ProviderResult<vscode.FileDecoration> {
    const folderPath = uri.fsPath;

    // Check if it is a folder
    try {
      const stats = fs.statSync(folderPath);

      if (!stats.isDirectory()) {
        return undefined;
      }
    }
    catch {
      return undefined;
    }

    // Find all projects from project configuration file
    const allProjects = this.getAllProjectsFromConfig();

    // Traverse all projects to find whether the current folder is in the configuration of a project
    for (const project of allProjects) {
      // Check whether the current folder is in the ops_meet of the project (operator project collection)
      if (project.ops_meet && project.ops_meet.some((collection) =>
        path.normalize(collection.path) === path.normalize(folderPath))) {
        // Operator Engineering Collection - Purple
        return {
          tooltip: t('iconTheme.operatorProjectCollection'),
          color: new vscode.ThemeColor('charts.purple'),
        };
      }

      // Check whether the current folder is in the project's ops_list or experimental_ops_list (operator project)
      const isOperatorProject =
        (project.ops_list && project.ops_list.some((op) =>
          path.normalize(op.path) === path.normalize(folderPath)))
        || (project.experimental_ops_list && project.experimental_ops_list.some((op) =>
          path.normalize(op.path) === path.normalize(folderPath)));

      if (isOperatorProject) {
        // Single operator project - blue
        return {
          tooltip: t('iconTheme.operatorProject'),
          color: new vscode.ThemeColor('charts.blue'),
        };
      }
    }

    // If no matching configuration is found, undefined is returned.
    return undefined;
  }

  /**
   * Get all items from configuration
   */
  private getAllProjectsFromConfig(): any[] {
    try {
      return getAllProjects();
    }
    catch (error) {
      console.error('[OperatorProjectIconTheme] Failed to get all projects:', error);

      return [];
    }
  }

  /**
   * FileDecorationProvider event
   */
  get onDidChangeFileDecorations(): vscode.Event<vscode.Uri | vscode.Uri[] | undefined> {
    if (!this.onDidChangeFileDecorationsEmitter) {
      this.onDidChangeFileDecorationsEmitter = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
    }

    return this.onDidChangeFileDecorationsEmitter.event;
  }

  /**
   * Trigger decoration updates (expose methods for external calls)
   */
  fireDecorationUpdate(uris?: vscode.Uri | vscode.Uri[]): void {
    if (this.onDidChangeFileDecorationsEmitter) {
      this.onDidChangeFileDecorationsEmitter.fire(uris);
    }
  }
}
