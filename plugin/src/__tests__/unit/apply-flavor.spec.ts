/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  applyFlavor, restoreCommittedFlavorArtifacts,
} from '../../../../scripts/apply-flavor';
import { BASE_FLAVOR_IDS } from '../../../../flavors/schema';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const ASCEND_FLAVOR_PATH = path.join(REPO_ROOT, 'flavors', 'ascend-c-toolkit', 'flavor.json');

type AscendBranding = {
  productName: string;
  productNameZh: string;
  productTaglineEn: string;
  sidebarTitleEn: string;
  sidebarTitleZh: string;
};

function resolveTestLocale(): 'en' | 'zh-cn' {
  const raw = process.env.LC_ALL
    || process.env.LANG
    || Intl.DateTimeFormat()
      .resolvedOptions().locale
      || 'en';

  return /^zh([_.-]|$)/i.test(raw) ? 'zh-cn' : 'en';
}

function loadAscendBranding(): AscendBranding {
  const flavor = JSON.parse(fs.readFileSync(ASCEND_FLAVOR_PATH, 'utf8')) as {
    branding: AscendBranding;
  };

  return flavor.branding;
}

const CPP_INCLUDE_PATH_DEFAULTS = [
  '${workspaceFolder}/**',
  '${env:ASCEND_HOME_PATH}/include',
  '${env:ASCEND_HOME_PATH}/include/aclnn',
  '${env:ASCEND_HOME_PATH}/compiler/tikcpp',
  '${env:ASCEND_HOME_PATH}/compiler/tikcpp/tikcfw',
  '${env:ASCEND_HOME_PATH}/compiler/tikcpp/tikcfw/interface',
  '${env:ASCEND_HOME_PATH}/compiler/tikcpp/tikcfw/impl',
  '${env:ASCEND_HOME_PATH}/tools/tikicpulib/lib/include',
];
const CPP_BROWSE_PATH_DEFAULTS = [
  '${workspaceFolder}',
  '${env:ASCEND_HOME_PATH}/include',
  '${env:ASCEND_HOME_PATH}/compiler/tikcpp/tikcfw',
  '${env:ASCEND_HOME_PATH}/tools/tikicpulib/lib/include',
];

function expectCppLanguageSupportDefaults(manifest: Record<string, unknown>): void {
  const typedManifest = manifest as {
    extensionPack?: string[];
    contributes?: {
      configurationDefaults?: {
        'files.associations'?: Record<string, string>;
        'C_Cpp.default.includePath'?: string[];
        'C_Cpp.default.browse.path'?: string[];
      };
    };
  };
  const defaults = typedManifest.contributes?.configurationDefaults;

  // Microsoft C/C++ is offered at runtime only when no other C/C++ provider is
  // installed — see `cpp-extension-support.ts`.
  expect(typedManifest.extensionPack)
    .not.toContain('ms-vscode.cpptools');
  expect(defaults?.['files.associations'])
    .toEqual({
      '*.asc': 'cpp',
      '*.cce': 'cpp',
    });
  expect(defaults?.['C_Cpp.default.includePath'])
    .toEqual(CPP_INCLUDE_PATH_DEFAULTS);
  expect(defaults?.['C_Cpp.default.browse.path'])
    .toEqual(CPP_BROWSE_PATH_DEFAULTS);
  expect(defaults?.['C_Cpp.default.browse.path'])
    .not.toContain('${env:ASCEND_HOME_PATH}/compiler/tikcpp/**');
  expect([
    ...(defaults?.['C_Cpp.default.includePath'] ?? []),
    ...(defaults?.['C_Cpp.default.browse.path'] ?? []),
  ].filter((entry) => entry.startsWith('${env:ASCEND_HOME_PATH}') && entry.endsWith('/**')))
    .toEqual([]);
}

