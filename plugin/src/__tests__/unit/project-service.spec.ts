/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import * as path from 'path';

jest.mock('i18next', () => ({ t: (key: string) => key }));

jest.mock('@plugin/core/project/project-manager', () => ({ ProjectManager: { getInstance: jest.fn() } }));

jest.mock('@plugin/domain/models/project-model', () => ({ updateShScript: jest.fn() }));

jest.mock('@plugin/domain/services/ops-prototype', () => ({ generateOpsPrototype: jest.fn() }));

jest.mock('@plugin/domain/services/op-generator-factory', () => ({ OpGeneratorFactory: { getGenerator: jest.fn() } }));

jest.mock('@plugin/domain/utils/project-utils', () => ({ ensureLaunchJsonExists: jest.fn() }));

jest.mock('@plugin/service/config-service', () => ({
  ConfigService: {
    writeOpDevtoolsDottedSettings: jest.fn()
      .mockResolvedValue(true),
    ensureOpDevtoolsSettingsSeeded: jest.fn()
      .mockResolvedValue(true),
  },
}));

jest.mock('@plugin/helpers/operator-project-workspace-config', () => ({
  getAscendEnvScriptWithWorkspaceOverride: jest.fn((script: string | null | undefined) => script || ''),
  getConfiguredEnvironmentScriptPath: jest.fn(),
  getEnvironmentScriptPathFromWorkspace: jest.fn(),
}));

import type {
  CreateOpsByPrototypeParams,
  CreateOpsParams,
  InitOpsParams,
} from '@shared/api-types';
import * as vscode from 'vscode';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { updateShScript } from '@plugin/domain/models/project-model';
import { generateOpsPrototype } from '@plugin/domain/services/ops-prototype';
import { OpGeneratorFactory } from '@plugin/domain/services/op-generator-factory';
import { ensureLaunchJsonExists } from '@plugin/domain/utils/project-utils';
import { ConfigService } from '@plugin/service/config-service';
import { projectService } from '@plugin/service/project-service';
import {
  getAscendEnvScriptWithWorkspaceOverride,
  getConfiguredEnvironmentScriptPath,
  getEnvironmentScriptPathFromWorkspace,
} from '@plugin/helpers/operator-project-workspace-config';
import { appendLog } from '@plugin/helpers/output-channel';

const pmMock = {
  projectPath: undefined as string | undefined,
  setProjectContext: jest.fn(),
  checkVscode: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  pmMock.projectPath = undefined;
  (ProjectManager.getInstance as jest.Mock).mockReturnValue(pmMock);
  (globalThis as unknown as { extensionContext: unknown }).extensionContext = { extensionPath: '/ext' };
});

afterEach(() => {
  (vscode.workspace as unknown as { workspaceFolders: unknown }).workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
});

describe('ProjectService.init', () => {
  it('returns early without a project path', async () => {
    await projectService.init({} as InitOpsParams);

    expect(pmMock.setProjectContext).not.toHaveBeenCalled();
    expect(updateShScript).not.toHaveBeenCalled();
    expect(ConfigService.writeOpDevtoolsDottedSettings).not.toHaveBeenCalled();
  });

  it('joins projectPath and projectName and stores the context', async () => {
    await projectService.init({
      projectPath: '/repo',
      projectName: 'ops',
    });

    expect(pmMock.setProjectContext)
      .toHaveBeenCalledWith(path.join('/repo', 'ops'), 'ops');
  });

  it('falls back to the project path alone when no name is given', async () => {
    await projectService.init({ projectPath: '/repo' } as InitOpsParams);

    expect(pmMock.setProjectContext)
      .toHaveBeenCalledWith('/repo', undefined);
  });

  it('falls back to the project manager path', async () => {
    pmMock.projectPath = '/ctx';

    await projectService.init({ projectName: 'ops' } as InitOpsParams);

    expect(pmMock.setProjectContext)
      .toHaveBeenCalledWith('/ctx', 'ops');
  });

  it('persists the environment script and the project type', async () => {
    await projectService.init({
      projectPath: '/repo',
      projectName: 'ops',
      ascendEnvScript: '/env.sh',
      projectType: 'pyasc',
    });

    expect(updateShScript)
      .toHaveBeenCalledWith({
        project_name: 'ops',
        project_path: path.join('/repo', 'ops'),
        ascend_env_script: '/env.sh',
      });
    expect(ConfigService.writeOpDevtoolsDottedSettings)
      .toHaveBeenCalledWith({ projectType: 'pyasc' }, path.join('/repo', 'ops'));
  });

  it('derives the script record name from the project path basename', async () => {
    await projectService.init({
      projectPath: '/repo',
      ascendEnvScript: '/env.sh',
    });

    expect(updateShScript)
      .toHaveBeenCalledWith({
        project_name: 'repo',
        project_path: '/repo',
        ascend_env_script: '/env.sh',
      });
  });
});

