import fs from 'node:fs';
import path from 'node:path';

import {
  applyFlavor, restoreCommittedFlavorArtifacts,
} from '../../../../scripts/apply-flavor';
import { BASE_FLAVOR_IDS } from '../../../../flavors/schema';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

describe('apply-flavor', () => {
  afterAll(() => {
    try {
      restoreCommittedFlavorArtifacts();
    }
    catch {
      applyFlavor('huawei');
    }
  });

  it('huawei flavor preserves base manifest identity fields', () => {
    const flavor = applyFlavor('huawei');
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));

    expect(flavor.manifest.name)
      .toBe('huawei-op-devtools-vscode-plugin');
    expect(manifest.name)
      .toBe('huawei-op-devtools-vscode-plugin');
    expect(manifest.publisher)
      .toBe('huawei');
    expect(manifest.displayName)
      .toBe('Huawei OP DevTools');
    expect(manifest.contributes.commands.some((c: { command: string }) => c.command === 'huawei-op-devtools.open'))
      .toBe(true);
    expect(manifest.contributes.configuration.some((c: { id: string }) => c.id === 'op-devtools.operatorSupport'))
      .toBe(true);

    const openCommand = manifest.contributes.commands.find(
      (c: { command: string }) => c.command === 'huawei-op-devtools.open',
    );
    expect(openCommand?.category).toBe('%config.title%');

    const sidebarBuild = manifest.contributes.commands.find(
      (c: { command: string }) => c.command === 'huawei-op-devtools.sidebar.build',
    );
    const hideSidebarBuild = manifest.contributes.menus.commandPalette.find(
      (e: { command: string; when?: string }) => e.command === 'huawei-op-devtools.sidebar.build',
    );
    expect(hideSidebarBuild?.when).toBe('false');
    expect(sidebarBuild?.category).toBeUndefined();

    const toggleOps = manifest.contributes.commands.find(
      (c: { command: string }) => c.command === 'huawei-op-devtools.toggleOpsOperate',
    );
    expect(toggleOps?.category).toBe('%config.title%');
    const togglePalette = manifest.contributes.menus.commandPalette.find(
      (e: { command: string; when?: string }) => e.command === 'huawei-op-devtools.toggleOpsOperate',
    );
    expect(togglePalette?.when).toBe('opDevtools.hasDevtoolConfig');

    const nlsEn = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.nls.en.json'), 'utf8'));

    expect(nlsEn['config.category.operatorSupport.title'])
      .toBe('Operator Support');
    expect(nlsEn['config.op-devtools.operatorSupport.triton.description'])
      .toBe('Enable Triton project support');
  });

  it('apply-flavor preserves package.json version from disk', () => {
    const packageJsonPath = path.join(REPO_ROOT, 'package.json');
    const originalText = fs.readFileSync(packageJsonPath, 'utf8');
    const original = JSON.parse(originalText) as Record<string, unknown>;
    const bumpedVersion = '9.9.9-flavor-version-test';

    fs.writeFileSync(packageJsonPath, `${JSON.stringify({
      ...original,
      version: bumpedVersion,
    }, null, 2)}\n`, 'utf8');

    try {
      applyFlavor('ascend-c-toolkit');
      applyFlavor('huawei');

      const manifest = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as { version: string };

      expect(manifest.version)
        .toBe(bumpedVersion);
    }
    finally {
      fs.writeFileSync(packageJsonPath, originalText, 'utf8');
    }
  });

  it('ascend-c-toolkit flavor substitutes ids for co-installation', () => {
    applyFlavor('ascend-c-toolkit');
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));

    expect(manifest.name)
      .toBe('ascend-c-toolkit');
    expect(manifest.publisher)
      .toBe('hicann');
    expect(manifest.displayName)
      .toBe('Ascend C Toolkit');
    expect(manifest.contributes.commands.some((c: { command: string }) => c.command.startsWith('ascend-c-toolkit.')))
      .toBe(true);
    expect(manifest.contributes.configuration.some((c: { id: string }) => c.id === 'ascendCToolkit.sanitizer'))
      .toBe(true);
    expect(manifest.contributes.configuration.some((c: { id: string }) => c.id === 'ascendCToolkit.operatorSupport'))
      .toBe(false);
    expect(manifest.contributes.configuration.every((c: { properties?: Record<string, unknown> }) => {
      return !Object.keys(c.properties ?? {})
        .some((key) => key.includes('operatorSupport.triton'));
    }))
      .toBe(true);
    expect(manifest.activationEvents)
      .toContain('onView:ascendCToolkitHomeTree');
    expect(manifest.contributes.views['ascend-c-toolkit-sidebar'])
      .toBeDefined();
    expect(manifest.contributes.views['ascend-c-toolkit-dump-tensor-panel-view'])
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: 'ascendCToolkitDumpTensorPanelView' })]));
    expect(manifest.contributes.submenus.some((entry: { id: string }) => entry.id === 'ascendCToolkit.operator.debug'))
      .toBe(true);
    expect(manifest.contributes.submenus.some((entry: { id: string }) => entry.id === 'ascendCToolkit.operator.performance'))
      .toBe(true);
    expect(manifest.contributes.menus['explorer/context'].some((entry: { submenu?: string }) => entry.submenu === 'ascendCToolkit.operator.debug'))
      .toBe(true);

    expect(manifest.contributes.customEditors?.some((entry: { viewType: string }) => entry.viewType === 'ascendCToolkitCsvViewer'))
      .toBe(true);
    expect(manifest.contributes.menus['commandPalette'].some((entry: { when?: string }) => entry.when === 'ascendCToolkit.hasDevtoolConfig'))
      .toBe(true);
    expect(manifest.contributes.menus['editor/title'].every((entry: { when?: string }) => entry.when?.includes('ascendCToolkit.hasDevtoolConfig')))
      .toBe(true);

    const ascendOpen = manifest.contributes.commands.find(
      (c: { command: string }) => c.command === 'ascend-c-toolkit.open',
    );
    expect(ascendOpen?.category).toBe('%config.title%');

    const generated = fs.readFileSync(path.join(REPO_ROOT, 'shared/flavor/generated.ts'), 'utf8');

    expect(generated)
      .toContain("SETTINGS_PREFIX = 'ascendCToolkit'");
    expect(generated)
      .toContain("EXTENSION_ID = 'hicann.ascend-c-toolkit'");
    expect(generated)
      .toContain("'operatorSupport.triton': false");
    expect(generated)
      .toContain("DUMP_TENSOR_PANEL_VIEW_ID = 'ascendCToolkitDumpTensorPanelView'");
    expect(generated)
      .toContain("SUBMENU_OPERATOR_DEBUG_ID = 'ascendCToolkit.operator.debug'");
    expect(generated)
      .toContain("CSV_VIEWER_VIEW_TYPE = 'ascendCToolkitCsvViewer'");

    const nlsEn = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.nls.en.json'), 'utf8'));

    expect(nlsEn['config.category.operatorSupport.title'])
      .toBeUndefined();
    expect(nlsEn['config.op-devtools.operatorSupport.triton.description'])
      .toBeUndefined();
  });

  it('huawei re-apply after ascend restores gated manifest sections from git HEAD', () => {
    applyFlavor('ascend-c-toolkit');
    applyFlavor('huawei');

    const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));

    expect(manifest.name)
      .toBe('huawei-op-devtools-vscode-plugin');
    expect(manifest.contributes.configuration.some((c: { id: string }) => c.id === 'op-devtools.operatorSupport'))
      .toBe(true);
    expect(manifest.contributes.commands.some((c: { command: string }) => c.command === 'huawei-op-devtools.open'))
      .toBe(true);
    expect(manifest.scripts['package:all'])
      .toBe('tsx scripts/package-all-flavors.ts');
    expect(manifest.scripts['apply-flavor:huawei'])
      .toBe('tsx scripts/apply-flavor.ts huawei');
    expect(manifest.scripts['apply-flavor:ascend-c-toolkit'])
      .toBe('tsx scripts/apply-flavor.ts ascend-c-toolkit');
  });

  it('ascend-c-toolkit flavor applies branding to README and CHANGELOG', () => {
    applyFlavor('ascend-c-toolkit');

    const readme = fs.readFileSync(path.join(REPO_ROOT, 'README.md'), 'utf8');
    const readmeEn = fs.readFileSync(path.join(REPO_ROOT, 'README.en.md'), 'utf8');
    const changelog = fs.readFileSync(path.join(REPO_ROOT, 'CHANGELOG.md'), 'utf8');
    const changelogEn = fs.readFileSync(path.join(REPO_ROOT, 'CHANGELOG.en.md'), 'utf8');

    expect(readme.split(/\r?\n/)[0])
      .toBe('# Ascend C Toolkit');
    expect(readme)
      .toContain('**Ascend C Toolkit（Ascend C 工具包）**');
    expect(readmeEn.split(/\r?\n/)[0])
      .toBe('# Ascend C Toolkit – VS Code Extension');
    expect(readmeEn)
      .toContain('Ascend C Toolkit operator one-stop development platform');
    expect(changelog)
      .toContain('**Ascend C Toolkit（Ascend C 工具包）**');
    expect(changelogEn)
      .toContain('**Ascend C Toolkit**');
    expect(readme)
      .not.toContain('Huawei OP DevTools');
    expect(readme)
      .not.toMatch(/triton/i);
    expect(readmeEn)
      .not.toMatch(/triton/i);
  });

  it('huawei re-apply restores README and CHANGELOG from git HEAD', () => {
    applyFlavor('ascend-c-toolkit');
    applyFlavor('huawei');

    const readme = fs.readFileSync(path.join(REPO_ROOT, 'README.md'), 'utf8');
    const changelog = fs.readFileSync(path.join(REPO_ROOT, 'CHANGELOG.md'), 'utf8');

    expect(readme.split(/\r?\n/)[0])
      .toBe('# Huawei OP DevTools');
    expect(readme)
      .toContain('**Huawei OP DevTools（华为算子一站式开发工具）**');
    expect(changelog)
      .toContain('**Huawei OP DevTools（华为算子一站式开发工具）**');
  });

  it('huawei re-apply leaves flavor-overrides.ts unchanged when already normalized', () => {
    applyFlavor('ascend-c-toolkit');
    applyFlavor('huawei');

    const overridesPath = path.join(REPO_ROOT, 'shared/i18n/flavor-overrides.ts');
    const overridesAfterRestore = fs.readFileSync(overridesPath, 'utf8');

    applyFlavor('huawei');

    expect(fs.readFileSync(overridesPath, 'utf8'))
      .toBe(overridesAfterRestore);
    expect(overridesAfterRestore)
      .toContain("'web.welcome.platformTitle': 'OP DevTools operator one-stop development platform'");
  });
});

describe('flavor schema base ids', () => {
  it('matches huawei template prefixes', () => {
    expect(BASE_FLAVOR_IDS.commandPrefix)
      .toBe('huawei-op-devtools');
    expect(BASE_FLAVOR_IDS.settingsPrefix)
      .toBe('op-devtools');
    expect(BASE_FLAVOR_IDS.viewPrefix)
      .toBe('opdevtools');
  });
});
