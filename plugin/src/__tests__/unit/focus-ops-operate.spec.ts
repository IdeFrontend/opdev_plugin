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