describe('ProjectService.createOps', () => {
  it('returns an empty string when no project path is available', async () => {
    (vscode.workspace as unknown as { workspaceFolders: unknown }).workspaceFolders = undefined;

    await expect(projectService.createOps({} as CreateOpsParams))
      .resolves.toBe('');
    expect(generateOpsPrototype).not.toHaveBeenCalled();
  });

  it('generates the prototype and reports success', async () => {
    pmMock.projectPath = '/ctx';
    (generateOpsPrototype as jest.Mock).mockResolvedValue('/out/prototype');

    const result = await projectService.createOps({
      projectPath: '/repo/ops',
      projectName: 'add',
      prototypeName: 'my_proto',
      outputPath: '/out',
    });

    expect(result)
      .toBe('/out/prototype');
    expect(generateOpsPrototype)
      .toHaveBeenCalledWith(
        '/repo/ops',
        'add',
        'my_proto',
        '/ext',
        '/out',
      );
    expect(vscode.window.showInformationMessage)
      .toHaveBeenCalledWith('project.createPrototypeSuccess');
    expect(pmMock.checkVscode)
      .toHaveBeenCalled();
  });

  it('defaults the op name to the project basename', async () => {
    (generateOpsPrototype as jest.Mock).mockResolvedValue('/out/prototype');

    await projectService.createOps({ projectPath: '/repo/ops' });

    expect(generateOpsPrototype)
      .toHaveBeenCalledWith(
        '/repo/ops',
        'ops',
        undefined,
        '/ext',
        undefined,
      );
  });

  it('falls back to the workspace root when the manager has no path', async () => {
    (vscode.workspace as unknown as { workspaceFolders: unknown }).workspaceFolders = [{ uri: { fsPath: '/ws-root' } }];
    (generateOpsPrototype as jest.Mock).mockResolvedValue('/out/prototype');

    const result = await projectService.createOps({} as CreateOpsParams);

    expect(generateOpsPrototype)
      .toHaveBeenCalledWith(
        '/ws-root',
        'ws-root',
        undefined,
        '/ext',
        undefined,
      );
    expect(result)
      .toBe('/out/prototype');
  });

  it('reports failure and returns an empty string when generation throws', async () => {
    (generateOpsPrototype as jest.Mock).mockRejectedValue(new Error('no template'));

    await expect(projectService.createOps({ projectPath: '/repo/ops' }))
      .resolves.toBe('');
    expect(vscode.window.showErrorMessage)
      .toHaveBeenCalledWith('project.createPrototypeFailed');
  });
});

