import fs from 'fs-extra';
import os from 'os';
import path from 'path';

jest.mock('@plugin/helpers/operator-project-workspace-config', () => ({
  getSocVersionWithWorkspaceOverride: jest.fn(),
  getWorkspaceSimulatorType: jest.fn(() => ''),
}));

import { getSocVersionWithWorkspaceOverride } from '@plugin/helpers/operator-project-workspace-config';
import { AscendPlugin } from '@plugin/domain/plugins/ascend.plugin';
import { CannPlugin } from '@plugin/domain/plugins/cann.plugin';
import {
  MSTT_SANITIZER_COMPILE_FLAGS_PLACEHOLDER,
  MSTT_SANITIZER_LINK_SUFFIX_PLACEHOLDER,
  MSTT_SUPPORT_COMPUTE_UNIT_PLACEHOLDER,
  MSTT_SUPPORT_TILING_DIR_PLACEHOLDER,
  resolveAclnnCmakeDefaultsForGeneration,
  resolveSanitizerCmakeDefaultsForGeneration,
} from '@plugin/domain/utils/ascend-util';
import {
  SUPPORT_COMPUTE_UNIT_ASCEND_910_95,
  SUPPORT_COMPUTE_UNIT_ASCEND_950,
  SUPPORT_TILING_DIR_ARCH22,
  SUPPORT_TILING_DIR_ARCH35,
} from '@shared/cann-aclnn-build-defaults';

describe('aclnn cmake generation', () => {
  beforeEach(() => {
    (getSocVersionWithWorkspaceOverride as jest.Mock).mockImplementation((stored?: string | null) => stored || '');
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

  it('AscendPlugin patches CMakeLists placeholders after generation', () => {
    (getSocVersionWithWorkspaceOverride as jest.Mock).mockReturnValue('ascend950');

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-aclnn-gen-'));
    const cmakePath = path.join(tmp, 'CMakeLists.txt');

    fs.writeFileSync(
      cmakePath,
      `set(SUPPORT_COMPUTE_UNIT "${MSTT_SUPPORT_COMPUTE_UNIT_PLACEHOLDER}")\n`
      + `set(SUPPORT_TILING_DIR "${MSTT_SUPPORT_TILING_DIR_PLACEHOLDER}")\n`,
      'utf8',
    );

    new AscendPlugin()
      .patchGeneratedProject(tmp, { soc_version: null });

    const patched = fs.readFileSync(cmakePath, 'utf8');

    expect(patched)
      .toContain(`set(SUPPORT_COMPUTE_UNIT "${SUPPORT_COMPUTE_UNIT_ASCEND_950}")`);
    expect(patched)
      .toContain(`set(SUPPORT_TILING_DIR "${SUPPORT_TILING_DIR_ARCH35}")`);
    expect(patched).not.toContain(MSTT_SUPPORT_COMPUTE_UNIT_PLACEHOLDER);

    fs.removeSync(tmp);
  });
});

describe('cann sanitizer cmake generation', () => {
  beforeEach(() => {
    (getSocVersionWithWorkspaceOverride as jest.Mock).mockImplementation((stored?: string | null) => stored || '');
  });

  it('resolveSanitizerCmakeDefaultsForGeneration omits --cce-enable-sanitizer on A5', () => {
    (getSocVersionWithWorkspaceOverride as jest.Mock).mockReturnValue('ascend950');

    expect(resolveSanitizerCmakeDefaultsForGeneration(null))
      .toEqual({
        compileFlags: '-g',
        linkSuffix: '',
      });
  });

  it('resolveSanitizerCmakeDefaultsForGeneration includes --cce-enable-sanitizer on non-A5', () => {
    (getSocVersionWithWorkspaceOverride as jest.Mock).mockReturnValue('ascend910b');

    expect(resolveSanitizerCmakeDefaultsForGeneration(null))
      .toEqual({
        compileFlags: '-g --cce-enable-sanitizer',
        linkSuffix: '--cce-enable-sanitizer',
      });
  });

  function writeSanitizerCmakeFixture(cmakePath: string): void {
    fs.writeFileSync(
      cmakePath,
      'elseif(ENABLE_MS_SANITIZER)\n'
      + `    list(APPEND compile_options -O2 ${MSTT_SANITIZER_COMPILE_FLAGS_PLACEHOLDER})\n`
      + '    target_link_options(hello_world PRIVATE\n'
      + '        --cce-fatobj-link\n'
      + `        ${MSTT_SANITIZER_LINK_SUFFIX_PLACEHOLDER}\n`
      + '    )\n',
      'utf8',
    );
  }

  it('CannPlugin patches sanitizer CMakeLists placeholders for A5', () => {
    (getSocVersionWithWorkspaceOverride as jest.Mock).mockReturnValue('ascend950');

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-sanitizer-gen-a5-'));
    const cmakePath = path.join(tmp, 'CMakeLists.txt');

    writeSanitizerCmakeFixture(cmakePath);

    new CannPlugin()
      .patchGeneratedProject(tmp, { soc_version: null });

    const patched = fs.readFileSync(cmakePath, 'utf8');

    expect(patched)
      .toContain('list(APPEND compile_options -O2 -g)');
    expect(patched)
      .toContain('        --cce-fatobj-link');
    expect(patched).not.toContain('--cce-enable-sanitizer');
    expect(patched).not.toContain(MSTT_SANITIZER_COMPILE_FLAGS_PLACEHOLDER);
    expect(patched).not.toContain(MSTT_SANITIZER_LINK_SUFFIX_PLACEHOLDER);
    expect(patched)
      .toMatch(/target_link_options\(hello_world PRIVATE\n {8}--cce-fatobj-link\n {4}\)/);

    fs.removeSync(tmp);
  });

  it('CannPlugin patches sanitizer CMakeLists placeholders for non-A5', () => {
    (getSocVersionWithWorkspaceOverride as jest.Mock).mockReturnValue('ascend910b');

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-sanitizer-gen-a3-'));
    const cmakePath = path.join(tmp, 'CMakeLists.txt');

    writeSanitizerCmakeFixture(cmakePath);

    new CannPlugin()
      .patchGeneratedProject(tmp, { soc_version: null });

    const patched = fs.readFileSync(cmakePath, 'utf8');

    expect(patched)
      .toContain('list(APPEND compile_options -O2 -g --cce-enable-sanitizer)');
    expect(patched)
      .toContain('        --cce-fatobj-link');
    expect(patched)
      .toContain('        --cce-enable-sanitizer');
    expect(patched).not.toContain(MSTT_SANITIZER_COMPILE_FLAGS_PLACEHOLDER);
    expect(patched).not.toContain(MSTT_SANITIZER_LINK_SUFFIX_PLACEHOLDER);

    fs.removeSync(tmp);
  });
});
