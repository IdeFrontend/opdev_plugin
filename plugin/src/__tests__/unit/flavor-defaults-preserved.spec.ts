import * as fs from 'fs';
import * as path from 'path';

import * as vscode from 'vscode';

import {
  FLAVOR_GATES,
  getFlavorDefault,
  isFlavorGated,
} from '@shared/flavor';
import { SettingsLoader } from '@plugin/service/settings-loader';

jest.mock('i18next', () => ({ t: (key: string) => key }));

/** All plugin/src source files (tests excluded — the grep case must not catch itself). */
const walkSourceFiles = (dir: string): string[] => {
  const out: string[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__') {
      continue;
    }

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      out.push(...walkSourceFiles(fullPath));
    }
    else if (fullPath.endsWith('.ts')) {
      out.push(fullPath);
    }
  }

  return out;
};

describe('flavor defaults preserved after the feature-toggle inline', () => {
  it('FLAVOR_GATES expose only operatorSupport.triton', () => {
    expect(FLAVOR_GATES['operatorSupport.triton'])
      .toBe(true);
    expect(isFlavorGated('operatorSupport.triton'))
      .toBe(true);
    expect(getFlavorDefault('operatorSupport.triton'))
      .toBe(false);
  });

  it('flavor default applies for triton when setting unset; other operator types stay enabled', () => {
    // Shared vscode mock: getConfiguration.get() returns undefined (setting unset).
    expect(SettingsLoader.isOperatorSupportEnabled('triton'))
      .toBe(false);
    expect(SettingsLoader.isOperatorSupportEnabled('cann'))
      .toBe(true);
    expect(SettingsLoader.isOperatorSupportEnabled('pyasc'))
      .toBe(true);
    expect(SettingsLoader.isOperatorSupportEnabled('TRITON'))
      .toBe(false);
  });

  it('workspace setting overrides the flavor default', () => {
    const cfg = {
      inspect: jest.fn(),
      get: jest.fn()
        .mockReturnValue(true),
      update: jest.fn(),
    };

    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(cfg);
    expect(SettingsLoader.isOperatorSupportEnabled('triton'))
      .toBe(true);

    cfg.get.mockReturnValue(false);
    expect(SettingsLoader.isOperatorSupportEnabled('triton'))
      .toBe(false);
  });

  it('msAgent respects the manifest default when the setting is unset', () => {
    expect(SettingsLoader.isMsAgentAiFixEnabled())
      .toBe(false);

    const cfg = {
      inspect: jest.fn(),
      get: jest.fn()
        .mockReturnValue(true),
      update: jest.fn(),
    };

    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(cfg);
    expect(SettingsLoader.isMsAgentAiFixEnabled())
      .toBe(true);
  });

  it('always-true toggles are absent from the plugin source tree (grep)', () => {
    const sourceRoot = path.join(__dirname, '../..');
    const sources = walkSourceFiles(sourceRoot)
      .map((filePath) => fs.readFileSync(filePath, 'utf8'))
      .join('\n');

    expect(sources)
      .not.toMatch(/isSanitizerEnabled|isPerformanceTuningEnabled|isNpuDebugEnabled|isDumpTensorEnabled/);
  });
});
