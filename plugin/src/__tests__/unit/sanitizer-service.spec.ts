/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
jest.mock('i18next', () => ({
  t: jest.fn((key: string, params?: { error?: string;
    output?: string;
    reason?: string }) => {
    if (params?.error !== undefined) {
      return `${key}: ${params.error}`;
    }

    if (params?.output !== undefined) {
      return `${key}: ${params.output}`;
    }

    if (params?.reason !== undefined) {
      return `${key}: ${params.reason}`;
    }

    return key;
  }),
}));

jest.mock('@plugin/core/project/project-manager', () => ({ ProjectManager: { getInstance: jest.fn(() => ({ projectPath: '/c/root' })) } }));

jest.mock('@plugin/domain/models/project-model', () => ({ getProjectByPath: jest.fn() }));

jest.mock('@plugin/domain/plugins/operator-plugin.registry', () => ({ OperatorPluginRegistry: { getOpPlugin: jest.fn() } }));

jest.mock('@plugin/service/operator-command-executor', () => ({
  buildOperatorSpawnContext: jest.fn(() => ({})),
  commandFailureMessage: jest.fn((_result: unknown, label: string) => `fail:${label}`),
  executeOperatorCommand: jest.fn(),
}));

jest.mock('@plugin/service/build-service', () => ({
  notifyBuildSucceededForSidebar: jest.fn()
    .mockResolvedValue(undefined),
}));

jest.mock('@plugin/helpers/sanitizer-run-outcome', () => ({ evaluateSanitizerRunOutcome: jest.fn() }));

jest.mock('@plugin/helpers/cleanup-sanitizer-cwd-log', () => ({ cleanupCwdSanitizerLog: jest.fn() }));

jest.mock('@plugin/helpers/sanitizer-log-path', () => ({ getLatestSanitizerLogAbsPath: jest.fn() }));

jest.mock('@plugin/helpers/sync-sanitizer-python-target', () => ({ syncSanitizerPythonTargetFromActiveEditor: jest.fn() }));

jest.mock('@plugin/domain/services/command-strategy/triton-strategy', () => {
  const actual = jest.requireActual('@plugin/domain/services/command-strategy/triton-strategy') as Record<string, unknown>;

  return {
    ...actual,
    probeTritonPythonDependencies: jest.fn(),
  };
});

jest.mock('@plugin/service/ms-agent-bridge.service', () => ({ msAgentBridgeService: { tryLoadLogWithIntegration: jest.fn() } }));

jest.mock('@plugin/service/sanitizer-diagnostics.service', () => ({ sanitizerDiagnosticsService: { publishFromLogFile: jest.fn() } }));

// ConfigService stays real (resolveSanitizerBaseContext calls getSanitizerConfig);
// hasBuildExampleConfig is spied per test below.

jest.mock('@plugin/domain', () => {
  const actual = jest.requireActual('@plugin/domain') as Record<string, unknown>;

  return {
    ...actual,
    // The real builders throw "cann.configMissingScript" for an unseeded
    // project; the run flow under test only needs the command strings.
    getBuildOpCommand: jest.fn(() => 'build.sh'),
    getBuildExampleCommand: jest.fn(() => 'build_example.sh'),
    getSanitizerCommand: jest.fn(() => 'mssanitizer --log-file mssanitizer.log'),
  };
});

jest.mock('@plugin/domain/services/operator-project-detector', () => ({
  OperatorProjectType: { STANDARD_CUSTOM: 'standard-custom' },
  OperatorProjectDetector: { detectOperatorProject: jest.fn() },
}));

jest.mock('@plugin/domain/models/op-record', () => ({ resolveOpRecord: jest.fn() }));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import { sanitizerService } from '@plugin/service/sanitizer-service';
import { getBuildOpCommand } from '@plugin/domain';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { getProjectByPath } from '@plugin/domain/models/project-model';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import { executeOperatorCommand } from '@plugin/service/operator-command-executor';
import { notifyBuildSucceededForSidebar } from '@plugin/service/build-service';
import { evaluateSanitizerRunOutcome } from '@plugin/helpers/sanitizer-run-outcome';
import { cleanupCwdSanitizerLog } from '@plugin/helpers/cleanup-sanitizer-cwd-log';
import { getLatestSanitizerLogAbsPath } from '@plugin/helpers/sanitizer-log-path';
import { syncSanitizerPythonTargetFromActiveEditor } from '@plugin/helpers/sync-sanitizer-python-target';
import { probeTritonPythonDependencies } from '@plugin/domain/services/command-strategy/triton-strategy';
import { msAgentBridgeService } from '@plugin/service/ms-agent-bridge.service';
import { sanitizerDiagnosticsService } from '@plugin/service/sanitizer-diagnostics.service';
import { ConfigService } from '@plugin/service/config-service';
import { OperatorProjectDetector } from '@plugin/domain/services/operator-project-detector';
import { resolveOpRecord } from '@plugin/domain/models/op-record';
import { COMMAND_FLASH_MS_SANITIZER_RUN_DATA } from '@plugin/constants';

