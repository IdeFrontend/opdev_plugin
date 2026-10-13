/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { t } from 'i18next';
import * as vscode from 'vscode';
import * as path from 'path';

import { ProjectManager } from '@plugin/core/project/project-manager';
import {
  InitOpsParams,
  CreateOpsParams,
  CreateOpsByPrototypeParams,
} from '@shared/api-types';
import { updateShScript } from '@plugin/domain/models/project-model';
import { generateOpsPrototype } from '@plugin/domain/services/ops-prototype';
import { OpGeneratorFactory } from '@plugin/domain/services/op-generator-factory';
import { ensureLaunchJsonExists } from '@plugin/domain/utils/project-utils';
import { ConfigService } from '@plugin/service/config-service';
import {
  getAscendEnvScriptWithWorkspaceOverride,
  getConfiguredEnvironmentScriptPath,
  getEnvironmentScriptPathFromWorkspace,
} from '@plugin/helpers/operator-project-workspace-config';
import { appendLog } from '@plugin/helpers/output-channel';

export class ProjectService {
  /**
   * Get ExtensionContext
   */
  private getContext(): vscode.ExtensionContext {
    return (globalThis as unknown as { extensionContext: vscode.ExtensionContext })
      .extensionContext;
  }

  /**
   * Initialize the operator project context — path-keyed: caches the project
   * in ProjectManager and persists the environment script and the canonical
   * project type into the workspace settings.
   */
  async init(params: InitOpsParams): Promise<void> {
    const pm = ProjectManager.getInstance();
    const projectPath = params.projectPath && params.projectName
      ? path.join(params.projectPath, params.projectName)
      : (params.projectPath || pm.projectPath);

    if (!projectPath) {
      return;
    }

    pm.setProjectContext(projectPath, params.projectName);

    if (params.ascendEnvScript) {
      await updateShScript({
        project_name: params.projectName ?? path.basename(projectPath),
        project_path: projectPath,
        ascend_env_script: params.ascendEnvScript,
      });
    }

    if (params.projectType) {
      await ConfigService.writeOpDevtoolsDottedSettings(
        { projectType: params.projectType },
        projectPath,
      );
    }
  }

  /**
   * Create operator prototype file
   */
  async createOps(params: CreateOpsParams): Promise<string> {
    const pm = ProjectManager.getInstance();
    // Path-keyed: the target is the explicit project path, else
    // the current ProjectManager context, else the workspace root — no
    // registry/record gate, the prototype write itself validates the directory.
    const projectPath = params.projectPath || pm.projectPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (!projectPath) {
      return '';
    }

    const op_name = params.projectName || path.basename(projectPath);
    const prototype_name = params.prototypeName || undefined;

    console.log('Create operator prototype params', op_name, projectPath, prototype_name);

    try {
      const context = this.getContext();
      const result = await generateOpsPrototype(
        projectPath,
        op_name,
        prototype_name,
        context.extensionPath,
        params.outputPath,
      );

      vscode.window.showInformationMessage(t('project.createPrototypeSuccess'));

      // Check and set .vscode directory permissions
      await pm.checkVscode();

      return result;
    }
    catch {
      vscode.window.showErrorMessage(t('project.createPrototypeFailed'));

      return '';
    }
  }

