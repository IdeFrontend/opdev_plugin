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
import * as path from 'path';

import * as vscode from 'vscode';

/**
 * The api-routes chain loads `controller/performance-controller` at import time,
 * which builds `vscode.languages.createDiagnosticCollection(...)` at module scope
 * (used by the surviving `jumpToFile` method). The shared vscode mock
 * (`__mocks__/vscode.ts`) has no `languages`, so extend the mock object before
 * the lazy `require` below pulls the api-routes chain in.
 */
(vscode as { languages?: unknown }).languages = {
  createDiagnosticCollection: jest.fn(() => ({
    set: jest.fn(),
    delete: jest.fn(),
    clear: jest.fn(),
    dispose: jest.fn(),
  })),
};

// Lazy require: must run after the vscode mock is extended above.

// eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy load after the vscode mock extension (see comment above)
const { apis } = require('@plugin/api-routes') as typeof import('@plugin/api-routes');

/**
 * The complete RPC surface after the dump-tensor native-tree port, plus the A5
 * new-tool (npu-compute / npu-emulate) data-collection endpoints:
 * 36 endpoints total (webview 7 + common 10 + ops 19). The dump-tensor webview
 * RPCs (webview/getDumpTensorData, webview/openFile, ops/importDumpTensorBinFile)
 * and the whole performance group are gone.
 */
const EXPECTED_SURFACE = [
  // webview (7)
  'webview/getHome',
  'webview/getWorkspace',
  'webview/getProjectType',
  'webview/remotePathSearch',
  'webview/createdProject',
  'webview/selectFolder',
  'webview/selectFile',
  // common (10)
  'common/pathExists',
  'common/openExternalLink',
  'common/executeVscodeCommand',
  'common/getSanitizerShowQuickOptions',
  'common/setSanitizerShowQuickOptions',
  'common/getSimulationShowQuickOptions',
  'common/setSimulationShowQuickOptions',
  'common/getOnBoardAnalysisShowQuickOptions',
  'common/setOnBoardAnalysisShowQuickOptions',
  'common/getProjectTypeSupportEnabled',
  // ops (19)
  'ops/getOnBoardOptions',
  'ops/saveOnBoardOptions',
  'ops/getSimulateOptions',
  'ops/saveSimulateOptions',
  'ops/getSanitizerOptions',
  'ops/saveSanitizerOptions',
  'ops/startSimulate',
  'ops/startOnBoard',
  'ops/getProjectEnv',
  'ops/getNpuHardwareAvailable',
  'ops/getOnBoardExecutionAvailable',
  'ops/getSimulatorSupportedMetrics',
  'ops/runSanitizer',
  'ops/getSelectedOperators',
  'ops/loadStTestOptions',
  'ops/runStTestOptions',
  // A5 new-tool (npu-compute / npu-emulate) data-collection dialog.
  'ops/getDataCollectionConfig',
  'ops/saveDataCollectionConfig',
  'ops/startNewToolCollection',
];

/**
 * Registrations that must be absent (13 dead endpoints + 4 performance-only
 * registrations + 3 dump-tensor webview RPCs).
 */
const REMOVED_SURFACE = [
  'view/openCsvFile',
  'view/openInsight',
  'webview/validatePyascForAnalysis',
  'webview/openProject',
  'webview/downloadData',
  'webview/deleteNode',
  'webview/jumpToFile',
  'webview/getDumpTensorData',
  'webview/openFile',
  'common/saveFileToLocal',
  'common/getFlavorFeatures',
  'ops/getConfigData',
  'ops/saveConfig',
  'ops/getSanitizerConfigs',
  'ops/saveSanitizerForm',
  'ops/importDumpTensorBinFile',
  'performance/getRunData',
  'performance/toggleRecordMark',
  'performance/copyReport',
  'performance/downloadReport',
];

describe('api-routes RPC surface', () => {
  it('exposes exactly 36 endpoints (webview 7 / common 10 / ops 19)', () => {
    const flat = Object.entries(apis)
      .flatMap(([
        group,
        methods,
      ]) =>
        Object.keys(methods)
          .map((name) => `${group}/${name}`));

    expect([...flat].sort())
      .toEqual([...EXPECTED_SURFACE].sort());
    expect(flat)
      .toHaveLength(36);
  });

  it('no longer registers any of the 20 removed endpoints', () => {
    const flat = new Set(Object.entries(apis)
      .flatMap(([
        group,
        methods,
      ]) =>
        Object.keys(methods)
          .map((name) => `${group}/${name}`)));

    for (const removed of REMOVED_SURFACE) {
      expect(flat.has(removed))
        .toBe(false);
    }
  });

  it('drops the whole `view` group (view-controller) from the surface', () => {
    expect('view' in apis)
      .toBe(false);
  });

  it('drops the whole `performance` group (performance-data-controller) from the surface', () => {
    // `performance/diffFiles` was the group's only registration; the native dump
    // tensor tree calls dump-tensor-controller's diffFiles directly.
    expect('performance' in apis)
      .toBe(false);
  });

  it('web getProjectEnv type no longer declares ascendEnvScript (payload trim)', () => {
    // script-controller.ts returned `{ ascendEnvScript, socVersion }`; the
    // payload is trimmed to `socVersion` only (options-on-board/app.vue
    // consumes just socVersion). The frontend type must not re-declare the
    // dropped payload field.
    const opsPath = path.join(__dirname, '..', '..', '..', '..', 'web', 'src', 'apis', 'ops.ts');

    expect(fs.readFileSync(opsPath, 'utf8'))
      .not.toMatch(/ascendEnvScript/);
  });
});
