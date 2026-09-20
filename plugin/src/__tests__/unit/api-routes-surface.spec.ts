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
 * The complete RPC surface after the settings-native refactor, plus the two A5
 * new-tool (npu-compute / npu-emulate) data-collection endpoints:
 * 40 endpoints total (webview 9 + common 10 + ops 20 + performance 1).
 */
const EXPECTED_SURFACE = [
  // webview (10)
  'webview/getHome',
  'webview/getWorkspace',
  'webview/getProjectType',
  'webview/openFile',
  'webview/remotePathSearch',
  'webview/createdProject',
  'webview/getDumpTensorData',
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
  'ops/importDumpTensorBinFile',
  'ops/getSelectedOperators',
  'ops/loadStTestOptions',
  'ops/runStTestOptions',
  // A5 new-tool (npu-compute / npu-emulate) data-collection dialog.
  'ops/getDataCollectionConfig',
  'ops/saveDataCollectionConfig',
  'ops/startNewToolCollection',
  // performance (1)
  'performance/diffFiles',
];

/** Registrations that must be absent (13 dead endpoints + 4 performance-only registrations). */
const REMOVED_SURFACE = [
  'view/openCsvFile',
  'view/openInsight',
  'webview/validatePyascForAnalysis',
  'webview/openProject',
  'webview/downloadData',
  'webview/deleteNode',
  'webview/jumpToFile',
  'common/saveFileToLocal',
  'common/getFlavorFeatures',
  'ops/getConfigData',
  'ops/saveConfig',
  'ops/getSanitizerConfigs',
  'ops/saveSanitizerForm',
  'performance/getRunData',
  'performance/toggleRecordMark',
  'performance/copyReport',
  'performance/downloadReport',
];

describe('api-routes RPC surface', () => {
  it('exposes exactly 40 endpoints (webview 9 / common 10 / ops 20 / performance 1)', () => {
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
      .toHaveLength(40);
  });

  it('no longer registers any of the 17 removed endpoints', () => {
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