  /**
   * Generate operator project from prototype
   */
  async createOpsByPrototype(params: CreateOpsByPrototypeParams): Promise<void> {
    const pm = ProjectManager.getInstance();
    const context = this.getContext();
    const projectPath = params.projectPath || pm.projectPath;

    console.log('createOpsByPrototype: Starting, params:', params);
    console.log('createOpsByPrototype: projectPath:', projectPath);

    if (!projectPath) {
      throw new Error(t('project.invalidProjectId'));
    }

    try {
      const resolvedOpName =
        params.opName?.trim()
        || (pm.projectPath ? path.basename(pm.projectPath) : '')
        || undefined;

      // The operator output defaults to <projectPath>/<opName> for a
      // sub-operator, or to the project path itself when the operator IS the
      // project (opName === basename(projectPath)) — never the current
      // window's workspace root of another project. An explicit opPath
      // override wins.
      const opPath = params.opPath
        ?? (resolvedOpName && path.basename(projectPath) !== resolvedOpName
          ? path.join(projectPath, resolvedOpName)
          : projectPath);

      console.log('createOpsByPrototype: Calling OpGeneratorFactory...');
      const generator = OpGeneratorFactory.getGenerator(
        {
          op_type: params.opType || 'ascend',
          ops_prototype_file: params.opsPrototypeFile,
          template_name: params.templateName,
          ...(resolvedOpName ? { op_name: resolvedOpName } : {}),
          op_path: opPath,
        },
        {
          project_path: projectPath,
          project_name: resolvedOpName,
        },
        context.extensionPath,
      );

      // parseMeta resolves the template/op name fallbacks (required before
      // generation — the Cann generator renames template files on it).
      generator.parseMeta();

      // Structure generation (files from the template zip). Mirrors the
      // isSkipUnZip semantics: skipped when the caller already scaffolded the
      // operator (e.g. genop) and only the configs are wanted.
      if (params.skipFileGeneration !== true) {
        generator.executeGeneration();
      }

      await ensureLaunchJsonExists(opPath);
      // Seed default settings from the PROJECT (collection root) — the
      // root-keyed model: a standard-custom collection has one config set
      // against the root build.sh, and a new sub-operator is selected only via
      // the --ops={operatorNames} placeholder, so per-operator seed paths
      // never land in the workspace settings.
      await ConfigService.ensureOpDevtoolsSettingsSeeded(
        projectPath,
        '',
        params.opType || 'ascend',
        projectPath,
        params.templateName,
      );

      console.log(
        'createOpsByPrototype: Operator project generated',
        {
          ops_prototype_file: params.opsPrototypeFile,
          projectPath,
          opPath,
          op_type: params.opType,
        },
      );

      vscode.window.showInformationMessage(t('project.createOpFileSuccess'));
      await pm.checkVscode();
    }
    catch (e) {
      console.error('createOpsByPrototype: Failed to create operator', e);
      vscode.window.showErrorMessage(t('project.createOpFileFailed', { error: e instanceof Error ? e.message : '' }));
      throw e; // Re-throw so caller knows it failed
    }
  }

  /**
   * Check .vscode directory
   */
  async checkVscode(): Promise<boolean> {
    return ProjectManager.getInstance()
      .checkVscode();
  }

  /**
   * Get project script — settings-only: the environment script lives in the
   * workspace `environment.environmentScript` key; the workspace override
   * applies on top of it.
   */
  async getProjectSH(): Promise<string> {
    return getAscendEnvScriptWithWorkspaceOverride(getEnvironmentScriptPathFromWorkspace());
  }

  /**
   * Mirror the explicit environment script into the workspace settings
   * for the current project. Call when `op-devtools.environment.*` changes.
   */
  async syncAscendEnvScriptFromWorkspaceSettings(): Promise<void> {
    appendLog(
      'op-devtools/project-service',
      'syncAscendEnvScriptFromWorkspaceSettings:start',
    );
    const projectPath = ProjectManager.getInstance().projectPath;

    if (!projectPath) {
      appendLog(
        'op-devtools/project-service',
        'syncAscendEnvScriptFromWorkspaceSettings:skip:noProjectPath',
      );

      return;
    }

    // Explicit value only: an unset script must NOT materialize the
    // '/etc/profile' schema default as a user setting — only the explicit
    // value is ever written to settings.json.
    const scriptPath = getConfiguredEnvironmentScriptPath();

    appendLog('op-devtools/project-service', 'syncAscendEnvScriptFromWorkspaceSettings:values', {
      projectPath,
      scriptPath,
    });
    await updateShScript({
      project_name: path.basename(projectPath),
      project_path: projectPath,
      ascend_env_script: scriptPath,
    });
    appendLog(
      'op-devtools/project-service',
      'syncAscendEnvScriptFromWorkspaceSettings:end',
    );
  }
}

export const projectService = new ProjectService();
