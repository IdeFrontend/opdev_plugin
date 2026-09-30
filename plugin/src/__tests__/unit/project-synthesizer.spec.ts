/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import {
  createProject,
  getProjectByPath,
  normalizeProjectPath,
  projectPathsEqual,
  updateShScript,
} from '@plugin/domain/models/project-model';
import { resolveOpRecord } from '@plugin/domain/models/op-record';
import {
  getDevtoolConfigPath,
  getIdeSettingsFilePath,
} from '@plugin/helpers/ide-config-dir';
import {
  CACHE_SCHEMA_VERSION, getCacheFilePath,
} from '@plugin/helpers/workspace-cache';

/**
 * Synthesis layer: ProjectRecord is derived from settings + cache + FS
 * markers — no registry rows.
 */

function mockVscodeConfiguration(projectType?: string, environmentScript?: string) {
  const inspect = jest.fn((key: string) => {
    if (key === 'projectType') {
      return projectType === undefined
        ? undefined
        : { workspaceValue: projectType };
    }

    if (key === 'environment.environmentScript') {
      return environmentScript === undefined
        ? undefined
        : { workspaceValue: environmentScript };
    }

    return undefined;
  });
  const get = jest.fn((_key: string, fallback?: unknown) => fallback);

  (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
    inspect,
    get,
    update: jest.fn(),
  });

  return {
    inspect,
    get,
  };
}

function seedCache(root: string, key: string, extra?: object) {
  const folderState = {
    opsMeet: [],
    opsList: [
      {
        name: 'add_custom',
        path: path.join(root, 'op', 'add_custom'),
      },
    ],
    experimentalOpsList: [
      {
        name: 'exp_op',
        path: path.join(root, 'op', 'exp_op'),
      },
    ],
    ...extra,
  };

  fs.mkdirSync(path.dirname(getCacheFilePath(root)), { recursive: true });
  fs.writeFileSync(
    getCacheFilePath(root),
    JSON.stringify({
      schemaVersion: CACHE_SCHEMA_VERSION,
      folders: { [key]: folderState },
    }),
    'utf8',
  );

  return folderState;
}

