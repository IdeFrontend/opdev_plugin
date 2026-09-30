/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
class MockRange {
  constructor(
    public startLine: number,
    public startCharacter: number,
    public endLine: number,
    public endCharacter: number,
  ) {}
}

class MockDiagnostic {
  public source: string | undefined;

  constructor(
    public range: MockRange,
    public message: string,
    public severity: number,
  ) {}
}

const mockCollection = {
  clear: jest.fn(),
  set: jest.fn(),
};

const vscodeMock = {
  workspace: {
    workspaceFolders: [] as Array<{ uri: { fsPath: string } }>,
    onDidChangeWorkspaceFolders: jest.fn(() => ({ dispose: () => undefined })),
  },
  languages: { createDiagnosticCollection: jest.fn(() => mockCollection) },
  DiagnosticSeverity: {
    Error: 0,
    Warning: 1,
  },
  Range: MockRange,
  Diagnostic: MockDiagnostic,
  Uri: {
    file: (fsPath: string) => ({
      fsPath,
      toString: () => `file:///${fsPath.replace(/\\/g, '/')}`,
    }),
    parse: (key: string) => ({ fsPath: key }),
  },
};

jest.mock('vscode', () => vscodeMock, { virtual: true });

jest.mock('@plugin/service/ms-agent-bridge.service', () => ({ msAgentBridgeService: { tryLoadLogWithIntegration: jest.fn() } }));

jest.mock('@shared/flavor', () => ({ sanitizerDiagnosticCollectionId: () => 'op-devtools-sanitizer' }));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { SanitizerDiagnosticsService } from '@plugin/service/sanitizer-diagnostics.service';
import { msAgentBridgeService } from '@plugin/service/ms-agent-bridge.service';

const tryLoadLogWithIntegration = msAgentBridgeService.tryLoadLogWithIntegration as jest.Mock;

const NPU_CHECK_LOG = [
  '========= WARNING: illegal read of size 4064',
  '=========     at 0x12c0c0036000 on GM in "op989467_custom(unsigned char*, unsigned',
  '=========     in block aiv(0) on device 0',
  '=========     code in pc current 0x3c30 (serialNo:2276)',
  '=========  Device Frame:',
  '=========     #0 /mnt/workspace/op989467/op989467.asc:84:9',
  '=========     #1 /mnt/workspace/op989467/op989467.asc:67:13',
].join('\n');

const MSSANITIZER_LOG = [
  '======ERROR: illegal read of size 224',
  '======    at 0x7f0000000000',
  '======    #3 illegal_read_and_write/add_custom.cpp:88:5',
].join('\n');

describe('sanitizer diagnostics npu-check dispatch', () => {
  let workspaceDir: string;
  let npuCheckLog: string;
  let mssanitizerLog: string;

  beforeAll(() => {
    workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'san-dispatch-'));
    vscodeMock.workspace.workspaceFolders = [{ uri: { fsPath: workspaceDir } }];

    // Resolvable by basename so publishFromLogFile can map the npu-check frame onto it.
    fs.writeFileSync(path.join(workspaceDir, 'op989467.asc'), 'asc');

    npuCheckLog = path.join(workspaceDir, 'npu-check_1.log');
    fs.writeFileSync(npuCheckLog, NPU_CHECK_LOG);

    mssanitizerLog = path.join(workspaceDir, 'mssanitizer_1.log');
    fs.writeFileSync(mssanitizerLog, MSSANITIZER_LOG);
  });

  afterAll(() => {
    fs.rmSync(workspaceDir, {
      recursive: true,
      force: true,
    });
  });

  beforeEach(() => {
    tryLoadLogWithIntegration.mockClear();
    mockCollection.clear.mockClear();
    mockCollection.set.mockClear();
  });

  it('routes an npu-check report to NpuCheckParser and skips msAgent', () => {
    const service = new SanitizerDiagnosticsService();
    const panel = service.loadSanitizerPanelData({ path: npuCheckLog });

    expect(panel.data.length)
      .toBeGreaterThan(0);

    for (const row of panel.data) {
      expect(row.sourceTool)
        .toBe('npu-check');
      expect(row.msAgentIndex)
        .toBeUndefined();
    }

    expect(tryLoadLogWithIntegration)
      .not
      .toHaveBeenCalled();
  });

  it('routes a plain mssanitizer report to ExceptionParser and forwards it to msAgent', () => {
    const service = new SanitizerDiagnosticsService();
    const panel = service.loadSanitizerPanelData({ path: mssanitizerLog });

    expect(panel.data.length)
      .toBeGreaterThan(0);
    expect(panel.data[0].sourceTool)
      .toBeUndefined();
    expect(typeof panel.data[0].msAgentIndex)
      .toBe('number');
    expect(panel.data[0].msAgentIndex)
      .toBe(0);

    expect(tryLoadLogWithIntegration)
      .toHaveBeenCalledTimes(1);
    expect(tryLoadLogWithIntegration)
      .toHaveBeenCalledWith(mssanitizerLog);
  });

  it('publishes npu-check findings through the npu-check parser after activate', () => {
    const service = new SanitizerDiagnosticsService();

    service.activate({ subscriptions: [] } as unknown as Parameters<SanitizerDiagnosticsService['activate']>[0]);
    service.publishFromLogFile(npuCheckLog, workspaceDir);

    expect(mockCollection.set)
      .toHaveBeenCalledTimes(1);

    const [
      uri,
      diagnostics,
    ] = mockCollection.set.mock.calls[0];

    expect(uri.fsPath)
      .toContain('op989467.asc');
    expect(diagnostics)
      .toHaveLength(1);

    const diagnostic = diagnostics[0] as MockDiagnostic;

    expect(diagnostic.message)
      .toBe('illegal read of size 4064');
    expect(diagnostic.range.startLine)
      .toBe(83);
    expect(diagnostic.severity)
      .toBe(1);
  });
});
