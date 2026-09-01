/**
 * Flavor schema and feature catalog for multi-brand VSIX builds.
 * Base IDs match the committed Huawei manifest in package.json.
 */

export const BASE_FLAVOR_IDS = {
  commandPrefix: 'huawei-op-devtools',
  settingsPrefix: 'op-devtools',
  viewContainerId: 'mindstudio-opssuite-vscode-plugin',
  viewPrefix: 'opdevtools',
  contextPrefix: 'opDevtools',
} as const;

/** IDs that must differ per flavor when both extensions are installed in one VS Code. */
export const BASE_CO_INSTALL_IDS = {
  dumpTensorPanelContainerId: 'huawei-op-devtools-dump-tensor-panel-view',
  dumpTensorPanelViewId: 'opdevtoolsDumpTensorPanelView',
  dumpTensorSidebarViewId: 'opdevtoolsDumpTensorSidebarView',
  submenuOperatorDebugId: 'opdevtools.operator.debug',
  submenuOperatorPerformanceId: 'opdevtools.operator.performance',
  csvViewerViewType: 'opdevtoolsCsvViewer',
  pluginSidebarViewType: 'opdevtoolsPluginSidebar',
  mindstudioOpsuitePanelType: 'opdevtoolsMindstudioOpsuite',
  insightDataViewerPanelType: 'opdevtoolsInsightDataViewer',
  openCsvCommandId: 'huawei-op-devtools.openCsv',
  jsonButtonActionCommandId: 'huawei-op-devtools.jsonButtonAction',
  vscodeJumpToFileCommandId: 'huawei-op-devtools.vscodeJumpToFile',
} as const;

export type CoInstallIds = typeof BASE_CO_INSTALL_IDS;

export function buildCoInstallIds(ids: FlavorIds): CoInstallIds {
  return {
    dumpTensorPanelContainerId: `${ids.commandPrefix}-dump-tensor-panel-view`,
    dumpTensorPanelViewId: `${ids.viewPrefix}DumpTensorPanelView`,
    dumpTensorSidebarViewId: `${ids.viewPrefix}DumpTensorSidebarView`,
    submenuOperatorDebugId: `${ids.viewPrefix}.operator.debug`,
    submenuOperatorPerformanceId: `${ids.viewPrefix}.operator.performance`,
    csvViewerViewType: `${ids.viewPrefix}CsvViewer`,
    pluginSidebarViewType: `${ids.viewPrefix}PluginSidebar`,
    mindstudioOpsuitePanelType: `${ids.viewPrefix}MindstudioOpsuite`,
    insightDataViewerPanelType: `${ids.viewPrefix}InsightDataViewer`,
    openCsvCommandId: `${ids.commandPrefix}.openCsv`,
    jsonButtonActionCommandId: `${ids.commandPrefix}.jsonButtonAction`,
    vscodeJumpToFileCommandId: `${ids.commandPrefix}.vscodeJumpToFile`,
  };
}

export type FlavorIds = {
  commandPrefix: string;
  settingsPrefix: string;
  viewContainerId: string;
  viewPrefix: string;
  contextPrefix: string;
  colorIdPrefix: string;
};

export type FeatureFlagMode = 'gate' | 'default';

export type FeatureFlag = {
  mode: FeatureFlagMode;
  value: boolean;
};

export type FlavorManifest = {
  name: string;
  displayName: string;
  publisher: string;
  description: string;
};

export const BASE_FLAVOR_BRANDING = {
  productName: 'Huawei OP DevTools',
  productNameZh: '华为算子一站式开发工具',
  productTaglineEn: 'Huawei operator one-stop development platform',
} as const;

export type FlavorBranding = {
  productName: string;
  /** Chinese product name used in README/CHANGELOG intro lines. Defaults to productName. */
  productNameZh?: string;
  /** English one-line product description in README.en.md. Defaults to BASE_FLAVOR_BRANDING.productTaglineEn. */
  productTaglineEn?: string;
  platformTitleKey?: string;
  /** Secondary sidebar / activity bar container title (English). */
  sidebarTitleEn?: string;
  /** Secondary sidebar / activity bar container title (Chinese). */
  sidebarTitleZh?: string;
};

export type FlavorDefinition = {
  id: string;
  manifest: FlavorManifest;
  /** Base name of the packaged .vsix artifact; defaults to manifest.name. */
  vsixBaseName?: string;
  ids: FlavorIds;
  branding: FlavorBranding;
  features: Record<string, FeatureFlag>;
  i18nOverrides?: Record<string, Record<string, string>>;
};

