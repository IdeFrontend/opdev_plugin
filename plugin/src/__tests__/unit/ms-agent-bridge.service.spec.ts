/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
jest.mock('@plugin/service/settings-loader', () => ({
  SettingsLoader: {
    isMsAgentAiFixEnabled: jest.fn()
      .mockReturnValue(true),
  },
}));

jest.mock('vscode', () => ({
  extensions: { all: [] },
  commands: {
    executeCommand: jest.fn()
      .mockResolvedValue(undefined),
    getCommands: jest.fn()
      .mockResolvedValue([]),
  },
  Uri: { file: jest.fn((fsPath: string) => ({ fsPath })) },
}));

import * as vscode from 'vscode';
import { SettingsLoader } from '@plugin/service/settings-loader';
import {
  MsAgentBridgeService,
  msAgentBridgeService,
} from '@plugin/service/ms-agent-bridge.service';

const REQUIRED_COMMANDS = [
  'msagent.parseLog',
  'msagent.fixProblem',
];

function contribution(commands: string[]): { id: string;
  packageJSON: { contributes?: { commands?: Array<{ command?: string }> } } } {
  return {
    id: 'ext.' + commands.join('.'),
    packageJSON: { contributes: { commands: commands.map((command) => ({ command })) } },
  };
}

function contributionNoCommands(): { id: string;
  packageJSON: unknown } {
  return {
    id: 'ext.plain',
    packageJSON: {},
  };
}

