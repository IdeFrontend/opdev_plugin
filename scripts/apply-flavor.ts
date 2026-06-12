import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  BASE_FLAVOR_BRANDING,
  BASE_FLAVOR_IDS,
  buildCoInstallIds,
  buildFlavorDefaults,
  buildFlavorGates,
  FEATURE_CATALOG,
  KNOWN_FLAVOR_IDS,
  validateFlavorDefinition,
  type FlavorDefinition,
  type ManifestFilterRecipe,
} from '../flavors/schema';

const REPO_ROOT = path.resolve(__dirname, '..');

const HUAWEI_FLAVOR_ID = 'huawei';

const RESTORE_PATHS = [
  'package.json',
  'package.nls.json',
  'package.nls.en.json',
  'README.md',
  'README.en.md',
  'CHANGELOG.md',
  'CHANGELOG.en.md',
  'shared/flavor/generated.ts',
  'shared/i18n/flavor-overrides.ts',
] as const;

const FLAVOR_DOC_PATHS = [
  'README.md',
  'README.en.md',
  'CHANGELOG.md',
  'CHANGELOG.en.md',
] as const;

const VIEW_ID_SUFFIXES = [
  'HomeTree',
  'OperatorProjectsTree',
  'OperateTree',
  'SanitizerResultsTree',
  'PerformanceResultsTree',
] as const;

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/** Skip disk write when JSON content is unchanged (keeps git clean for Huawei default). */
function writeJsonIfChanged(filePath: string, value: unknown): boolean {
  const next = `${JSON.stringify(value, null, 2)}\n`;

  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === next) {
    return false;
  }

  writeJson(filePath, value);

  return true;
}

function writeTextIfChanged(filePath: string, content: string): boolean {
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === content) {
    return false;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');

  return true;
}

function resolveFlavorId(explicit?: string): string {
  return explicit ?? process.env.FLAVOR ?? 'huawei';
}

function loadGitHeadFile(relativePath: string): string | null {
  try {
    return execSync(`git show HEAD:${relativePath}`, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: [
        'ignore',
        'pipe',
        'ignore',
      ],
    });
  }
  catch {
    return null;
  }
}

function assertHuaweiBaselineManifest(manifest: Record<string, unknown>): void {
  const text = JSON.stringify(manifest);

  if (text.includes('ascend-c-toolkit') || text.includes('ascendCToolkit')) {
    throw new Error('package.json contains Ascend C Toolkit IDs and is not a valid Huawei baseline manifest. '
      + 'Run `pnpm run restore-flavor` or restore package.json from git history.');
  }

  const commands = (manifest.contributes as { commands?: Array<{ command?: string }> } | undefined)?.commands ?? [];
  const hasBaselineCommand = commands.some((entry) => entry.command?.startsWith(`${BASE_FLAVOR_IDS.commandPrefix}.`));

  if (!hasBaselineCommand) {
    throw new Error(`Committed package.json is not a Huawei baseline manifest (missing ${BASE_FLAVOR_IDS.commandPrefix}.* commands). `
      + 'Restore a valid Huawei package.json before running apply-flavor.');
  }

  const configuration = (manifest.contributes as {
    configuration?: Array<{ id?: string;
      properties?: Record<string, unknown> }>;
  } | undefined)?.configuration ?? [];

  const operatorSupportCategory = `${BASE_FLAVOR_IDS.settingsPrefix}.operatorSupport`;

  if (!configuration.some((category) => category.id === operatorSupportCategory)) {
    throw new Error(`Committed package.json is missing required configuration category "${operatorSupportCategory}". `
      + 'Restore the full Huawei manifest before running apply-flavor.');
  }

  for (const category of configuration) {
    const categoryId = category.id ?? '';

    if (categoryId.startsWith(`${BASE_FLAVOR_IDS.commandPrefix}.`)) {
      throw new Error(`Configuration category "${categoryId}" uses commandPrefix; expected "${BASE_FLAVOR_IDS.settingsPrefix}.*".`);
    }
  }
}

function tryNormalizeBaselineManifest(source: Record<string, unknown>): Record<string, unknown> | null {
  const normalized = normalizeManifestToBaseIds(source);

  try {
    assertHuaweiBaselineManifest(normalized);

    return normalized;
  }
  catch {
    return null;
  }
}

