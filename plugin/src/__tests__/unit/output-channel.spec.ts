jest.mock('vscode', () => ({ window: { createOutputChannel: jest.fn(() => createChannel()) } }));

// jest-setup.ts registers a global mock for this module; test the real implementation.
jest.mock('@plugin/helpers/output-channel', () => jest.requireActual('@plugin/helpers/output-channel'));

function createChannel() {
  return {
    appendLine: jest.fn(),
    append: jest.fn(),
    clear: jest.fn(),
    show: jest.fn(),
    dispose: jest.fn(),
  };
}

import { BRANDING } from '@shared/flavor';

let outputChannel: typeof import('@plugin/helpers/output-channel');
let createOutputChannel: jest.Mock;

beforeEach(() => {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- fresh module instance per test
  createOutputChannel = require('vscode').window.createOutputChannel;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- fresh module instance per test
  outputChannel = require('@plugin/helpers/output-channel');
});

describe('output-channel', () => {
  describe('OP_DEVTOOLS_TOOL_CHANNEL_PREFIX', () => {
    it('aliases the branding product name', () => {
      expect(outputChannel.OP_DEVTOOLS_TOOL_CHANNEL_PREFIX)
        .toBe(BRANDING.productName);
    });
  });

  describe('getHuaweiOpDevtoolsOutputChannel', () => {
    it('creates one channel with the product name and reuses it', () => {
      const first = outputChannel.getHuaweiOpDevtoolsOutputChannel();
      const second = outputChannel.getHuaweiOpDevtoolsOutputChannel();

      expect(first)
        .toBe(second);
      expect(createOutputChannel)
        .toHaveBeenCalledTimes(1);
      expect(createOutputChannel)
        .toHaveBeenCalledWith(BRANDING.productName);
    });
  });

  describe('getOperatorToolOutputChannel', () => {
    it('creates a per-label channel named productName: label', () => {
      const channel = outputChannel.getOperatorToolOutputChannel('compile');

      expect(createOutputChannel)
        .toHaveBeenCalledWith(`${BRANDING.productName}: compile`);
      expect(channel)
        .toBeDefined();
    });

    it('returns the same channel for a repeated label and APPENDS by default (no clear)', () => {
      const first = outputChannel.getOperatorToolOutputChannel('sanitizer');
      const second = outputChannel.getOperatorToolOutputChannel('sanitizer');

      expect(first)
        .toBe(second);
      expect(createOutputChannel)
        .toHaveBeenCalledTimes(1);
      expect(first.clear).not.toHaveBeenCalled();
    });

    it('clears a reused channel when clear: true is passed', () => {
      const first = outputChannel.getOperatorToolOutputChannel('run');
      const second = outputChannel.getOperatorToolOutputChannel('run', { clear: true });

      expect(first)
        .toBe(second);
      expect(first.clear)
        .toHaveBeenCalledTimes(1);
    });

    it('keeps channels for different labels distinct', () => {
      const compile = outputChannel.getOperatorToolOutputChannel('compile');
      const test = outputChannel.getOperatorToolOutputChannel('test');

      expect(compile).not.toBe(test);
      expect(createOutputChannel)
        .toHaveBeenCalledTimes(2);
    });
  });

  describe('appendLog', () => {
    it('writes scope, ISO timestamp and message without payload', () => {
      outputChannel.appendLog('compile', 'build finished');

      const channel = outputChannel.getHuaweiOpDevtoolsOutputChannel();

      expect(channel.appendLine)
        .toHaveBeenCalledWith(expect.stringMatching(/^\[compile\] \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z build finished$/));
    });

    it('appends JSON-serialized payload when provided', () => {
      outputChannel.appendLog('run', 'result', { exitCode: 0 });

      const channel = outputChannel.getHuaweiOpDevtoolsOutputChannel();

      expect(channel.appendLine)
        .toHaveBeenCalledWith(expect.stringMatching(/\[run\] .* result {"exitCode":0}$/));
    });

    it('falls back to String(payload) when JSON serialization fails', () => {
      const circular: Record<string, unknown> = {};

      circular.self = circular;
      outputChannel.appendLog('tool', 'boom', circular);

      const channel = outputChannel.getHuaweiOpDevtoolsOutputChannel();

      expect(channel.appendLine)
        .toHaveBeenCalledWith(expect.stringMatching(/\[tool\] .* boom \[object Object\]$/));
    });
  });
});
