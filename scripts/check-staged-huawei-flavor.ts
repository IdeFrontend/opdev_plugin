import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { BASE_FLAVOR_IDS } from '../flavors/schema';

const REPO_ROOT = path.resolve(__dirname, '..');

const GUARDED_PATHS = new Set([
  'package.json',
  'package.nls.json',
  'package.nls.en.json',
  'README.md',
  'README.en.md',
  'CHANGELOG.md',
  'CHANGELOG.en.md',
  'shared/flavor/generated.ts',
  'shared/i18n/flavor-overrides.ts',
]);

const ASCEND_MARKERS = [
  'ascend-c-toolkit',
  'ascendCToolkit',
  'cann-pub.asc-toolkit',
  'Ascend C Toolkits',
  'Ascend C 工具包',
] as const;

const HUAWEI_PACKAGE_IDENTITY = {
  name: 'huawei-op-devtools-vscode-plugin',
  publisher: 'huawei',
  displayName: 'Huawei OP DevTools',
} as const;

function getStagedPaths(): string[] {
  return execSync('git diff --cached --name-only --diff-filter=ACM', {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .map((line) => line.trim()
      .replace(/\\/g, '/'))
    .filter(Boolean);
}

function readStagedFile(relativePath: string): string {
  return execSync(`git show :${relativePath}`, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: [
      'ignore',
      'pipe',
      'pipe',
    ],
  });
}

function findAscendMarkers(content: string): string[] {
  return ASCEND_MARKERS.filter((marker) => content.includes(marker));
}

function validateManifestJson(content: string, label: string): string[] {
  const errors: string[] = [];

  try {
    const manifest = JSON.parse(content) as Record<string, unknown>;

    if (manifest.publisher !== HUAWEI_PACKAGE_IDENTITY.publisher) {
      errors.push(`${label} publisher must be "${HUAWEI_PACKAGE_IDENTITY.publisher}" (got "${manifest.publisher}")`);
    }

    if (manifest.name !== HUAWEI_PACKAGE_IDENTITY.name) {
      errors.push(`${label} name must be "${HUAWEI_PACKAGE_IDENTITY.name}" (got "${manifest.name}")`);
    }

    if (manifest.displayName !== HUAWEI_PACKAGE_IDENTITY.displayName) {
      errors.push(`${label} displayName must be "${HUAWEI_PACKAGE_IDENTITY.displayName}" (got "${manifest.displayName}")`);
    }

    const {
      scripts: _scripts, ...manifestWithoutScripts
    } = manifest;
    const markers = findAscendMarkers(JSON.stringify(manifestWithoutScripts));

    if (markers.length > 0) {
      errors.push(`${label} contains Ascend C Toolkits manifest content (${markers.join(', ')})`);
    }

    const configuration = (manifest.contributes as { configuration?: Array<{ id?: string }> } | undefined)?.configuration ?? [];
    const operatorSupportCategory = `${BASE_FLAVOR_IDS.settingsPrefix}.operatorSupport`;

    if (!configuration.some((category) => category.id === operatorSupportCategory)) {
      errors.push(`${label} missing configuration category "${operatorSupportCategory}"`);
    }

    for (const category of configuration) {
      const categoryId = category.id ?? '';

      if (categoryId.startsWith(`${BASE_FLAVOR_IDS.commandPrefix}.`)) {
        errors.push(`${label} configuration category "${categoryId}" uses commandPrefix; expected "${BASE_FLAVOR_IDS.settingsPrefix}.*"`);
      }
    }
  }
  catch {
    errors.push(`${label} is not valid JSON`);
  }

  return errors;
}

function validateGeneratedTs(content: string, label: string): string[] {
  const errors: string[] = [];

  if (findAscendMarkers(content).length > 0) {
    errors.push(`${label} contains Ascend C Toolkits runtime constants`);
  }

  if (!/FLAVOR_ID\s*=\s*['"]huawei['"]/.test(content)) {
    errors.push(`${label} must export FLAVOR_ID = "huawei"`);
  }

  if (!/EXTENSION_ID\s*=\s*['"]huawei\.huawei-op-devtools-vscode-plugin['"]/.test(content)) {
    errors.push(`${label} must export Huawei EXTENSION_ID`);
  }

  return errors;
}

export function validateGuardedFile(relativePath: string, content: string): string[] {
  if (relativePath === 'package.json') {
    return validateManifestJson(content, relativePath);
  }

  if (relativePath === 'shared/flavor/generated.ts') {
    return validateGeneratedTs(content, relativePath);
  }

  const markers = findAscendMarkers(content);

  if (markers.length > 0) {
    return [`${relativePath} contains Ascend C Toolkits content (${markers.join(', ')})`];
  }

  return [];
}

export function checkStagedHuaweiFlavor(): string[] {
  if (!fs.existsSync(path.join(REPO_ROOT, '.git'))) {
    return [];
  }

  const errors: string[] = [];

  for (const relativePath of getStagedPaths()) {
    if (!GUARDED_PATHS.has(relativePath)) {
      continue;
    }

    let content: string;

    try {
      content = readStagedFile(relativePath);
    }
    catch {
      continue;
    }

    errors.push(...validateGuardedFile(relativePath, content));
  }

  return errors;
}

function main(): void {
  const errors = checkStagedHuaweiFlavor();

  if (errors.length === 0) {
    return;
  }

  console.error('Commit blocked: staged files contain Ascend C Toolkits flavor artifacts.\n');

  for (const error of errors) {
    console.error(`  - ${error}`);
  }

  console.error('\nRestore the default Huawei flavor, then re-stage:\n');
  console.error('  pnpm run restore-flavor');
  console.error('  git add package.json package.nls.json package.nls.en.json README.md README.en.md CHANGELOG.md CHANGELOG.en.md shared/flavor/generated.ts shared/i18n/flavor-overrides.ts');

  process.exit(1);
}

if (process.argv[1]?.replace(/\\/g, '/')
  .endsWith('scripts/check-staged-huawei-flavor.ts')) {
  main();
}