const executeOperatorCommandMock = executeOperatorCommand as jest.Mock;
const getBuildOpCommandMock = getBuildOpCommand as jest.Mock;
const evaluateOutcome = evaluateSanitizerRunOutcome as jest.Mock;
const getLogPath = getLatestSanitizerLogAbsPath as jest.Mock;
const syncActive = syncSanitizerPythonTargetFromActiveEditor as jest.Mock;
const probeTriton = probeTritonPythonDependencies as jest.Mock;
const showErrorMessage = vscode.window.showErrorMessage as jest.Mock;
const showInformationMessage = vscode.window.showInformationMessage as jest.Mock;
const executeCommand = vscode.commands.executeCommand as jest.Mock;

function projectRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 0,
    project_name: 'cann_hello',
    project_path: '/c/root',
    project_type: 'cann',
    ...overrides,
  };
}

function plugin(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    opType: 'cann',
    buildBehavior: {},
    ...overrides,
  };
}

describe('SanitizerService.captureActiveFileTargetForOptionsPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns true when no project is registered', async () => {
    (ProjectManager.getInstance as jest.Mock).mockReturnValue({ projectPath: '/c/root' });
    (getProjectByPath as jest.Mock).mockReturnValue(null);

    await expect(sanitizerService.captureActiveFileTargetForOptionsPanel())
      .resolves
      .toBe(true);
    expect(OperatorPluginRegistry.getOpPlugin)
      .not
      .toHaveBeenCalled();
  });

  it('returns true when the project does not require an active file check', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(projectRow());
    (OperatorPluginRegistry.getOpPlugin as jest.Mock).mockReturnValue(plugin({ buildBehavior: { requiresActiveFileCheck: false } }));

    await expect(sanitizerService.captureActiveFileTargetForOptionsPanel())
      .resolves
      .toBe(true);
    expect(syncActive)
      .not
      .toHaveBeenCalled();
  });

  it('syncs the active file for projects that require it', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(projectRow({ project_type: 'pyasc' }));
    (OperatorPluginRegistry.getOpPlugin as jest.Mock).mockReturnValue(plugin({
      opType: 'pyasc',
      buildBehavior: {
        requiresActiveFileCheck: true,
        activeFileExtension: '.py',
      },
    }));
    syncActive.mockResolvedValue(true);

    await expect(sanitizerService.captureActiveFileTargetForOptionsPanel())
      .resolves
      .toBe(true);
    expect(syncActive)
      .toHaveBeenCalledWith('.py');
  });
});

