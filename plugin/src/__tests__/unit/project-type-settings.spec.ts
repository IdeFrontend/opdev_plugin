import * as vscode from 'vscode';
import {
  PROJECT_TYPE_SETTING,
  getOpDevtoolsWorkspaceConfiguration,
  readWorkspaceProjectTypeSetting,
} from '@plugin/helpers/operator-project-workspace-config';

describe('readWorkspaceProjectTypeSetting', () => {
  const inspectStore: Record<string, vscode.ConfigurationInspect<unknown> | undefined> = {};
  const getConfigurationMock = vscode.workspace.getConfiguration as jest.Mock;

  function setSetting(value: string, scope: 'workspaceFolderValue' | 'workspaceValue' | 'userValue'): void {
    inspectStore[PROJECT_TYPE_SETTING] = {
      key: PROJECT_TYPE_SETTING,
      [scope]: value,
    };
  }

  beforeEach(() => {
    Object.keys(inspectStore)
      .forEach((key) => delete inspectStore[key]);
    getConfigurationMock.mockReset();
    getConfigurationMock.mockReturnValue({
      inspect: <T>(key: string) => (
        inspectStore[key] as vscode.ConfigurationInspect<T> | undefined
      ),
      get: jest.fn(),
      update: jest.fn(),
    });
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
  });

  it('returns the workspace folder value (ascend) when the setting is recorded', () => {
    setSetting('ascend', 'workspaceFolderValue');

    expect(readWorkspaceProjectTypeSetting())
      .toBe('ascend');
  });

  it('returns the workspace value when only the workspace scope is set', () => {
    setSetting('standard-custom', 'workspaceValue');

    expect(readWorkspaceProjectTypeSetting())
      .toBe('standard-custom');
  });

  it('prefers the workspace folder value over the workspace value', () => {
    inspectStore[PROJECT_TYPE_SETTING] = {
      key: PROJECT_TYPE_SETTING,
      workspaceValue: 'cann',
      workspaceFolderValue: 'ascend',
    };

    expect(readWorkspaceProjectTypeSetting())
      .toBe('ascend');
  });

  it('returns undefined when the setting is not explicitly set in the workspace scope', () => {
    expect(readWorkspaceProjectTypeSetting())
      .toBeUndefined();
  });

  it('ignores a user-scope value (workspace-only override)', () => {
    setSetting('ascend', 'userValue');

    expect(readWorkspaceProjectTypeSetting())
      .toBeUndefined();
  });

  it('returns undefined for a blank/whitespace value', () => {
    setSetting('   ', 'workspaceValue');

    expect(readWorkspaceProjectTypeSetting())
      .toBeUndefined();
  });

  it('trims the stored value', () => {
    setSetting('  ascend  ', 'workspaceFolderValue');

    expect(readWorkspaceProjectTypeSetting())
      .toBe('ascend');
  });

  it('passes the explicit scopeUri to getConfiguration', () => {
    const scopeUri = vscode.Uri.file('/sub/project');

    readWorkspaceProjectTypeSetting(scopeUri);

    expect(getConfigurationMock)
      .toHaveBeenCalledWith(expect.any(String), scopeUri);
  });

  it('falls back to the first workspace folder scope without a scopeUri', () => {
    readWorkspaceProjectTypeSetting();

    expect(getConfigurationMock)
      .toHaveBeenCalledWith(expect.any(String), { fsPath: '/workspace' });
  });

  it('reads the op-devtools section used by the other workspace helpers', () => {
    const config = getOpDevtoolsWorkspaceConfiguration();

    expect(getConfigurationMock)
      .toHaveBeenCalledWith('op-devtools', { fsPath: '/workspace' });
    expect(config.inspect)
      .toBeDefined();
  });
});
