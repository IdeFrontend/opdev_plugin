import {
  resolveFocusOpsOperateCommand,
  OPS_OPERATE_VIEW_CONTAINER_ID,
  OPS_OPERATE_FOCUS_COMMAND_CANDIDATES,
} from '@plugin/helpers/focus-ops-operate';
import {
  VIEW_CONTAINER_ID,
  workbenchViewContainerCommand,
} from '@shared/flavor';

const VIEW_CONTAINER_COMMAND = workbenchViewContainerCommand();
const LEGACY_FOCUS_COMMAND = `workbench.view.extension.${OPS_OPERATE_VIEW_CONTAINER_ID}.focus`;
const FOCUS_AUXILIARY_BAR = 'workbench.action.focusAuxiliaryBar';

describe('resolveFocusOpsOperateCommand (issue #33)', () => {
  it('prefers the generated view container command when the host registers it', () => {
    expect(resolveFocusOpsOperateCommand([
      VIEW_CONTAINER_COMMAND,
      FOCUS_AUXILIARY_BAR,
    ]))
      .toBe(VIEW_CONTAINER_COMMAND);
  });

  it('uses focusAuxiliaryBar on the VSCode-huawei fork (no per-container command)', () => {
    expect(resolveFocusOpsOperateCommand([
      FOCUS_AUXILIARY_BAR,
      'some.other.command',
    ]))
      .toBe(FOCUS_AUXILIARY_BAR);
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

  it('container id comes from the generated flavor constants', () => {
    expect(OPS_OPERATE_VIEW_CONTAINER_ID)
      .toBe(VIEW_CONTAINER_ID);
    expect(VIEW_CONTAINER_COMMAND)
      .toBe(`workbench.view.extension.${VIEW_CONTAINER_ID}`);
  });
});