describe('SanitizerService.runSanitizer', () => {
  let tmpRoot: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-san-'));
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: tmpRoot } }];
    (ProjectManager.getInstance as jest.Mock).mockReturnValue({ projectPath: tmpRoot });
    (getProjectByPath as jest.Mock).mockReturnValue(projectRow({ project_path: tmpRoot }));
    (OperatorPluginRegistry.getOpPlugin as jest.Mock).mockReturnValue(plugin());
    syncActive.mockResolvedValue(true);
    probeTriton.mockResolvedValue({ ok: true });
    executeOperatorCommandMock.mockResolvedValue({
      code: 0,
      output: 'ok',
    });
    (OperatorProjectDetector.detectOperatorProject as jest.Mock).mockResolvedValue({
      isOperatorProject: false,
      projectType: undefined,
    });
    evaluateOutcome.mockReturnValue({ ok: true });
    getLogPath.mockReturnValue(undefined);
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  it('reports the no-config error and returns when no project exists', async () => {
    (ProjectManager.getInstance as jest.Mock).mockReturnValue({ projectPath: undefined });
    (getProjectByPath as jest.Mock).mockReturnValue(null);

    await sanitizerService.runSanitizer();

    expect(showErrorMessage)
      .toHaveBeenCalledWith('sanitizer.detectionFailedError: No sanitizer config');
    expect(executeOperatorCommandMock)
      .not
      .toHaveBeenCalled();
  });

  it('reports the no-config error when the path has no project row', async () => {
    (getProjectByPath as jest.Mock).mockReturnValue(null);

    await sanitizerService.runSanitizer();

    expect(showErrorMessage)
      .toHaveBeenCalledWith('sanitizer.detectionFailedError: No sanitizer config');
  });

  it('returns without running when the active-file sync fails', async () => {
    (OperatorPluginRegistry.getOpPlugin as jest.Mock).mockReturnValue(plugin({
      opType: 'pyasc',
      buildBehavior: { requiresActiveFileCheck: true },
    }));
    syncActive.mockResolvedValue(false);

    await sanitizerService.runSanitizer();

    expect(executeOperatorCommandMock)
      .not
      .toHaveBeenCalled();
  });

  it('reports triton dependency failures', async () => {
    (OperatorPluginRegistry.getOpPlugin as jest.Mock).mockReturnValue(plugin({
      opType: 'triton',
      buildBehavior: {},
    }));
    probeTriton.mockResolvedValue({
      ok: false,
      interpreter: '/usr/bin/python3',
      stderr: 'no triton module',
    });

    await sanitizerService.runSanitizer();

    expect(showErrorMessage)
      .toHaveBeenCalledWith('sanitizer.tritonDepsFailed');
    expect(executeOperatorCommandMock)
      .not
      .toHaveBeenCalled();
  });

  it('reports the compile failure when the build fails', async () => {
    (OperatorPluginRegistry.getOpPlugin as jest.Mock).mockReturnValue(plugin({ buildBehavior: { requiresBuildBeforeAnalysis: true } }));
    executeOperatorCommandMock.mockResolvedValue({
      code: 1,
      output: 'build broke',
    });

    await sanitizerService.runSanitizer();

    expect(showErrorMessage)
      .toHaveBeenCalledWith('fail:sanitizer.compileFailed');
    expect(notifyBuildSucceededForSidebar)
      .not
      .toHaveBeenCalled();
  });

  it('compiles with -gline-tables-only when the sanitizer tool is npu-check', async () => {
    (OperatorPluginRegistry.getOpPlugin as jest.Mock).mockReturnValue(plugin({ buildBehavior: { requiresBuildBeforeAnalysis: true } }));
    jest.spyOn(ConfigService, 'getDefaultSanitizerToolType')
      .mockReturnValue('npu-check');

    await sanitizerService.runSanitizer();

    expect(getBuildOpCommandMock)
      .toHaveBeenCalledWith(expect.anything(), '-gline-tables-only', undefined);
  });

  it('compiles without -gline-tables-only when the sanitizer tool is mssanitizer', async () => {
    (OperatorPluginRegistry.getOpPlugin as jest.Mock).mockReturnValue(plugin({ buildBehavior: { requiresBuildBeforeAnalysis: true } }));
    jest.spyOn(ConfigService, 'getDefaultSanitizerToolType')
      .mockReturnValue('mssanitizer');

    await sanitizerService.runSanitizer();

    expect(getBuildOpCommandMock)
      .toHaveBeenCalledWith(expect.anything(), '', undefined);
  });

  it('returns silently when the build was interrupted by the user', async () => {
    (OperatorPluginRegistry.getOpPlugin as jest.Mock).mockReturnValue(plugin({ buildBehavior: { requiresBuildBeforeAnalysis: true } }));
    executeOperatorCommandMock.mockResolvedValue({
      code: 0,
      interruptedByUserStop: true,
    });

    await sanitizerService.runSanitizer();

    expect(showErrorMessage)
      .not
      .toHaveBeenCalled();
  });

  it('reports the example compile failure for a standard-custom root', async () => {
    const hasExampleSpy = jest.spyOn(ConfigService, 'hasBuildExampleConfig')
      .mockReturnValue(true);

    (OperatorPluginRegistry.getOpPlugin as jest.Mock).mockReturnValue(plugin({ buildBehavior: { requiresBuildBeforeAnalysis: true } }));
    (OperatorProjectDetector.detectOperatorProject as jest.Mock).mockResolvedValue({
      isOperatorProject: true,
      projectType: 'standard-custom',
    });
    executeOperatorCommandMock.mockResolvedValueOnce({
      code: 0,
      output: 'ok',
    })
      .mockResolvedValueOnce({
        code: 2,
        output: 'example broke',
      });

    await sanitizerService.runSanitizer();

    expect(showErrorMessage)
      .toHaveBeenCalledWith('fail:sanitizer.exampleCompileFailed');
    expect(notifyBuildSucceededForSidebar)
      .not
      .toHaveBeenCalled();
  });

  it('returns silently when the example build was interrupted', async () => {
    (OperatorPluginRegistry.getOpPlugin as jest.Mock).mockReturnValue(plugin({ buildBehavior: { requiresBuildBeforeAnalysis: true } }));
    (OperatorProjectDetector.detectOperatorProject as jest.Mock).mockResolvedValue({
      isOperatorProject: true,
      projectType: 'standard-custom',
    });
    jest.spyOn(ConfigService, 'hasBuildExampleConfig')
      .mockReturnValue(true);
    executeOperatorCommandMock.mockResolvedValueOnce({
      code: 0,
      output: 'ok',
    })
      .mockResolvedValueOnce({
        code: 0,
        interruptedByUserStop: true,
      });

    await sanitizerService.runSanitizer();

    expect(showErrorMessage)
      .not
      .toHaveBeenCalled();
  });

  it('continues with a warning when root detection throws', async () => {
    (OperatorPluginRegistry.getOpPlugin as jest.Mock).mockReturnValue(plugin({ buildBehavior: { requiresBuildBeforeAnalysis: true } }));
    (OperatorProjectDetector.detectOperatorProject as jest.Mock).mockRejectedValue(new Error('detector down'));
    const warnSpy = jest.spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    await sanitizerService.runSanitizer();

    expect(warnSpy)
      .toHaveBeenCalledWith('[runSanitizer] Failed to detect project type:', expect.any(Error));
    // The sanitizer run itself still happened.
    expect(executeOperatorCommandMock)
      .toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });

  it('creates the report dir and reports success, publishing the log and flashing the report', async () => {
    const logAbs = path.join(tmpRoot, '.vscode', 'mindstudio_sanitizer_log', 'mssanitizer_1.log');

    fs.mkdirSync(path.dirname(logAbs), { recursive: true });
    fs.writeFileSync(logAbs, 'no issues', 'utf8');
    getLogPath.mockReturnValue(logAbs);
    resolveOpRecord.mockReturnValue(undefined);

    await sanitizerService.runSanitizer();

    // The report directory was created under .vscode.
    expect(fs.existsSync(path.join(tmpRoot, '.vscode', 'mindstudio_sanitizer_log')))
      .toBe(true);
    expect(cleanupCwdSanitizerLog)
      .toHaveBeenCalledWith(tmpRoot);
    expect(showInformationMessage)
      .toHaveBeenCalledWith('sanitizer.detectionSuccess');
    expect(sanitizerDiagnosticsService.publishFromLogFile)
      .toHaveBeenCalledWith(logAbs, tmpRoot);
    expect(msAgentBridgeService.tryLoadLogWithIntegration)
      .toHaveBeenCalledWith(logAbs);
    expect(executeCommand)
      .toHaveBeenCalledWith(COMMAND_FLASH_MS_SANITIZER_RUN_DATA, { openLatest: true });
  });

  it('cleans the build-dir sanitizer log of every selected operator', async () => {
    getLogPath.mockReturnValue(undefined);
    resolveOpRecord.mockImplementation((_root: string, name: string) => ({ op_path: path.join(tmpRoot, name) }));

    await sanitizerService.runSanitizer({ operatorNames: 'add, mul ,' });

    expect(resolveOpRecord)
      .toHaveBeenCalledWith(tmpRoot, 'add');
    expect(resolveOpRecord)
      .toHaveBeenCalledWith(tmpRoot, 'mul');
    expect(cleanupCwdSanitizerLog)
      .toHaveBeenCalledWith(path.join(tmpRoot, 'add', 'build'));
    expect(cleanupCwdSanitizerLog)
      .toHaveBeenCalledWith(path.join(tmpRoot, 'mul', 'build'));
  });

  it('removes the empty log and reports detectionFailed when the outcome is not ok', async () => {
    const logAbs = path.join(tmpRoot, '.vscode', 'mindstudio_sanitizer_log', 'mssanitizer_2.log');

    fs.mkdirSync(path.dirname(logAbs), { recursive: true });
    fs.writeFileSync(logAbs, '', 'utf8');
    getLogPath.mockReturnValue(logAbs);
    evaluateOutcome.mockReturnValue({
      ok: false,
      reason: 'empty report',
    });

    await sanitizerService.runSanitizer();

    expect(fs.existsSync(logAbs))
      .toBe(false);
    expect(showErrorMessage)
      .toHaveBeenCalledWith('fail:sanitizer.detectionFailed');
    expect(showInformationMessage)
      .not
      .toHaveBeenCalled();
  });

  it('surfaces unexpected failures through the generic error message', async () => {
    executeOperatorCommandMock.mockRejectedValue(new Error('spawn ENOENT'));

    await sanitizerService.runSanitizer();

    expect(showErrorMessage)
      .toHaveBeenCalledWith('sanitizer.detectionFailedError: spawn ENOENT');
  });
});