/** Load Huawei baseline manifest from git HEAD, falling back to disk when HEAD is invalid. */
function loadManifestTemplate(_flavorId: string): Record<string, unknown> {
  const packageJsonPath = path.join(REPO_ROOT, 'package.json');
  const fromGit = loadGitHeadFile('package.json');

  if (fromGit) {
    const baseline = tryNormalizeBaselineManifest(JSON.parse(fromGit) as Record<string, unknown>);

    if (baseline) {
      return baseline;
    }

    console.warn('[apply-flavor] git HEAD package.json is not a valid Huawei baseline; trying disk.');
  }

  if (fs.existsSync(packageJsonPath)) {
    const baseline = tryNormalizeBaselineManifest(readJson(packageJsonPath));

    if (baseline) {
      if (fromGit) {
        console.warn('[apply-flavor] Using valid Huawei baseline from disk. Commit a clean package.json to git HEAD.');
      }

      return baseline;
    }
  }

  throw new Error('No valid Huawei baseline package.json found in git HEAD or on disk. '
    + 'Run `pnpm run restore-flavor` or fix the committed Huawei manifest.');
}

export function restoreCommittedFlavorArtifacts(): void {
  execSync(`git restore ${RESTORE_PATHS.join(' ')}`, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });

  applyFlavor(HUAWEI_FLAVOR_ID);
}

function loadFlavor(flavorId: string): FlavorDefinition {
  const flavorPath = path.join(REPO_ROOT, 'flavors', flavorId, 'flavor.json');

  if (!fs.existsSync(flavorPath)) {
    throw new Error(`Unknown flavor "${flavorId}": missing ${flavorPath}`);
  }

  return validateFlavorDefinition(readJson(flavorPath));
}

function reverseSubstituteIdsInString(value: string, flavor: FlavorDefinition): string {
  let result = value;

  result = result.replaceAll(flavor.ids.commandPrefix, BASE_FLAVOR_IDS.commandPrefix);
  result = result.replaceAll(flavor.ids.settingsPrefix, BASE_FLAVOR_IDS.settingsPrefix);
  result = result.replaceAll(flavor.ids.viewContainerId, BASE_FLAVOR_IDS.viewContainerId);
  result = result.replaceAll(flavor.ids.contextPrefix, BASE_FLAVOR_IDS.contextPrefix);
  result = result.replaceAll(flavor.ids.colorIdPrefix, BASE_FLAVOR_IDS.colorIdPrefix);

  result = result.replaceAll(`${flavor.ids.viewPrefix}.`, `${BASE_FLAVOR_IDS.viewPrefix}.`);

  for (const suffix of VIEW_ID_SUFFIXES) {
    const from = `${flavor.ids.viewPrefix}${suffix}`;
    const to = `${BASE_FLAVOR_IDS.viewPrefix}${suffix}`;

    result = result.replaceAll(from, to);
  }

  result = result.replaceAll(
    `workbench.view.extension.${flavor.ids.viewContainerId}`,
    `workbench.view.extension.${BASE_FLAVOR_IDS.viewContainerId}`,
  );

  return reverseSubstituteCoInstallIdsInString(result, flavor);
}

/** Context keys that were historically unprefixed in package.json when clauses. */
const LEGACY_BARE_CONTEXT_KEYS = [
  'hasDevtoolConfig',
  'operatorProjectMarked',
  'multiOperatorProjectMarked',
  'operatorProjectType',
] as const;

function normalizeLegacyContextKeysInString(value: string): string {
  let result = value;
  const escapedPrefix = BASE_FLAVOR_IDS.contextPrefix.replace('.', '\\.');

  for (const key of LEGACY_BARE_CONTEXT_KEYS) {
    const pattern = new RegExp(`(?<!${escapedPrefix}\\.)(?<![\\w.])${key}(?![\\w.])`, 'g');

    result = result.replace(pattern, `${BASE_FLAVOR_IDS.contextPrefix}.${key}`);
  }

  return result;
}

function normalizeLegacyContextKeysDeep<T>(value: T): T {
  if (typeof value === 'string') {
    return normalizeLegacyContextKeysInString(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeLegacyContextKeysDeep(item)) as T;
  }

  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};

    for (const [
      key,
      nested,
    ] of Object.entries(value)) {
      output[normalizeLegacyContextKeysInString(key)] = normalizeLegacyContextKeysDeep(nested);
    }

    return output as T;
  }

  return value;
}

function reverseSubstituteIdsDeep<T>(value: T, flavor: FlavorDefinition): T {
  if (typeof value === 'string') {
    return reverseSubstituteIdsInString(value, flavor) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => reverseSubstituteIdsDeep(item, flavor)) as T;
  }

  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};

    for (const [
      key,
      nested,
    ] of Object.entries(value)) {
      const nextKey = reverseSubstituteIdsInString(key, flavor);

      output[nextKey] = reverseSubstituteIdsDeep(nested, flavor);
    }

    return output as T;
  }

  return value;
}