describe('project synthesizer', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'op-devtools-project-synth-'));
    mockVscodeConfiguration();
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  describe('getProjectByPath markers', () => {
    it('returns undefined when no marker is present (no settings type, cache or devtool_config)', () => {
      expect(getProjectByPath(tmpRoot))
        .toBeUndefined();
    });

    it('synthesizes a record with a null type when only the cache has a folders entry', () => {
      // The cache marker recognizes the path but never defaults to
      // 'standard-custom' — the structural re-detect finds no distinctive
      // structure in an empty temp dir, so the type is null (no reclassification).
      seedCache(tmpRoot, normalizeProjectPath(tmpRoot));

      const record = getProjectByPath(tmpRoot);

      expect(record)
        .toEqual({
          project_name: path.basename(tmpRoot),
          project_path: tmpRoot,
          project_type: null,
          // The synthesized record carries only an EXPLICIT workspace env
          // script — null otherwise (the record is null in the fresh case and
          // never defaults to /etc/profile itself).
          ascend_env_script: null,
          template_name: '',
        });
    });

    it('synthesizes a record when the workspace projectType setting is set', () => {
      mockVscodeConfiguration('ascend');

      const record = getProjectByPath(tmpRoot);

      expect(record).not
        .toBeUndefined();
      expect(record?.project_type)
        .toBe('ascend');
    });

    it('carries only an explicit environment script (null without the setting)', () => {
      mockVscodeConfiguration('ascend', '/opt/npu/setenv.sh');

      expect(getProjectByPath(tmpRoot)?.ascend_env_script)
        .toBe('/opt/npu/setenv.sh');

      // No explicit setting → null, never the /etc/profile default: the
      // fresh-case record is null and strategies then do not source anything.
      mockVscodeConfiguration('ascend');

      expect(getProjectByPath(tmpRoot)?.ascend_env_script)
        .toBeNull();
    });

    it('maps a torch-library type to the torch_library template', () => {
      mockVscodeConfiguration('torch-library');

      expect(getProjectByPath(tmpRoot)?.template_name)
        .toBe('torch_library_template');
    });

    it('synthesizes a record when devtool_config.json exists', () => {
      fs.mkdirSync(path.dirname(getDevtoolConfigPath(tmpRoot)), { recursive: true });
      fs.writeFileSync(getDevtoolConfigPath(tmpRoot), '{}', 'utf8');

      const record = getProjectByPath(tmpRoot);

      expect(record?.project_type)
        .toBeNull();
      expect(record?.project_name)
        .toBe(path.basename(tmpRoot));
    });

    it('prefers the settings project type over the cache-derived standard-custom type', () => {
      seedCache(tmpRoot, normalizeProjectPath(tmpRoot));
      mockVscodeConfiguration('pyasc');

      expect(getProjectByPath(tmpRoot)?.project_type)
        .toBe('pyasc');
    });

    it('matches cache folder keys case-insensitively', () => {
      seedCache(tmpRoot, normalizeProjectPath(tmpRoot)
        .toUpperCase());

      // Same as above: recognized via the cache marker, type stays null.
      expect(getProjectByPath(tmpRoot)?.project_type)
        .toBeNull();
    });

    it('normalizes paths case-insensitively for equality checks', () => {
      expect(projectPathsEqual(tmpRoot, tmpRoot.toUpperCase()))
        .toBe(true);
      expect(projectPathsEqual(`${tmpRoot}/`, tmpRoot))
        .toBe(true);
      expect(projectPathsEqual(tmpRoot, `${tmpRoot}other`))
        .toBe(false);
    });

    it('warns and returns undefined for an empty path', () => {
      const warn = jest.spyOn(console, 'warn')
        .mockImplementation(() => {});

      expect(getProjectByPath(''))
        .toBeUndefined();
      expect(warn)
        .toHaveBeenCalled();

      warn.mockRestore();
    });
  });

  describe('createProject', () => {
    it('writes the projectType dotted setting into the project settings.json', async () => {
      await createProject({
        project_name: 'ops-math',
        project_path: tmpRoot,
        project_type: 'ascend',
      });

      const settings = JSON.parse(fs.readFileSync(getIdeSettingsFilePath(tmpRoot), 'utf8')) as Record<string, unknown>;

      expect(settings['op-devtools.projectType'])
        .toBe('ascend');
    });

    it('does not write settings when project_type is absent', async () => {
      await createProject({
        project_name: 'ops-math',
        project_path: tmpRoot,
      });

      expect(fs.existsSync(getIdeSettingsFilePath(tmpRoot)))
        .toBe(false);
    });
  });

  describe('updateShScript', () => {
    it('writes the environmentScript dotted setting into the project settings.json', async () => {
      await updateShScript({
        project_name: 'ops-math',
        project_path: tmpRoot,
        ascend_env_script: '/opt/npu/setenv.sh',
      });

      const settings = JSON.parse(fs.readFileSync(getIdeSettingsFilePath(tmpRoot), 'utf8')) as Record<string, unknown>;

      expect(settings['op-devtools.environment.environmentScript'])
        .toBe('/opt/npu/setenv.sh');
    });

    it('does not touch settings when ascend_env_script is absent', async () => {
      await updateShScript({
        project_name: 'ops-math',
        project_path: tmpRoot,
      });

      expect(fs.existsSync(getIdeSettingsFilePath(tmpRoot)))
        .toBe(false);
    });

    it('clears the stored script when ascend_env_script is null', async () => {
      await updateShScript({
        project_name: 'ops-math',
        project_path: tmpRoot,
        ascend_env_script: '/opt/npu/setenv.sh',
      });

      await updateShScript({
        project_name: 'ops-math',
        project_path: tmpRoot,
        ascend_env_script: null,
      });

      const settings = JSON.parse(fs.readFileSync(getIdeSettingsFilePath(tmpRoot), 'utf8')) as Record<string, unknown>;

      expect(settings['op-devtools.environment.environmentScript'])
        .toBeUndefined();
    });
  });

  describe('resolveOpRecord', () => {
    it('resolves a scanned operator from opsList', () => {
      const folder = seedCache(tmpRoot, normalizeProjectPath(tmpRoot));

      expect(resolveOpRecord(tmpRoot, 'add_custom'))
        .toEqual({
          op_name: 'add_custom',
          op_type: 'ascend',
          op_path: folder.opsList[0].path,
        });
    });

    it('resolves a scanned operator from experimentalOpsList', () => {
      const folder = seedCache(tmpRoot, normalizeProjectPath(tmpRoot));

      expect(resolveOpRecord(tmpRoot, 'exp_op')?.op_path)
        .toBe(folder.experimentalOpsList[0].path);
    });

    it('falls back to the root operator when the name is not a scanned child', () => {
      seedCache(tmpRoot, normalizeProjectPath(tmpRoot));

      expect(resolveOpRecord(tmpRoot, 'unknown_op'))
        .toEqual({
          op_name: path.basename(tmpRoot),
          op_type: 'ascend',
          op_path: tmpRoot,
        });
    });

    it('uses the project type for op_type synthesis', () => {
      seedCache(tmpRoot, normalizeProjectPath(tmpRoot));
      mockVscodeConfiguration('triton');

      expect(resolveOpRecord(tmpRoot, 'add_custom')?.op_type)
        .toBe('triton');
    });

    it('returns undefined for a path without project markers', () => {
      expect(resolveOpRecord(tmpRoot, 'add_custom'))
        .toBeUndefined();
    });
  });
});