describe('ProjectService.createOpsByPrototype', () => {
  const generatorMock = {
    parseMeta: jest.fn(),
    executeGeneration: jest.fn(),
  };

  beforeEach(() => {
    pmMock.projectPath = '/repo/ops';
    generatorMock.parseMeta.mockReset();
    generatorMock.executeGeneration.mockReset();
    (OpGeneratorFactory.getGenerator as jest.Mock).mockReturnValue(generatorMock);
    (ensureLaunchJsonExists as jest.Mock).mockResolvedValue(undefined);
  });

  it('throws when no project path is available', async () => {
    pmMock.projectPath = undefined;

    await expect(projectService.createOpsByPrototype({ opsPrototypeFile: '/proto/ops.json' })).rejects.toThrow('project.invalidProjectId');
  });

  it('generates the operator from the prototype', async () => {
    await projectService.createOpsByPrototype({
      projectPath: '/repo/ops',
      opName: 'add',
      opType: 'ascend',
      opsPrototypeFile: '/proto/ops.json',
      templateName: 'template-a',
    });

    expect(OpGeneratorFactory.getGenerator)
      .toHaveBeenCalledWith(
        {
          op_type: 'ascend',
          ops_prototype_file: '/proto/ops.json',
          template_name: 'template-a',
          op_name: 'add',
          op_path: path.join('/repo/ops', 'add'),
        },
        {
          project_path: '/repo/ops',
          project_name: 'add',
        },
        '/ext',
      );
    expect(generatorMock.parseMeta)
      .toHaveBeenCalled();
    expect(generatorMock.executeGeneration)
      .toHaveBeenCalled();
    expect(ensureLaunchJsonExists)
      .toHaveBeenCalledWith(path.join('/repo/ops', 'add'));
    expect(ConfigService.ensureOpDevtoolsSettingsSeeded)
      .toHaveBeenCalledWith(
        '/repo/ops',
        '',
        'ascend',
        '/repo/ops',
        'template-a',
      );
    expect(vscode.window.showInformationMessage)
      .toHaveBeenCalledWith('project.createOpFileSuccess');
    expect(pmMock.checkVscode)
      .toHaveBeenCalled();
  });

  it('defaults op type to ascend and keeps the operator at the project root when names match', async () => {
    pmMock.projectPath = '/repo/add';

    await projectService.createOpsByPrototype({
      projectPath: '/repo/add',
      opName: 'add',
      opsPrototypeFile: '/proto/ops.json',
    });

    expect(OpGeneratorFactory.getGenerator)
      .toHaveBeenCalledWith(
        expect.objectContaining({
          op_type: 'ascend',
          op_name: 'add',
          op_path: '/repo/add',
        }),
        expect.anything(),
        expect.anything(),
      );
  });

  it('uses an explicit opPath override', async () => {
    await projectService.createOpsByPrototype({
      projectPath: '/repo/ops',
      opName: 'add',
      opPath: '/custom/path',
      opsPrototypeFile: '/proto/ops.json',
    });

    expect(OpGeneratorFactory.getGenerator)
      .toHaveBeenCalledWith(
        expect.objectContaining({ op_path: '/custom/path' }),
        expect.anything(),
        expect.anything(),
      );
  });

  it('skips file generation when requested', async () => {
    await projectService.createOpsByPrototype({
      projectPath: '/repo/ops',
      opName: 'add',
      skipFileGeneration: true,
      opsPrototypeFile: '/proto/ops.json',
    });

    expect(generatorMock.executeGeneration).not.toHaveBeenCalled();
    expect(generatorMock.parseMeta)
      .toHaveBeenCalled();
  });

  it('trims the op name before use', async () => {
    await projectService.createOpsByPrototype({
      projectPath: '/repo/ops',
      opName: '  add  ',
      opsPrototypeFile: '/proto/ops.json',
    });

    expect(OpGeneratorFactory.getGenerator)
      .toHaveBeenCalledWith(
        expect.objectContaining({
          op_name: 'add',
          op_path: path.join('/repo/ops', 'add'),
        }),
        expect.anything(),
        expect.anything(),
      );
  });

  it('derives the operator name from the project manager path', async () => {
    pmMock.projectPath = '/other/pm';

    await projectService.createOpsByPrototype({
      projectPath: '/repo/ops',
      opsPrototypeFile: '/proto/ops.json',
    });

    expect(OpGeneratorFactory.getGenerator)
      .toHaveBeenCalledWith(
        expect.objectContaining({
          op_name: 'pm',
          op_path: path.join('/repo/ops', 'pm'),
        }),
        expect.objectContaining({ project_name: 'pm' }),
        expect.anything(),
      );
  });

  it('reports and rethrows generation failures', async () => {
    generatorMock.parseMeta.mockImplementation(() => {
      throw new Error('template broken');
    });

    await expect(projectService.createOpsByPrototype({
      projectPath: '/repo/ops',
      opName: 'add',
      opsPrototypeFile: '/proto/ops.json',
    })).rejects.toThrow('template broken');

    expect(vscode.window.showErrorMessage)
      .toHaveBeenCalledWith('project.createOpFileFailed');
  });

  it('omits the op name when neither the params nor the manager provide one', async () => {
    pmMock.projectPath = undefined;

    await projectService.createOpsByPrototype({
      projectPath: '/repo/ops',
      opsPrototypeFile: '/proto/ops.json',
    });

    const generatorArgs = (OpGeneratorFactory.getGenerator as jest.Mock).mock.calls[0][0] as Record<string, unknown>;

    expect(generatorArgs)
      .toMatchObject({
        ops_prototype_file: '/proto/ops.json',
        op_path: '/repo/ops',
      });
    expect(generatorArgs)
      .not.toHaveProperty('op_name');
  });

  it('reports non-Error failures with an empty message', async () => {
    generatorMock.parseMeta.mockImplementation(() => {
      throw 'template broken';
    });

    await expect(projectService.createOpsByPrototype({
      projectPath: '/repo/ops',
      opName: 'add',
      opsPrototypeFile: '/proto/ops.json',
    })).rejects.toBe('template broken');

    expect(vscode.window.showErrorMessage)
      .toHaveBeenCalledWith('project.createOpFileFailed');
  });
});