function inlineStopMenuWhen(manifest: Record<string, unknown>): string | undefined {
  const items = (manifest.contributes as {
    menus?: { 'view/item/context'?: Array<{ command?: string;
      when?: string;
      group?: string }> };
  }).menus?.['view/item/context'] ?? [];

  return items.find((entry) => entry.group === 'inline@1' && entry.command?.endsWith('.sidebar.stopFlowTask'))?.when;
}

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
    expectCppLanguageSupportDefaults(manifest);

    const openCommand = manifest.contributes.commands.find((c: { command: string }) => c.command === 'huawei-op-devtools.open');

    expect(openCommand?.category)
      .toBe('%config.title%');

    const sidebarBuild = manifest.contributes.commands.find((c: { command: string }) => c.command === 'huawei-op-devtools.sidebar.build');
    const hideSidebarBuild = manifest.contributes.menus.commandPalette.find((e: { command: string;
      when?: string }) => e.command === 'huawei-op-devtools.sidebar.build');

    expect(hideSidebarBuild?.when)
      .toBe('false');
    expect(sidebarBuild?.category)
      .toBeUndefined();

    const toggleOps = manifest.contributes.commands.find((c: { command: string }) => c.command === 'huawei-op-devtools.toggleOpsOperate');

    expect(toggleOps?.category)
      .toBe('%config.title%');
    const togglePalette = manifest.contributes.menus.commandPalette.find((e: { command: string;
      when?: string }) => e.command === 'huawei-op-devtools.toggleOpsOperate');

    expect(togglePalette?.when)
      .toBe('opDevtools.hasDevtoolConfig');

    const nlsEn = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.nls.en.json'), 'utf8'));

    expect(nlsEn['config.category.operatorSupport.title'])
      .toBe('Operator Support');
    expect(nlsEn['config.op-devtools.operatorSupport.triton.description'])
      .toBe('Enable Triton project support');
    expect(nlsEn['viewContainer.activitybar.title'])
      .toBe('Operator Development');
  });

  it('keeps the Ascend C language and grammar contributions in both flavors', () => {
    const expectAscendCLanguage = () => {
      const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));

      expect(manifest.contributes.languages)
        .toEqual([
          {
            id: 'ascend-c',
            aliases: [
              'Ascend C',
              'ascend-c',
            ],
            extensions: ['.asc'],
            icon: {
              light: './out/web/branding/language-ascend-c.svg',
              dark: './out/web/branding/language-ascend-c.svg',
            },
          },
        ]);
      expect(manifest.contributes.grammars)
        .toEqual([
          {
            language: 'ascend-c',
            scopeName: 'source.ascend-c',
            path: './syntaxes/ascend-c.tmLanguage.json',
          },
        ]);
    };

    applyFlavor('ascend-c-toolkit');
    expectAscendCLanguage();
    applyFlavor('huawei');
    expectAscendCLanguage();
  });

  it('substitutes escaped viewPrefix in inline stop menu regex for ascend-c-toolkit', () => {
    applyFlavor('ascend-c-toolkit');
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));

    expect(inlineStopMenuWhen(manifest))
      .toBe('view == ascendCToolkitOperateTree && viewItem =~ /ascendCToolkit\\.flowRunning/');
  });

  it('restores inline stop menu regex after ascend-c-toolkit round-trip', () => {
    applyFlavor('ascend-c-toolkit');
    applyFlavor('huawei');
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));

    expect(inlineStopMenuWhen(manifest))
      .toBe(`view == ${BASE_FLAVOR_IDS.viewPrefix}OperateTree && viewItem =~ /${BASE_FLAVOR_IDS.viewPrefix}\\.flowRunning/`);
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
      .toBe('asc-toolkit');
    expect(manifest.publisher)
      .toBe('cann-pub');
    expect(manifest.displayName)
      .toBe('Ascend C Toolkits');
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
    expectCppLanguageSupportDefaults(manifest);
    expect(manifest.activationEvents)
      .toContain('onView:ascendCToolkitHomeTree');
    expect(manifest.contributes.views['ascend-c-toolkit-sidebar'])
      .toBeDefined();
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

    const ascendOpen = manifest.contributes.commands.find((c: { command: string }) => c.command === 'ascend-c-toolkit.open');

    expect(ascendOpen?.category)
      .toBe('%config.title%');

    const generated = fs.readFileSync(path.join(REPO_ROOT, 'shared/flavor/generated.ts'), 'utf8');

    expect(generated)
      .toContain("SETTINGS_PREFIX = 'ascendCToolkit'");
    expect(generated)
      .toContain("EXTENSION_ID = 'cann-pub.asc-toolkit'");
    expect(generated)
      .toContain("'operatorSupport.triton': false");
    expect(generated)
      .toContain("DUMP_TENSOR_SIDEBAR_VIEW_ID = 'ascendCToolkitDumpTensorSidebarView'");
    expect(generated)
      .toContain("SUBMENU_OPERATOR_DEBUG_ID = 'ascendCToolkit.operator.debug'");
    expect(generated)
      .toContain("CSV_VIEWER_VIEW_TYPE = 'ascendCToolkitCsvViewer'");

    const nlsEn = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.nls.en.json'), 'utf8'));
    const nlsZh = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.nls.json'), 'utf8'));
    const branding = loadAscendBranding();
    const locale = resolveTestLocale();
    const localeSidebarTitle = locale === 'zh-cn'
      ? branding.sidebarTitleZh
      : branding.sidebarTitleEn;

    expect(nlsEn['config.category.operatorSupport.title'])
      .toBeUndefined();
    expect(nlsEn['config.op-devtools.operatorSupport.triton.description'])
      .toBeUndefined();
    expect(nlsEn['viewContainer.activitybar.title'])
      .toBe(branding.sidebarTitleEn);
    expect(nlsZh['viewContainer.activitybar.title'])
      .toBe(branding.sidebarTitleZh);
    expect((locale === 'zh-cn' ? nlsZh : nlsEn)['viewContainer.activitybar.title'])
      .toBe(localeSidebarTitle);
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

    const branding = loadAscendBranding();
    const zhIntro = `**${branding.productName}（${branding.productNameZh}）**`;
    const readme = fs.readFileSync(path.join(REPO_ROOT, 'README.md'), 'utf8');
    const readmeEn = fs.readFileSync(path.join(REPO_ROOT, 'README.en.md'), 'utf8');
    const changelog = fs.readFileSync(path.join(REPO_ROOT, 'CHANGELOG.md'), 'utf8');
    const changelogEn = fs.readFileSync(path.join(REPO_ROOT, 'CHANGELOG.en.md'), 'utf8');

    expect(readme.split(/\r?\n/)[0])
      .toBe(`# ${branding.productName}`);
    expect(readme)
      .toContain(zhIntro);
    expect(readmeEn.split(/\r?\n/)[0])
      .toMatch(new RegExp(`^# ${branding.productName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} [–-] VS Code Extension$`));
    expect(readmeEn)
      .toContain(branding.productName);

    // Tagline is substituted only when the Huawei baseline still contains the
    // base English tagline phrase; assert it when present after apply.
    if (readmeEn.includes(branding.productTaglineEn) || readmeEn.includes('Huawei operator one-stop development platform')) {
      expect(readmeEn)
        .toContain(branding.productTaglineEn);
    }

    expect(changelog)
      .toContain(zhIntro);
    expect(changelogEn)
      .toContain(`**${branding.productName}**`);
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