/** Undo substitutions from any previously applied flavor so git HEAD drift stays recoverable. */
function normalizeManifestToBaseIds(manifest: Record<string, unknown>): Record<string, unknown> {
  let normalized = structuredClone(manifest);

  for (const flavorId of KNOWN_FLAVOR_IDS) {
    if (flavorId === HUAWEI_FLAVOR_ID) {
      continue;
    }

    const flavor = loadFlavor(flavorId);

    normalized = reverseSubstituteIdsDeep(normalized, flavor);
  }

  return normalizeLegacyContextKeysDeep(normalized);
}

function substituteCoInstallIdsInString(value: string, flavor: FlavorDefinition): string {
  const from = buildCoInstallIds(BASE_FLAVOR_IDS);
  const to = buildCoInstallIds(flavor.ids);
  let result = value;

  for (const key of Object.keys(from) as Array<keyof typeof from>) {
    result = result.replaceAll(from[key], to[key]);
  }

  return result;
}

function normalizeLegacyCoInstallToken(value: string): string {
  const to = buildCoInstallIds(BASE_FLAVOR_IDS);
  const legacyMap: Record<string, string> = {
    'dump-tensor-panel-view': to.dumpTensorPanelContainerId,
    dumpTensorPanelView: to.dumpTensorPanelViewId,
    dumpTensorSidebarView: to.dumpTensorSidebarViewId,
    'operator.debug': to.submenuOperatorDebugId,
    'operator.performance': to.submenuOperatorPerformanceId,
    csvViewer: to.csvViewerViewType,
    pluginSidebar: to.pluginSidebarViewType,
    mindstudioOpsuite: to.mindstudioOpsuitePanelType,
    insightDataViewer: to.insightDataViewerPanelType,
    'csv-viewer.openCsv': to.openCsvCommandId,
    'extension.jsonButtonAction': to.jsonButtonActionCommandId,
    vscodeJumpToFile: to.vscodeJumpToFileCommandId,
  };

  return legacyMap[value] ?? value;
}

function reverseSubstituteCoInstallIdsInString(value: string, flavor: FlavorDefinition): string {
  const from = buildCoInstallIds(flavor.ids);
  const to = buildCoInstallIds(BASE_FLAVOR_IDS);
  let result = value;

  for (const key of Object.keys(from) as Array<keyof typeof from>) {
    result = result.replaceAll(from[key], to[key]);
  }

  return normalizeLegacyCoInstallToken(result);
}

function substituteIdsInString(value: string, flavor: FlavorDefinition): string {
  let result = value;

  result = result.replaceAll(BASE_FLAVOR_IDS.commandPrefix, flavor.ids.commandPrefix);
  result = result.replaceAll(BASE_FLAVOR_IDS.viewContainerId, flavor.ids.viewContainerId);
  result = result.replaceAll(BASE_FLAVOR_IDS.contextPrefix, flavor.ids.contextPrefix);
  result = result.replaceAll(BASE_FLAVOR_IDS.colorIdPrefix, flavor.ids.colorIdPrefix);
  result = result.replaceAll(BASE_FLAVOR_IDS.settingsPrefix, flavor.ids.settingsPrefix);

  result = result.replaceAll(`${BASE_FLAVOR_IDS.viewPrefix}.`, `${flavor.ids.viewPrefix}.`);

  for (const suffix of VIEW_ID_SUFFIXES) {
    const from = `${BASE_FLAVOR_IDS.viewPrefix}${suffix}`;
    const to = `${flavor.ids.viewPrefix}${suffix}`;

    result = result.replaceAll(from, to);
  }

  // workbench.view.extension.{viewContainerId}
  result = result.replaceAll(
    `workbench.view.extension.${BASE_FLAVOR_IDS.viewContainerId}`,
    `workbench.view.extension.${flavor.ids.viewContainerId}`,
  );

  return substituteCoInstallIdsInString(result, flavor);
}

function substituteIdsDeep<T>(value: T, flavor: FlavorDefinition): T {
  if (typeof value === 'string') {
    return substituteIdsInString(value, flavor) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => substituteIdsDeep(item, flavor)) as T;
  }

  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};

    for (const [
      key,
      nested,
    ] of Object.entries(value)) {
      const nextKey = substituteIdsInString(key, flavor);

      output[nextKey] = substituteIdsDeep(nested, flavor);
    }

    return output as T;
  }

  return value;
}

function matchesAny(value: string, patterns?: string[]): boolean {
  if (!patterns?.length) {
    return false;
  }

  return patterns.some((pattern) => value.includes(pattern));
}

function shouldRemoveCommand(command: string, recipe: ManifestFilterRecipe): boolean {
  return matchesAny(command, recipe.commandSubstrings);
}

function shouldRemoveView(viewId: string, recipe: ManifestFilterRecipe, viewPrefix: string): boolean {
  return recipe.viewIds?.some((suffix) => viewId === `${viewPrefix}${suffix}`) ?? false;
}