describe('ProjectService.checkVscode and script helpers', () => {
  it('delegates checkVscode to the project manager', async () => {
    pmMock.checkVscode.mockResolvedValue(true);

    await expect(projectService.checkVscode()).resolves.toBe(true);
    expect(pmMock.checkVscode)
      .toHaveBeenCalled();
  });

  it('returns the workspace environment script with the override applied', async () => {
    (getEnvironmentScriptPathFromWorkspace as jest.Mock).mockReturnValue('/ws/env.sh');

    await expect(projectService.getProjectSH()).resolves.toBe('/ws/env.sh');
    expect(getAscendEnvScriptWithWorkspaceOverride)
      .toHaveBeenCalledWith('/ws/env.sh');
  });

  it('skips the script sync when the project manager has no path', async () => {
    pmMock.projectPath = undefined;

    await projectService.syncAscendEnvScriptFromWorkspaceSettings();

    expect(updateShScript).not.toHaveBeenCalled();
    expect(appendLog)
      .toHaveBeenCalledWith(
        'op-devtools/project-service',
        'syncAscendEnvScriptFromWorkspaceSettings:skip:noProjectPath',
      );
  });

  it('persists the configured environment script for the current project', async () => {
    pmMock.projectPath = '/repo/ops';
    (getConfiguredEnvironmentScriptPath as jest.Mock).mockReturnValue('/ws/env.sh');

    await projectService.syncAscendEnvScriptFromWorkspaceSettings();

    expect(updateShScript)
      .toHaveBeenCalledWith({
        project_name: 'ops',
        project_path: '/repo/ops',
        ascend_env_script: '/ws/env.sh',
      });
    expect(appendLog)
      .toHaveBeenCalledWith(
        'op-devtools/project-service',
        'syncAscendEnvScriptFromWorkspaceSettings:end',
      );
  });
});
