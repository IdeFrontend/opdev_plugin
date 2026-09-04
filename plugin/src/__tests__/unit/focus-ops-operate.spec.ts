import * as vscode from 'vscode';

import {
  resolveFocusOpsOperateCommand,
  focusOpsOperateViewContainer,
  OPS_OPERATE_VIEW_CONTAINER_ID,
  OPS_OPERATE_FOCUS_COMMAND_CANDIDATES,
} from '@plugin/helpers/focus-ops-operate';
import {
  VIEW_CONTAINER_ID,
  workbenchViewContainerCommand,
} from '@shared/flavor';

const VIEW_CONTAINER_COMMAND = workbenchViewContainerCommand();
const LEGACY_FOCUS_COMMAND = `workbench.view.extension.${OPS_OPERATE_VIEW_CONTAINER_ID}.focus`;

describe('resolveFocusOpsOperateCommand (focus command fallback)', () => {
  it('resolves the generated view container command when the host registers it', () => {
    expect(resolveFocusOpsOperateCommand([
      VIEW_CONTAINER_COMMAND,
      'some.other.command',
    ]))
      .toBe(VIEW_CONTAINER_COMMAND);
  });

  it('returns undefined when no candidate is registered (no "command not found" crash)', () => {
    expect(resolveFocusOpsOperateCommand([]))
      .toBeUndefined();
    expect(resolveFocusOpsOperateCommand(['unrelated.command']))
      .toBeUndefined();
  });

  it('never resolves to a toggle command (icon focuses, it does not toggle)', () => {
    expect(OPS_OPERATE_FOCUS_COMMAND_CANDIDATES)
      .not.toContain('workbench.action.toggleSidebarVisibility');
    expect(OPS_OPERATE_FOCUS_COMMAND_CANDIDATES)
      .not.toContain('workbench.action.toggleAuxiliaryBar');
    expect(OPS_OPERATE_FOCUS_COMMAND_CANDIDATES)
      .not.toContain(`workbench.view.extension.${OPS_OPERATE_VIEW_CONTAINER_ID}.toggleVisibility`);
    expect(OPS_OPERATE_FOCUS_COMMAND_CANDIDATES)
      .not.toContain(LEGACY_FOCUS_COMMAND);
  });

  it('no longer falls back to the auxiliary bar — the container lives in the primary activity bar', () => {
    expect(OPS_OPERATE_FOCUS_COMMAND_CANDIDATES)
      .toEqual([VIEW_CONTAINER_COMMAND]);
    expect(OPS_OPERATE_FOCUS_COMMAND_CANDIDATES)
      .not.toContain('workbench.action.focusAuxiliaryBar');
  });

  it('container id comes from the generated flavor constants', () => {
    expect(OPS_OPERATE_VIEW_CONTAINER_ID)
      .toBe(VIEW_CONTAINER_ID);
    expect(VIEW_CONTAINER_COMMAND)
      .toBe(`workbench.view.extension.${VIEW_CONTAINER_ID}`);
  });
});

describe('focusOpsOperateViewContainer (activation-safe)', () => {
  const getCommands = vscode.commands.getCommands as unknown as jest.Mock;
  const executeCommand = vscode.commands.executeCommand as unknown as jest.Mock;

  beforeEach(() => {
    getCommands.mockReset();
    executeCommand.mockReset()
      .mockResolvedValue(undefined);
    jest.spyOn(console, 'warn')
      .mockImplementation(() => {});
    jest.spyOn(console, 'log')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('executes the generated view container command when the host registers it', async () => {
    getCommands.mockResolvedValue([
      VIEW_CONTAINER_COMMAND,
      FOCUS_AUXILIARY_BAR,
    ]);

    await focusOpsOperateViewContainer();

    expect(executeCommand)
      .toHaveBeenCalledWith(VIEW_CONTAINER_COMMAND);
  });

  it('falls back to focusAuxiliaryBar on the VSCode-huawei fork', async () => {
    getCommands.mockResolvedValue([FOCUS_AUXILIARY_BAR]);

    await focusOpsOperateViewContainer();

    expect(executeCommand)
      .toHaveBeenCalledWith(FOCUS_AUXILIARY_BAR);
  });

  it('skips execution (no "command not found" crash) when no candidate is registered', async () => {
    getCommands.mockResolvedValue(['unrelated.command']);

    await expect(focusOpsOperateViewContainer())
      .resolves
      .toBeUndefined();
    expect(executeCommand)
      .not
      .toHaveBeenCalled();
  });

  it('swallows executeCommand rejection so activation never fails', async () => {
    getCommands.mockResolvedValue([VIEW_CONTAINER_COMMAND]);
    executeCommand.mockRejectedValue(new Error('command not found'));

    await expect(focusOpsOperateViewContainer())
      .resolves
      .toBeUndefined();
  });
});