function filterManifestByRecipe(manifest: Record<string, unknown>, recipe: ManifestFilterRecipe, flavor: FlavorDefinition): void {
  const contributes = manifest.contributes as Record<string, unknown> | undefined;

  if (!contributes) {
    return;
  }

  if (Array.isArray(contributes.commands)) {
    contributes.commands = contributes.commands.filter((entry) => {
      const command = (entry as { command?: string }).command ?? '';

      return !shouldRemoveCommand(command, recipe);
    });
  }

  if (contributes.menus && typeof contributes.menus === 'object') {
    for (const [
      menuKey,
      menuItems,
    ] of Object.entries(contributes.menus as Record<string, unknown[]>)) {
      contributes.menus = contributes.menus ?? {};
      (contributes.menus as Record<string, unknown[]>)[menuKey] = (menuItems ?? []).filter((item) => {
        const command = (item as { command?: string }).command ?? '';
        const submenu = (item as { submenu?: string }).submenu ?? '';

        return !matchesAny(command, recipe.menuCommandSubstrings)
          && !matchesAny(submenu, recipe.menuCommandSubstrings);
      });
    }
  }

  if (contributes.views && typeof contributes.views === 'object') {
    for (const [
      containerId,
      views,
    ] of Object.entries(contributes.views as Record<string, unknown[]>)) {
      if (recipe.viewContainerIds?.includes(containerId)) {
        delete (contributes.views as Record<string, unknown[]>)[containerId];
        continue;
      }

      (contributes.views as Record<string, unknown[]>)[containerId] = (views ?? []).filter((view) => {
        const viewId = (view as { id?: string }).id ?? '';

        return !shouldRemoveView(viewId, recipe, flavor.ids.viewPrefix);
      });
    }
  }

  if (contributes.viewsContainers && typeof contributes.viewsContainers === 'object') {
    for (const [
      containerType,
      containers,
    ] of Object.entries(contributes.viewsContainers as Record<string, unknown[]>)) {
      (contributes.viewsContainers as Record<string, unknown[]>)[containerType] = (containers ?? []).filter((container) => {
        const id = (container as { id?: string }).id ?? '';

        return !recipe.viewContainerIds?.includes(id);
      });
    }
  }

  if (Array.isArray(contributes.configuration)) {
    contributes.configuration = contributes.configuration.filter((category) => {
      const categoryId = (category as { id?: string }).id ?? '';

      if (recipe.configurationCategoryIds?.some((part) => categoryId.includes(part))) {
        return false;
      }

      const properties = (category as { properties?: Record<string, unknown> }).properties;

      if (properties) {
        for (const propertyKey of Object.keys(properties)) {
          if (recipe.configurationPropertyPrefixes?.some((prefix) => propertyKey.includes(prefix))) {
            delete properties[propertyKey];
          }
        }

        if (Object.keys(properties).length === 0) {
          return false;
        }
      }

      return true;
    });
  }

  if (Array.isArray(manifest.activationEvents)) {
    manifest.activationEvents = (manifest.activationEvents as string[]).filter((event) => {
      return !matchesAny(event, recipe.activationEventSubstrings);
    });
  }
}

function applyFeatureGates(manifest: Record<string, unknown>, flavor: FlavorDefinition): void {
  const gates = buildFlavorGates(flavor.features);

  for (const [
    featureKey,
    enabled,
  ] of Object.entries(gates)) {
    if (enabled) {
      continue;
    }

    const recipe = FEATURE_CATALOG[featureKey]?.manifestFilter;

    if (recipe) {
      filterManifestByRecipe(manifest, recipe, flavor);
    }
  }
}

function applyFeatureDefaults(manifest: Record<string, unknown>, flavor: FlavorDefinition): void {
  const defaults = buildFlavorDefaults(flavor.features);
  const contributes = manifest.contributes as { configuration?: Array<{ properties?: Record<string, { default?: unknown }> }> } | undefined;

  if (!contributes?.configuration) {
    return;
  }

  for (const category of contributes.configuration) {
    const properties = category.properties;

    if (!properties) {
      continue;
    }

    for (const [
      propertyKey,
      propertySchema,
    ] of Object.entries(properties)) {
      for (const [
        featureKey,
        defaultValue,
      ] of Object.entries(defaults)) {
        if (propertyKey.endsWith(`.${featureKey}`)) {
          propertySchema.default = defaultValue;
        }
      }
    }
  }
}

function substituteNlsRecord(record: Record<string, string>, flavor: FlavorDefinition): Record<string, string> {
  const output: Record<string, string> = {};

  for (const [
    key,
    value,
  ] of Object.entries(record)) {
    output[substituteIdsInString(key, flavor)] = substituteIdsInString(value, flavor);
  }

  return output;
}