describe('MsAgentBridgeService', () => {
  let service: MsAgentBridgeService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MsAgentBridgeService();
    (SettingsLoader.isMsAgentAiFixEnabled as jest.Mock).mockReturnValue(true);
    (vscode.extensions as { all: unknown[] }).all = [];
    (vscode.commands.getCommands as jest.Mock).mockResolvedValue([]);
    (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);
    delete (globalThis as Record<string, unknown>).__msAgentGetAiFixQueueSnapshot;
    delete (globalThis as Record<string, unknown>).__msAgentGetAiFixQueueStates;
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__msAgentGetAiFixQueueSnapshot;
    delete (globalThis as Record<string, unknown>).__msAgentGetAiFixQueueStates;
  });

  function setContribution(commands: string[]): void {
    (vscode.extensions as { all: unknown[] }).all = [contribution(commands)];
  }

  // =====================================================================
  // isMsAgentIntegrationAvailable
  // =====================================================================

  describe('isMsAgentIntegrationAvailable', () => {
    it('is false when the feature flag is off', async () => {
      (SettingsLoader.isMsAgentAiFixEnabled as jest.Mock).mockReturnValue(false);

      await expect(service.isMsAgentIntegrationAvailable())
        .resolves
        .toBe(false);
      expect(vscode.commands.getCommands)
        .not.toHaveBeenCalled();
    });

    it('is true when msAgent commands are contributed by an installed extension', async () => {
      setContribution(REQUIRED_COMMANDS);

      await expect(service.isMsAgentIntegrationAvailable())
        .resolves
        .toBe(true);
      expect(vscode.commands.getCommands)
        .not.toHaveBeenCalled();
    });

    it('ignores extensions that contribute only some of the required commands', async () => {
      setContribution(['msagent.parseLog']);
      (vscode.commands.getCommands as jest.Mock).mockResolvedValue(['msagent.parseLog']);

      await expect(service.isMsAgentIntegrationAvailable())
        .resolves
        .toBe(false);
    });

    it('ignores extensions without contributes metadata', async () => {
      (vscode.extensions as { all: unknown[] }).all = [contributionNoCommands()];
      (vscode.commands.getCommands as jest.Mock).mockResolvedValue(REQUIRED_COMMANDS);

      await expect(service.isMsAgentIntegrationAvailable())
        .resolves
        .toBe(true);
    });

    it('falls back to registered commands when no contribution lists them', async () => {
      (vscode.commands.getCommands as jest.Mock).mockResolvedValue([...REQUIRED_COMMANDS]);

      await expect(service.isMsAgentIntegrationAvailable())
        .resolves
        .toBe(true);
      expect(vscode.commands.getCommands)
        .toHaveBeenCalledWith(true);
    });

    it('treats a getCommands failure as unavailable', async () => {
      (vscode.commands.getCommands as jest.Mock).mockRejectedValue(new Error('nope'));

      await expect(service.isMsAgentIntegrationAvailable())
        .resolves
        .toBe(false);
    });

    it('is false when only one of the registered commands exists', async () => {
      (vscode.commands.getCommands as jest.Mock).mockResolvedValue(['msagent.parseLog']);

      await expect(service.isMsAgentIntegrationAvailable())
        .resolves
        .toBe(false);
    });
  });

  // =====================================================================
  // areMsAgentCommandsRegistered
  // =====================================================================

  describe('areMsAgentCommandsRegistered', () => {
    it('is true when both commands are registered', async () => {
      (vscode.commands.getCommands as jest.Mock).mockResolvedValue([...REQUIRED_COMMANDS]);

      await expect(service.areMsAgentCommandsRegistered())
        .resolves
        .toBe(true);
    });

    it('is false when a command is missing', async () => {
      (vscode.commands.getCommands as jest.Mock).mockResolvedValue(['msagent.parseLog']);

      await expect(service.areMsAgentCommandsRegistered())
        .resolves
        .toBe(false);
    });

    it('is false when getCommands throws', async () => {
      (vscode.commands.getCommands as jest.Mock).mockRejectedValue(new Error('boom'));

      await expect(service.areMsAgentCommandsRegistered())
        .resolves
        .toBe(false);
    });
  });

  // =====================================================================
  // loadMsAgentLog / tryLoadLogWithIntegration
  // =====================================================================

  describe('loadMsAgentLog', () => {
    it('executes msagent.parseLog with the file uri and options', async () => {
      await service.loadMsAgentLog('/logs/sanitizer.log', { suppressMessage: true });

      expect(vscode.Uri.file)
        .toHaveBeenCalledWith('/logs/sanitizer.log');
      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith('msagent.parseLog', { fsPath: '/logs/sanitizer.log' }, { suppressMessage: true });
    });

    it('defaults options to an empty object', async () => {
      await service.loadMsAgentLog('/logs/sanitizer.log');

      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(
          'msagent.parseLog',
          expect.objectContaining({ fsPath: '/logs/sanitizer.log' }),
          {},
        );
    });
  });

  describe('tryLoadLogWithIntegration', () => {
    it('does nothing when the integration is unavailable', async () => {
      (SettingsLoader.isMsAgentAiFixEnabled as jest.Mock).mockReturnValue(false);

      await service.tryLoadLogWithIntegration('/logs/sanitizer.log');

      expect(vscode.commands.executeCommand)
        .not.toHaveBeenCalled();
    });

    it('loads the log with suppressed message when available', async () => {
      setContribution(REQUIRED_COMMANDS);

      await service.tryLoadLogWithIntegration('/logs/sanitizer.log');

      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(
          'msagent.parseLog',
          expect.objectContaining({ fsPath: '/logs/sanitizer.log' }),
          { suppressMessage: true },
        );
    });

    it('swallows a failing parseLog command', async () => {
      const warnSpy = jest.spyOn(console, 'warn')
        .mockImplementation(() => undefined);

      setContribution(REQUIRED_COMMANDS);
      (vscode.commands.executeCommand as jest.Mock).mockRejectedValue(new Error('parse failed'));

      await expect(service.tryLoadLogWithIntegration('/logs/sanitizer.log'))
        .resolves
        .toBeUndefined();
      expect(warnSpy)
        .toHaveBeenCalledWith('[msAgentBridge] msagent.parseLog failed:', expect.any(Error));
    });
  });

  // =====================================================================
  // getAiFixQueueSnapshot
  // =====================================================================

  describe('getAiFixQueueSnapshot', () => {
    const emptySnapshot = {
      paused: false,
      hasPendingTasks: false,
      items: [],
      states: {},
    };

    it('returns the empty snapshot when the integration is unavailable', async () => {
      (SettingsLoader.isMsAgentAiFixEnabled as jest.Mock).mockReturnValue(false);

      await expect(service.getAiFixQueueSnapshot())
        .resolves
        .toEqual(emptySnapshot);
      expect(vscode.commands.executeCommand)
        .not.toHaveBeenCalled();
    });

    it('prefers the global snapshot function when it returns a valid snapshot', async () => {
      setContribution(REQUIRED_COMMANDS);
      const snapshot = {
        paused: true,
        hasPendingTasks: true,
        items: [
          {
            id: 'a1',
            title: 't1',
          },
        ],
        states: { a1: 'running' },
      };

      (globalThis as Record<string, unknown>).__msAgentGetAiFixQueueSnapshot = () => snapshot;

      await expect(service.getAiFixQueueSnapshot())
        .resolves
        .toEqual(snapshot);
      expect(vscode.commands.executeCommand)
        .not.toHaveBeenCalled();
    });

    it('falls through to the states global when the snapshot global is invalid', async () => {
      setContribution(REQUIRED_COMMANDS);
      const states = {
        a1: 'queued',
        a2: 'fixed',
      };

      (globalThis as Record<string, unknown>).__msAgentGetAiFixQueueSnapshot = () => ({ bogus: true });
      (globalThis as Record<string, unknown>).__msAgentGetAiFixQueueStates = () => states;

      await expect(service.getAiFixQueueSnapshot())
        .resolves
        .toEqual({
          paused: false,
          hasPendingTasks: true,
          items: [],
          states,
        });
    });

    it('falls through when the snapshot global throws', async () => {
      setContribution(REQUIRED_COMMANDS);
      const states = { a1: 'fixed' };

      (globalThis as Record<string, unknown>).__msAgentGetAiFixQueueSnapshot = () => {
        throw new Error('bad global');
      };
      (globalThis as Record<string, unknown>).__msAgentGetAiFixQueueStates = () => states;

      await expect(service.getAiFixQueueSnapshot())
        .resolves
        .toEqual({
          paused: false,
          hasPendingTasks: false,
          items: [],
          states,
        });
    });

    it('treats a throwing settings loader as unavailable', async () => {
      (SettingsLoader.isMsAgentAiFixEnabled as jest.Mock).mockImplementation(() => {
        throw new Error('settings corrupt');
      });

      await expect(service.getAiFixQueueSnapshot())
        .resolves
        .toEqual(emptySnapshot);
    });

    it('rejects an array result from the snapshot command', async () => {
      setContribution(REQUIRED_COMMANDS);
      const states = { f1: 'fixed' };

      (vscode.commands.executeCommand as jest.Mock)
        .mockResolvedValueOnce([
          'not',
          'a',
          'snapshot',
        ])
        .mockResolvedValueOnce(states);

      await expect(service.getAiFixQueueSnapshot())
        .resolves
        .toEqual({
          paused: false,
          hasPendingTasks: false,
          items: [],
          states,
        });
    });

    it('rejects an array result from the states command', async () => {
      setContribution(REQUIRED_COMMANDS);
      (vscode.commands.executeCommand as jest.Mock)
        .mockResolvedValueOnce({ paused: 'x' })
        .mockResolvedValueOnce([
          'not',
          'states',
        ]);

      await expect(service.getAiFixQueueSnapshot())
        .resolves
        .toEqual(emptySnapshot);
    });

    it('falls through when the snapshot carries invalid states', async () => {
      setContribution(REQUIRED_COMMANDS);
      const states = { g1: 'queued' };

      (vscode.commands.executeCommand as jest.Mock)
        .mockResolvedValueOnce({
          paused: false,
          hasPendingTasks: true,
          items: [],
          states: { g1: 'not-a-state' },
        })
        .mockResolvedValueOnce(states);

      await expect(service.getAiFixQueueSnapshot())
        .resolves
        .toEqual({
          paused: false,
          hasPendingTasks: true,
          items: [],
          states,
        });
    });

    it('falls through when the states global throws', async () => {
      setContribution(REQUIRED_COMMANDS);
      (globalThis as Record<string, unknown>).__msAgentGetAiFixQueueSnapshot = () => {
        throw new Error('bad global');
      };
      (globalThis as Record<string, unknown>).__msAgentGetAiFixQueueStates = () => {
        throw new Error('bad states global');
      };
      (vscode.commands.executeCommand as jest.Mock).mockResolvedValue({
        paused: false,
        hasPendingTasks: false,
        items: [],
        states: {},
      });

      await expect(service.getAiFixQueueSnapshot())
        .resolves
        .toEqual(emptySnapshot);
      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith('msagent.getAiFixQueueSnapshot');
    });

    it('accepts a snapshot without a states field (treated as an empty map)', async () => {
      setContribution(REQUIRED_COMMANDS);
      (vscode.commands.executeCommand as jest.Mock).mockResolvedValue({
        paused: false,
        hasPendingTasks: false,
        items: [],
      });

      await expect(service.getAiFixQueueSnapshot())
        .resolves
        .toEqual({
          paused: false,
          hasPendingTasks: false,
          items: [],
        });
    });

    it('takes the snapshot from the msagent.getAiFixQueueSnapshot command', async () => {
      setContribution(REQUIRED_COMMANDS);
      const snapshot = {
        paused: false,
        hasPendingTasks: true,
        items: [
          {
            id: 'b2',
            title: 't2',
          },
        ],
        states: { b2: 'queued' },
      };

      (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(snapshot);

      await expect(service.getAiFixQueueSnapshot())
        .resolves
        .toEqual(snapshot);
      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith('msagent.getAiFixQueueSnapshot');
    });

    it('falls through to the states command when the snapshot command returns garbage', async () => {
      setContribution(REQUIRED_COMMANDS);
      const states = { c1: 'running' };

      (vscode.commands.executeCommand as jest.Mock)
        .mockResolvedValueOnce({ paused: 'yes' })
        .mockResolvedValueOnce(states);

      await expect(service.getAiFixQueueSnapshot())
        .resolves
        .toEqual({
          paused: false,
          hasPendingTasks: true,
          items: [],
          states,
        });
      expect(vscode.commands.executeCommand)
        .toHaveBeenNthCalledWith(1, 'msagent.getAiFixQueueSnapshot');
      expect(vscode.commands.executeCommand)
        .toHaveBeenNthCalledWith(2, 'msagent.getAiFixQueueStates');
    });

    it('returns the empty snapshot when both commands fail', async () => {
      setContribution(REQUIRED_COMMANDS);
      (vscode.commands.executeCommand as jest.Mock)
        .mockRejectedValueOnce(new Error('cmd1'))
        .mockRejectedValueOnce(new Error('cmd2'));

      await expect(service.getAiFixQueueSnapshot())
        .resolves
        .toEqual(emptySnapshot);
    });

    it('returns the empty snapshot when the states command result is invalid', async () => {
      setContribution(REQUIRED_COMMANDS);
      (vscode.commands.executeCommand as jest.Mock)
        .mockResolvedValueOnce({
          paused: 'no',
          hasPendingTasks: 1,
          items: 'x',
          states: {},
        })
        .mockResolvedValueOnce({ a1: 'paused' });

      await expect(service.getAiFixQueueSnapshot())
        .resolves
        .toEqual(emptySnapshot);
    });

    it('rejects snapshots with malformed items', async () => {
      setContribution(REQUIRED_COMMANDS);
      const states = { d1: 'fixed' };

      (vscode.commands.executeCommand as jest.Mock)
        .mockResolvedValueOnce({
          paused: false,
          hasPendingTasks: false,
          items: [{ id: 'd1' }],
          states,
        })
        .mockResolvedValueOnce(states);

      await expect(service.getAiFixQueueSnapshot())
        .resolves
        .toEqual({
          paused: false,
          hasPendingTasks: false,
          items: [],
          states,
        });
    });

    it('marks hasPendingTasks false when only fixed states remain', async () => {
      setContribution(REQUIRED_COMMANDS);
      const states = { e1: 'fixed' };

      (globalThis as Record<string, unknown>).__msAgentGetAiFixQueueStates = () => states;

      await expect(service.getAiFixQueueSnapshot())
        .resolves
        .toEqual(expect.objectContaining({
          hasPendingTasks: false,
          states,
        }));
    });
  });

  // =====================================================================
  // getAiFixQueueStates
  // =====================================================================

  describe('getAiFixQueueStates', () => {
    it('returns the states of the snapshot', async () => {
      setContribution(REQUIRED_COMMANDS);
      (vscode.commands.executeCommand as jest.Mock).mockResolvedValue({
        paused: false,
        hasPendingTasks: true,
        items: [],
        states: { a1: 'queued' },
      });

      await expect(service.getAiFixQueueStates())
        .resolves
        .toEqual({ a1: 'queued' });
    });

    it('returns an empty map when the integration is unavailable', async () => {
      (SettingsLoader.isMsAgentAiFixEnabled as jest.Mock).mockReturnValue(false);

      await expect(service.getAiFixQueueStates())
        .resolves
        .toEqual({});
    });
  });

  // =====================================================================
  // fixMsAgentProblem
  // =====================================================================

  describe('fixMsAgentProblem', () => {
    it('returns integration_unavailable without invoking the command', async () => {
      (SettingsLoader.isMsAgentAiFixEnabled as jest.Mock).mockReturnValue(false);

      await expect(service.fixMsAgentProblem(3))
        .resolves
        .toEqual({ status: 'integration_unavailable' });
      expect(vscode.commands.executeCommand)
        .not.toHaveBeenCalled();
    });

    it('passes the index and options to msagent.fixProblem', async () => {
      setContribution(REQUIRED_COMMANDS);
      (vscode.commands.executeCommand as jest.Mock).mockResolvedValue({ status: 'queued' });

      await expect(service.fixMsAgentProblem(3, { suppressProgressNotification: true }))
        .resolves
        .toEqual({ status: 'queued' });
      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith('msagent.fixProblem', 3, { suppressProgressNotification: true });
    });

    it('maps a boolean true result to completed', async () => {
      setContribution(REQUIRED_COMMANDS);
      (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(true);

      await expect(service.fixMsAgentProblem(0))
        .resolves
        .toEqual({ status: 'completed' });
    });

    it('maps a boolean false result to failed', async () => {
      setContribution(REQUIRED_COMMANDS);
      (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(false);

      await expect(service.fixMsAgentProblem(0))
        .resolves
        .toEqual({ status: 'failed' });
    });

    it('maps an unexpected result to unknown', async () => {
      setContribution(REQUIRED_COMMANDS);
      (vscode.commands.executeCommand as jest.Mock).mockResolvedValue({ status: 42 });

      await expect(service.fixMsAgentProblem(0))
        .resolves
        .toEqual({ status: 'unknown' });
    });

    it('maps an undefined result to unknown', async () => {
      setContribution(REQUIRED_COMMANDS);
      (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);

      await expect(service.fixMsAgentProblem(0))
        .resolves
        .toEqual({ status: 'unknown' });
    });

    it('returns failed when the command throws', async () => {
      const warnSpy = jest.spyOn(console, 'warn')
        .mockImplementation(() => undefined);

      setContribution(REQUIRED_COMMANDS);
      (vscode.commands.executeCommand as jest.Mock).mockRejectedValue(new Error('fix crashed'));

      await expect(service.fixMsAgentProblem(0))
        .resolves
        .toEqual({ status: 'failed' });
      expect(warnSpy)
        .toHaveBeenCalledWith('[msAgentBridge] msagent.fixProblem failed:', expect.any(Error));
    });
  });

  // =====================================================================
  // exported singleton
  // =====================================================================

  describe('exported singleton', () => {
    it('is a usable MsAgentBridgeService instance', async () => {
      (vscode.commands.getCommands as jest.Mock).mockResolvedValue([...REQUIRED_COMMANDS]);

      await expect(msAgentBridgeService.areMsAgentCommandsRegistered())
        .resolves
        .toBe(true);
    });
  });
});
