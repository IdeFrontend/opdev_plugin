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

jest.mock('@plugin/domain/services/operator-project-detector', () => ({
  OperatorProjectType: { STANDARD_CUSTOM: 'standard-custom' },
  OperatorProjectDetector: { detectOperatorProject: jest.fn() },
}));

type Row = {
  project_name?: string;
  project_path: string;
  project_type?: string;
  template_name?: string;
  ops_list?: unknown[];
  experimental_ops_list?: unknown[];
};

jest.mock('@plugin/domain/models/project-model', () => {
  const actual = jest.requireActual('@plugin/domain/models/project-model') as Record<string, unknown>;
  const rows: Row[] = [];

  return {
    ...actual,
    getProjectByPath: jest.fn((projectPath: string) => rows.find((row) => row.project_path === projectPath)),
    createProject: jest.fn(async (row: Row) => {
      rows.push(row);
    }),
    updateStandardCustomOperators: jest.fn(),
    appendStandardCustomOperator: jest.fn(),
    _resetProjectsForTest: () => {
      rows.length = 0;
    },
  };
});

jest.mock('@plugin/service/config-service', () => ({
  ConfigService: {
    writeOpDevtoolsDottedSettings: jest.fn()
      .mockResolvedValue(true),
  },
}));

import { OperatorProjectDetector } from '@plugin/domain/services/operator-project-detector';
import {
  _resetProjectsForTest,
  createProject,
} from '@plugin/domain/models/project-model';
import { WorkspaceDetectorService } from '@plugin/service/workspace-detector-service';
import { ConfigService } from '@plugin/service/config-service';

const workspacePath = '/repo/ops-math';
const normalizedWorkspacePath = path.normalize(workspacePath);

describe('WorkspaceDetectorService projectType setting writer', () => {
  const detection = {
    isOperatorProject: true,
    projectType: 'standard-custom',
    projectPath: workspacePath,
    projectName: 'ops-math',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    _resetProjectsForTest();
    (OperatorProjectDetector.detectOperatorProject as jest.Mock).mockResolvedValue(detection);
    jest.spyOn(WorkspaceDetectorService, 'scanOpsMeetAndOpsLists')
      .mockReturnValue({
        opsMeet: [],
        opsList: [],
        experimentalOpsList: [],
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('writes the ascend view type into the workspace setting when registering a new root', async () => {
    await WorkspaceDetectorService.detectAndRegisterWorkspace(workspacePath);

    expect(ConfigService.writeOpDevtoolsDottedSettings)
      .toHaveBeenCalledWith({ projectType: 'ascend' }, normalizedWorkspacePath);
  });

  it('writes the setting even when the root is already registered', async () => {
    await createProject({
      project_name: 'ops-math',
      project_path: normalizedWorkspacePath,
      project_type: 'ascend',
    });

    await WorkspaceDetectorService.detectAndRegisterWorkspace(workspacePath);

    expect(OperatorProjectDetector.detectOperatorProject)
      .not.toHaveBeenCalled();
    expect(ConfigService.writeOpDevtoolsDottedSettings)
      .toHaveBeenCalledWith({ projectType: 'ascend' }, normalizedWorkspacePath);
  });

  it('does not write the setting when the workspace is not a standard-custom project', async () => {
    (OperatorProjectDetector.detectOperatorProject as jest.Mock).mockResolvedValue({
      isOperatorProject: false,
      projectType: undefined,
    });

    await WorkspaceDetectorService.detectAndRegisterWorkspace(workspacePath);

    expect(ConfigService.writeOpDevtoolsDottedSettings)
      .not.toHaveBeenCalled();
  });
});