function mergeNls(basePath: string, flavorPath: string | undefined, flavor: FlavorDefinition, locale: 'en' | 'zh-cn'): Record<string, string> {
  const merged = fs.existsSync(basePath) ? substituteNlsRecord(readJson<Record<string, string>>(basePath), flavor) : {};

  if (flavorPath && fs.existsSync(flavorPath)) {
    Object.assign(merged, substituteNlsRecord(readJson<Record<string, string>>(flavorPath), flavor));
  }

  merged['config.title'] = flavor.branding.productName;

  const sidebarTitle = locale === 'en'
    ? flavor.branding.sidebarTitleEn
    : flavor.branding.sidebarTitleZh;

  if (sidebarTitle) {
    merged['viewContainer.activitybar.title'] = sidebarTitle;
  }

  const jsonOverrides = flavor.i18nOverrides?.[locale] ?? {};

  for (const [
    key,
    value,
  ] of Object.entries(jsonOverrides)) {
    if (key.startsWith('config.')) {
      merged[key] = value;
    }
  }

  return merged;
}

function shouldRemoveNlsKey(key: string, recipe: ManifestFilterRecipe): boolean {
  if (recipe.configurationCategoryIds?.some((part) => key.includes(`category.${part}`) || key.includes(`.${part}.`))) {
    return true;
  }

  if (recipe.configurationPropertyPrefixes?.some((prefix) => key.includes(prefix))) {
    return true;
  }

  return false;
}

function filterNlsForGatedFeatures(nls: Record<string, string>, flavor: FlavorDefinition): Record<string, string> {
  const gates = buildFlavorGates(flavor.features);
  const output = { ...nls };

  for (const [
    featureKey,
    enabled,
  ] of Object.entries(gates)) {
    if (enabled) {
      continue;
    }

    const recipe = FEATURE_CATALOG[featureKey]?.manifestFilter;

    if (!recipe) {
      continue;
    }

    for (const key of Object.keys(output)) {
      if (shouldRemoveNlsKey(key, recipe)) {
        delete output[key];
      }
    }
  }

  return output;
}