export type DocFilterRecipe = {
  replacements?: Array<{ from: string;
    to: string }>;
  /** Drop entire lines containing any of these substrings when the feature gate is off. */
  removeLineSubstrings?: string[];
};

export type FeatureCatalogEntry = {
  description: string;
  /** Manifest filter applied when gate mode is false */
  manifestFilter?: ManifestFilterRecipe;
  /** README/CHANGELOG filter applied when gate mode is false */
  docFilter?: DocFilterRecipe;
};

export type ManifestFilterRecipe = {
  commandSubstrings?: string[];
  viewIds?: string[];
  configurationCategoryIds?: string[];
  configurationPropertyPrefixes?: string[];
  menuCommandSubstrings?: string[];
  viewContainerIds?: string[];
  activationEventSubstrings?: string[];
};

/** Known feature keys and how they map to manifest sections */
export const FEATURE_CATALOG: Record<string, FeatureCatalogEntry> = {
  'operatorSupport.triton': {
    description: 'Triton operator project support',
    manifestFilter: {
      configurationCategoryIds: ['operatorSupport'],
      configurationPropertyPrefixes: ['operatorSupport.triton'],
      commandSubstrings: [
        'triton',
        'Triton',
      ],
      menuCommandSubstrings: [
        'triton',
        'Triton',
      ],
    },
    docFilter: {
      replacements: [
        {
          from: '、pyasc、Triton 等',
          to: '、pyasc 等',
        },
        {
          from: ', pyasc, Triton, and others',
          to: ', pyasc, and others',
        },
      ],
      removeLineSubstrings: [
        'Triton',
        'triton',
      ],
    },
  },
};

export const KNOWN_FLAVOR_IDS = [
  'huawei',
  'ascend-c-toolkit',
] as const;

export type KnownFlavorId = (typeof KNOWN_FLAVOR_IDS)[number];

export function validateFlavorDefinition(raw: unknown): FlavorDefinition {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Flavor definition must be an object');
  }

  const flavor = raw as FlavorDefinition;

  if (!flavor.id || typeof flavor.id !== 'string') {
    throw new Error('Flavor definition requires string id');
  }

  if (!flavor.manifest?.name || !flavor.manifest?.displayName || !flavor.manifest?.publisher) {
    throw new Error(`Flavor ${flavor.id}: manifest.name, displayName, and publisher are required`);
  }

  const requiredIdKeys: (keyof FlavorIds)[] = [
    'commandPrefix',
    'settingsPrefix',
    'viewContainerId',
    'viewPrefix',
    'contextPrefix',
    'colorIdPrefix',
  ];

  for (const key of requiredIdKeys) {
    if (!flavor.ids?.[key]) {
      throw new Error(`Flavor ${flavor.id}: ids.${key} is required`);
    }
  }

  if (!flavor.branding?.productName) {
    throw new Error(`Flavor ${flavor.id}: branding.productName is required`);
  }

  for (const [
    featureKey,
    flag,
  ] of Object.entries(flavor.features ?? {})) {
    if (!FEATURE_CATALOG[featureKey]) {
      throw new Error(`Flavor ${flavor.id}: unknown feature key "${featureKey}"`);
    }

    if (flag.mode !== 'gate' && flag.mode !== 'default') {
      throw new Error(`Flavor ${flavor.id}: feature "${featureKey}" mode must be gate or default`);
    }

    if (typeof flag.value !== 'boolean') {
      throw new Error(`Flavor ${flavor.id}: feature "${featureKey}" value must be boolean`);
    }
  }

  return flavor;
}

export function buildFlavorGates(features: Record<string, FeatureFlag>): Record<string, boolean> {
  const gates: Record<string, boolean> = {};

  for (const [
    key,
    entry,
  ] of Object.entries(FEATURE_CATALOG)) {
    const flag = features[key];

    if (flag?.mode === 'gate') {
      gates[key] = flag.value;
    }
    else {
      gates[key] = true;
    }
  }

  return gates;
}

export function buildFlavorDefaults(features: Record<string, FeatureFlag>): Record<string, boolean> {
  const defaults: Record<string, boolean> = {};

  for (const [
    key,
    flag,
  ] of Object.entries(features)) {
    if (flag.mode === 'default') {
      defaults[key] = flag.value;
    }
  }

  return defaults;
}
