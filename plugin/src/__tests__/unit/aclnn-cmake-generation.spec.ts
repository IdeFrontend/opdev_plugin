import fs from 'fs-extra';
import os from 'os';
import path from 'path';

jest.mock('@plugin/helpers/operator-project-workspace-config', () => ({
  getSocVersionWithWorkspaceOverride: jest.fn(),
  getWorkspaceSimulatorType: jest.fn(() => ''),
}));

import { getSocVersionWithWorkspaceOverride } from '@plugin/helpers/operator-project-workspace-config';
import {
  MSTT_SUPPORT_COMPUTE_UNIT_PLACEHOLDER,
  MSTT_SUPPORT_TILING_DIR_PLACEHOLDER,
  resolveAclnnCmakeDefaultsForGeneration,
} from '@plugin/domain/utils/ascend-util';
import {
  SUPPORT_COMPUTE_UNIT_ASCEND_910_95,
  SUPPORT_COMPUTE_UNIT_ASCEND_950,
  SUPPORT_TILING_DIR_ARCH22,
  SUPPORT_TILING_DIR_ARCH35,
} from '@shared/cann-aclnn-build-defaults';
import { AscendOpGenerator } from '@plugin/domain/services/op-generator-factory';

describe('aclnn cmake generation', () => {
  beforeEach(() => {
    (getSocVersionWithWorkspaceOverride as jest.Mock).mockImplementation(
      (stored?: string | null) => stored || '',
    );
  });

  it('resolveAclnnCmakeDefaultsForGeneration maps A3-class workspace SOC', () => {
    (getSocVersionWithWorkspaceOverride as jest.Mock).mockReturnValue('ascend910b');

    expect(resolveAclnnCmakeDefaultsForGeneration(null))
      .toEqual({
        supportComputeUnit: SUPPORT_COMPUTE_UNIT_ASCEND_910_95,
        supportTilingDir: SUPPORT_TILING_DIR_ARCH22,
      });
  });

  it('resolveAclnnCmakeDefaultsForGeneration maps A5 workspace SOC', () => {
    (getSocVersionWithWorkspaceOverride as jest.Mock).mockReturnValue('ascend950');

    expect(resolveAclnnCmakeDefaultsForGeneration('ascend910b'))
      .toEqual({
        supportComputeUnit: SUPPORT_COMPUTE_UNIT_ASCEND_950,
        supportTilingDir: SUPPORT_TILING_DIR_ARCH35,
      });
  });

  it('AscendOpGenerator patches CMakeLists placeholders after generation', () => {
    (getSocVersionWithWorkspaceOverride as jest.Mock).mockReturnValue('ascend950');

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-aclnn-gen-'));
    const cmakePath = path.join(tmp, 'CMakeLists.txt');

    fs.writeFileSync(
      cmakePath,
      `set(SUPPORT_COMPUTE_UNIT "${MSTT_SUPPORT_COMPUTE_UNIT_PLACEHOLDER}")\n`
        + `set(SUPPORT_TILING_DIR "${MSTT_SUPPORT_TILING_DIR_PLACEHOLDER}")\n`,
      'utf8',
    );

    const generator = new AscendOpGenerator(
      { soc_version: null },
      { project_path: tmp },
      '/ext',
    );
    (generator as { op_path: string }).op_path = tmp;
    generator._patchAclnnCmakeSupportVars();

    const patched = fs.readFileSync(cmakePath, 'utf8');

    expect(patched).toContain(`set(SUPPORT_COMPUTE_UNIT "${SUPPORT_COMPUTE_UNIT_ASCEND_950}")`);
    expect(patched).toContain(`set(SUPPORT_TILING_DIR "${SUPPORT_TILING_DIR_ARCH35}")`);
    expect(patched).not.toContain(MSTT_SUPPORT_COMPUTE_UNIT_PLACEHOLDER);

    fs.removeSync(tmp);
  });
});