function copyBrandingAssets(flavor: FlavorDefinition): void {
  const sourceDir = path.join(REPO_ROOT, 'flavors', flavor.id, 'branding');
  const stagingDir = path.join(REPO_ROOT, 'web', '.flavor', 'branding');

  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Missing branding directory for flavor ${flavor.id}: ${sourceDir}`);
  }

  fs.rmSync(stagingDir, {
    force: true,
    recursive: true,
  });
  fs.mkdirSync(stagingDir, { recursive: true });
  fs.cpSync(sourceDir, stagingDir, { recursive: true });
}

function tsQuotedString(value: string): string {
  if (!value.includes('\'')) {
    return `'${value}'`;
  }

  return JSON.stringify(value);
}

function tsCompactConstObject(obj: Record<string, boolean>): string {
  if (Object.keys(obj).length === 0) {
    return '{}';
  }

  const entries = Object.entries(obj)
    .map(([
      key,
      val,
    ]) => `'${key}': ${val}`);

  return `{ ${entries.join(', ')} }`;
}

function tsStringRecordObject(record: Record<string, string>): string {
  if (Object.keys(record).length === 0) {
    return '{}';
  }

  const entries = Object.entries(record)
    .map(([
      key,
      value,
    ]) => `'${key}': ${tsQuotedString(value)}`);

  return `{ ${entries.join(', ')} }`;
}

function tsBrandingObject(branding: Record<string, string>): string {
  const lines = Object.entries(branding)
    .map(([
      key,
      value,
    ]) => `  '${key}': ${tsQuotedString(value)},`);

  return `{\n${lines.join('\n')}\n}`;
}

function generateFlavorModule(flavor: FlavorDefinition): string {
  const gates = buildFlavorGates(flavor.features);
  const defaults = buildFlavorDefaults(flavor.features);

  return `/** Generated by scripts/apply-flavor.ts — do not edit manually */
export const FLAVOR_ID = ${tsQuotedString(flavor.id)};

export const COMMAND_PREFIX = ${tsQuotedString(flavor.ids.commandPrefix)};

export const SETTINGS_PREFIX = ${tsQuotedString(flavor.ids.settingsPrefix)};

export const VIEW_CONTAINER_ID = ${tsQuotedString(flavor.ids.viewContainerId)};

export const VIEW_PREFIX = ${tsQuotedString(flavor.ids.viewPrefix)};

export const CONTEXT_PREFIX = ${tsQuotedString(flavor.ids.contextPrefix)};

export const COLOR_ID_PREFIX = ${tsQuotedString(flavor.ids.colorIdPrefix)};

export const FLAVOR_GATES = ${tsCompactConstObject(gates)} as const;

export const FLAVOR_DEFAULTS = ${tsCompactConstObject(defaults)} as const;

export const BRANDING = ${tsBrandingObject(flavor.branding)} as const;

export const EXTENSION_ID = ${tsQuotedString(`${flavor.manifest.publisher}.${flavor.manifest.name}`)};

export const TREE_VIEW_HOME = ${tsQuotedString(`${flavor.ids.viewPrefix}HomeTree`)};

export const TREE_VIEW_OPERATE = ${tsQuotedString(`${flavor.ids.viewPrefix}OperateTree`)};

export const TREE_VIEW_OPERATOR_PROJECTS = ${tsQuotedString(`${flavor.ids.viewPrefix}OperatorProjectsTree`)};

export const TREE_VIEW_SANITIZER_RESULTS = ${tsQuotedString(`${flavor.ids.viewPrefix}SanitizerResultsTree`)};

export const TREE_VIEW_PERFORMANCE_RESULTS = ${tsQuotedString(`${flavor.ids.viewPrefix}PerformanceResultsTree`)};

export const DUMP_TENSOR_PANEL_CONTAINER_ID = ${tsQuotedString(buildCoInstallIds(flavor.ids).dumpTensorPanelContainerId)};

export const DUMP_TENSOR_PANEL_VIEW_ID = ${tsQuotedString(buildCoInstallIds(flavor.ids).dumpTensorPanelViewId)};

export const DUMP_TENSOR_SIDEBAR_VIEW_ID = ${tsQuotedString(buildCoInstallIds(flavor.ids).dumpTensorSidebarViewId)};

export const SUBMENU_OPERATOR_DEBUG_ID = ${tsQuotedString(buildCoInstallIds(flavor.ids).submenuOperatorDebugId)};

export const SUBMENU_OPERATOR_PERFORMANCE_ID = ${tsQuotedString(buildCoInstallIds(flavor.ids).submenuOperatorPerformanceId)};

export const CSV_VIEWER_VIEW_TYPE = ${tsQuotedString(buildCoInstallIds(flavor.ids).csvViewerViewType)};

export const PLUGIN_SIDEBAR_VIEW_TYPE = ${tsQuotedString(buildCoInstallIds(flavor.ids).pluginSidebarViewType)};

export const MINDSTUDIO_OPSUITE_PANEL_TYPE = ${tsQuotedString(buildCoInstallIds(flavor.ids).mindstudioOpsuitePanelType)};

export const INSIGHT_DATA_VIEWER_PANEL_TYPE = ${tsQuotedString(buildCoInstallIds(flavor.ids).insightDataViewerPanelType)};

export const COMMAND_OPEN_CSV_ID = ${tsQuotedString(buildCoInstallIds(flavor.ids).openCsvCommandId)};

export const COMMAND_JSON_BUTTON_ACTION_ID = ${tsQuotedString(buildCoInstallIds(flavor.ids).jsonButtonActionCommandId)};

export const COMMAND_VSCODE_JUMP_TO_FILE_ID = ${tsQuotedString(buildCoInstallIds(flavor.ids).vscodeJumpToFileCommandId)};
`;
}

function generateI18nOverrides(flavor: FlavorDefinition): string {
  const en = flavor.i18nOverrides?.en ?? {};
  const zhCn = flavor.i18nOverrides?.['zh-cn'] ?? {};

  return `/** Generated by scripts/apply-flavor.ts — do not edit manually */
export const flavorI18nOverrides = {
  en: ${tsStringRecordObject(en)} as const,
  'zh-cn': ${tsStringRecordObject(zhCn)} as const,
  'zh-CN': ${tsStringRecordObject(zhCn)} as const,
};
`;
}

function applyManifestFields(manifest: Record<string, unknown>, flavor: FlavorDefinition): void {
  manifest.name = flavor.manifest.name;
  manifest.displayName = flavor.manifest.displayName;
  manifest.publisher = flavor.manifest.publisher;
  manifest.description = flavor.manifest.description;
}

/** Keep the working-tree version; flavor apply only rewrites identity/contributes fields. */
function preservePackageVersionFromDisk(manifest: Record<string, unknown>): void {
  const packageJsonPath = path.join(REPO_ROOT, 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    return;
  }

  const { version } = readJson<{ version?: unknown }>(packageJsonPath);

  if (typeof version === 'string' && version.length > 0) {
    manifest.version = version;
  }
}

/** Keep npm scripts from the working tree; package.json scripts are edited directly, not via flavor.json. */
function preservePackageScriptsFromDisk(manifest: Record<string, unknown>): void {
  const packageJsonPath = path.join(REPO_ROOT, 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    return;
  }

  const { scripts } = readJson<{ scripts?: Record<string, string> }>(packageJsonPath);

  if (scripts && typeof scripts === 'object') {
    manifest.scripts = scripts;
  }
}

const COMMAND_PALETTE_PRODUCT_CATEGORY = '%config.title%';

type CommandContribution = {
  command: string;
  category?: string;
};

type CommandPaletteEntry = {
  command: string;
  when?: string;
};

function shouldHideCommandFromPalette(commandId: string): boolean {
  return commandId.endsWith('.vscodeJumpToFile')
    || commandId.includes('.sidebar.')
    || commandId.includes('.operate.');
}

/**
 * Command-palette entries use "Category: Title". UI-only commands (sidebar trees,
 * overflow menus) are hidden; every other contributed command gets the flavored
 * product name as category (%config.title% → e.g. Huawei OP DevTools).
 */
function applyCommandPalettePolicy(manifest: Record<string, unknown>): void {
  const contributes = manifest.contributes as {
    commands?: CommandContribution[];
    menus?: { commandPalette?: CommandPaletteEntry[] };
  } | undefined;

  if (!contributes?.commands) {
    return;
  }

  const menus = contributes.menus ?? {};
  const commandPalette: CommandPaletteEntry[] = [...(menus.commandPalette ?? [])];
  const paletteIndex = new Map(commandPalette.map((entry, index) => [entry.command, index]));

  for (const cmd of contributes.commands) {
    if (shouldHideCommandFromPalette(cmd.command)) {
      const existingIndex = paletteIndex.get(cmd.command);

      if (existingIndex === undefined) {
        commandPalette.push({ command: cmd.command, when: 'false' });
        paletteIndex.set(cmd.command, commandPalette.length - 1);
      }
      else {
        commandPalette[existingIndex] = { command: cmd.command, when: 'false' };
      }

      continue;
    }

    cmd.category = COMMAND_PALETTE_PRODUCT_CATEGORY;
  }

  contributes.menus = { ...menus, commandPalette };
}

function resolveDocBranding(flavor: FlavorDefinition): {
  productName: string;
  productNameZh: string;
  productTaglineEn: string;
} {
  return {
    productName: flavor.branding.productName,
    productNameZh: flavor.branding.productNameZh ?? flavor.branding.productName,
    productTaglineEn: flavor.branding.productTaglineEn ?? BASE_FLAVOR_BRANDING.productTaglineEn,
  };
}

export function applyBrandingToDocs(text: string, flavor: FlavorDefinition): string {
  const from = BASE_FLAVOR_BRANDING;
  const to = resolveDocBranding(flavor);
  let result = text;

  result = result.replaceAll(
    `${from.productName}（${from.productNameZh}）`,
    `${to.productName}（${to.productNameZh}）`,
  );
  result = result.replaceAll(
    `${from.productName} – VS Code Extension`,
    `${to.productName} – VS Code Extension`,
  );
  result = result.replaceAll(from.productTaglineEn, to.productTaglineEn);
  result = result.replaceAll(from.productName, to.productName);

  return result;
}

function reverseBrandingInDocs(text: string, flavor: FlavorDefinition): string {
  const from = resolveDocBranding(flavor);
  const to = BASE_FLAVOR_BRANDING;
  let result = text;

  result = result.replaceAll(
    `${from.productName}（${from.productNameZh}）`,
    `${to.productName}（${to.productNameZh}）`,
  );
  result = result.replaceAll(
    `${from.productName} – VS Code Extension`,
    `${to.productName} – VS Code Extension`,
  );
  result = result.replaceAll(from.productTaglineEn, to.productTaglineEn);
  result = result.replaceAll(from.productName, to.productName);

  return result;
}

function normalizeDocsToBaseBranding(text: string): string {
  let normalized = text;

  for (const flavorId of KNOWN_FLAVOR_IDS) {
    if (flavorId === HUAWEI_FLAVOR_ID) {
      continue;
    }

    normalized = reverseBrandingInDocs(normalized, loadFlavor(flavorId));
  }

  return normalized;
}

function assertHuaweiBaselineDoc(text: string, relativePath: string): void {
  if (text.includes('Ascend C Toolkit') || text.includes('Ascend C 工具包')) {
    throw new Error(`${relativePath} contains Ascend C Toolkit branding and is not a valid Huawei baseline doc. `
      + 'Run `pnpm run restore-flavor` or fix the committed doc on git HEAD.');
  }

  if (!text.includes(BASE_FLAVOR_BRANDING.productName)) {
    throw new Error(`${relativePath} is not a Huawei baseline doc (missing "${BASE_FLAVOR_BRANDING.productName}"). `
      + 'Restore the committed Huawei doc before running apply-flavor.');
  }
}

function tryNormalizeBaselineDoc(source: string, relativePath: string): string | null {
  const normalized = normalizeDocsToBaseBranding(source);

  try {
    assertHuaweiBaselineDoc(normalized, relativePath);

    return normalized;
  }
  catch {
    return null;
  }
}

/** Load committed Huawei doc from git HEAD, falling back to disk when HEAD is invalid. */
function loadDocTemplate(relativePath: string): string {
  const diskPath = path.join(REPO_ROOT, relativePath);
  const fromGit = loadGitHeadFile(relativePath);

  if (fromGit) {
    const baseline = tryNormalizeBaselineDoc(fromGit, relativePath);

    if (baseline) {
      return baseline;
    }

    console.warn(`[apply-flavor] git HEAD ${relativePath} is not a valid Huawei baseline; trying disk.`);
  }

  if (fs.existsSync(diskPath)) {
    const baseline = tryNormalizeBaselineDoc(fs.readFileSync(diskPath, 'utf8'), relativePath);

    if (baseline) {
      if (fromGit) {
        console.warn(`[apply-flavor] Using valid Huawei baseline from disk for ${relativePath}. Commit clean docs to git HEAD.`);
      }

      return baseline;
    }
  }

  throw new Error(`No valid Huawei baseline found for ${relativePath} in git HEAD or on disk. `
    + 'Run `pnpm run restore-flavor` or fix the committed Huawei doc.');
}

function applyFlavorDocs(flavor: FlavorDefinition): void {
  for (const relativePath of FLAVOR_DOC_PATHS) {
    const branded = applyBrandingToDocs(loadDocTemplate(relativePath), flavor);
    const content = filterDocsForGatedFeatures(branded, flavor);

    writeTextIfChanged(path.join(REPO_ROOT, relativePath), content);
  }
}

function filterDocsForGatedFeatures(text: string, flavor: FlavorDefinition): string {
  const gates = buildFlavorGates(flavor.features);
  let output = text;

  for (const [
    featureKey,
    enabled,
  ] of Object.entries(gates)) {
    if (enabled) {
      continue;
    }

    const recipe = FEATURE_CATALOG[featureKey]?.docFilter;

    if (!recipe) {
      continue;
    }

    for (const {
      from, to,
    } of recipe.replacements ?? []) {
      output = output.replaceAll(from, to);
    }

    if (recipe.removeLineSubstrings?.length) {
      output = output
        .split('\n')
        .filter((line) => !recipe.removeLineSubstrings!.some((substring) => line.includes(substring)))
        .join('\n');
    }
  }

  return output;
}

export function applyFlavor(flavorId?: string): FlavorDefinition {
  const id = resolveFlavorId(flavorId);
  const flavor = loadFlavor(id);
  const manifest = loadManifestTemplate(id);

  applyManifestFields(manifest, flavor);
  const substituted = substituteIdsDeep(manifest, flavor);

  applyFeatureGates(substituted, flavor);
  applyFeatureDefaults(substituted, flavor);
  preservePackageVersionFromDisk(substituted);
  preservePackageScriptsFromDisk(substituted);
  applyCommandPalettePolicy(substituted);

  writeJsonIfChanged(path.join(REPO_ROOT, 'package.json'), substituted);

  const nlsBaseEn = path.join(REPO_ROOT, 'package.nls.base.en.json');
  const nlsBaseZh = path.join(REPO_ROOT, 'package.nls.base.json');
  const flavorNlsEn = path.join(REPO_ROOT, 'flavors', flavor.id, 'nls', 'en.json');
  const flavorNlsZh = path.join(REPO_ROOT, 'flavors', flavor.id, 'nls', 'zh-cn.json');

  writeJsonIfChanged(
    path.join(REPO_ROOT, 'package.nls.en.json'),
    filterNlsForGatedFeatures(mergeNls(nlsBaseEn, flavorNlsEn, flavor, 'en'), flavor),
  );
  writeJsonIfChanged(
    path.join(REPO_ROOT, 'package.nls.json'),
    filterNlsForGatedFeatures(mergeNls(nlsBaseZh, flavorNlsZh, flavor, 'zh-cn'), flavor),
  );

  copyBrandingAssets(flavor);

  const flavorGeneratedPath = path.join(REPO_ROOT, 'shared', 'flavor', 'generated.ts');

  writeTextIfChanged(flavorGeneratedPath, generateFlavorModule(flavor));

  const i18nOverridesPath = path.join(REPO_ROOT, 'shared', 'i18n', 'flavor-overrides.ts');

  writeTextIfChanged(i18nOverridesPath, generateI18nOverrides(flavor));

  applyFlavorDocs(flavor);

  console.log(`[apply-flavor] Applied flavor "${flavor.id}" → ${flavor.manifest.publisher}.${flavor.manifest.name}`);

  return flavor;
}

if (process.argv[1]?.replace(/\\/g, '/')
  .endsWith('scripts/apply-flavor.ts')) {
  if (process.argv[2] === '--restore') {
    restoreCommittedFlavorArtifacts();
  }
  else {
    applyFlavor(process.argv[2]);
  }
}
