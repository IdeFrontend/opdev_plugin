/**
 * Lock: deleted endpoints, keys, and symbols must stay absent.
 *
 * Cases:
 *  1. Removed-symbol tokens absent from plugin/src, web/src, shared
 *     (whitelisted: the synthesized runtime-row contract
 *     `config_id`/`project_id`/`BuildConfig`, the legacy importer schema,
 *     comment-only mentions of modules absent from the tree).
 *  2. Every nls key in all 4 package.nls* files is referenced via `%...%` in
 *     package.json (no dead keys), and every reference exists in at least one
 *     nls file.
 *  3. docs/*.md + CHANGELOG.md do not mention absent endpoints/keys;
 *     `projects.json`/`configs.json`/`ops.json`/`RemoteConfig` are allowed
 *     only in lines with a context word (legacy/importer/import/migration/
 *     remain/left on disk/не удаля).
 *  4. i18n values in shared/i18n/*.ts do not mention `projects.json` or
 *     `projectId`.
 *
 * Tokens are assembled from fragments so this spec never matches itself;
 * the spec file is also excluded from its own scan.
 */
import * as fs from 'fs';
import * as path from 'path';

const pluginRoot = path.join(__dirname, '..', '..', '..');
const repoRoot = path.join(pluginRoot, '..');
const docsRoot = path.join(repoRoot, 'docs');

/** Removed-symbol tokens, built from fragments or given as plain strings. */
const E_TOKENS = [
  [
    'config',
    'Id',
  ],
  [
    'config',
    '_id',
  ],
  [
    'project',
    'Id',
  ],
  [
    'project',
    '_id',
  ],
  [
    'post',
    'Config',
  ],
  [
    'get',
    'Config',
  ],
  [
    'Build',
    'Config',
  ],
  [
    'Remote',
    'Config',
  ],
  [
    'Extension',
    'Config',
  ],
  [
    'Config',
    'Helper',
  ],
  [
    'feature',
    '-toggle',
  ],
  // Dead build-config list + legacy row type (now a local
  // runtime-row contract name inside config-service).
  'getBuildConfigsList',
  // Settings-migration bridge remnant and its single-flight chain
  // (dead: the settings step now lives in the importer).
  'maybeMigrateLegacySettingsToWorkspace',
  'legacySettingsMigrationFlight',
  'isLegacySettingsMigrationInFlight',
  'resetLegacySettingsMigrationFlight',
  'resetLegacySettingsMigrationFlightForTest',
  'registerConfigurationChangeHandler',
].map((token) => Array.isArray(token) ? token.join('') : token);

/**
 * Whitelisted (rel-path → tokens): synthesized runtime-row contract, legacy
 * importer schema, and comment-only references to modules absent from the tree.
 * `config_id` / `project_id` are the runtime ConfigRecord fields everywhere
 * (RuntimeConfigRow contract); in `__tests__` `projectId` is fixture data.
 */
const CODE_WIDE_TOKENS = [
  'config_id',
  'project_id',
];
const TEST_WIDE_TOKENS = [
  ...CODE_WIDE_TOKENS,
  'projectId',
];

const WHITELIST: Record<string, string[]> = {
  // Runtime row contract (synthesized, not stored) — BuildConfig is absent from the
  // shared API surface and build-service; config-service uses its own
  // local RuntimeConfigRow name, so no whitelist entry is needed here.
  'plugin/src/service/config-service.ts': [
    'getConfig',
    'postConfig',
    // The comment pins the legacy RemoteConfig file path
    // (read-only import; the class is absent from the tree).
    'RemoteConfig',
  ],
  // Legacy importer schema (read-only legacy stores):
  'plugin/src/helpers/legacy-state-importer.ts': [],
  // Comments pin the legacy RemoteConfig home-based locate path.
  'plugin/src/__tests__/unit/legacy-state-importer.spec.ts': ['RemoteConfig'],
  'plugin/src/controller/welcome-controller.ts': ['RemoteConfig'],
  'plugin/src/service/settings-loader.ts': [
    'ConfigHelper',
    'feature-toggle',
  ],
  // Tests referencing absent symbols in negative / fixture contexts:
  'plugin/src/__tests__/unit/build-service-de-id.spec.ts': ['configId'],
  'plugin/src/__tests__/unit/runtime-chain-per-type.spec.ts': ['configId'],
  'plugin/src/__tests__/unit/file-map-lists-cache.spec.ts': ['getConfig'],
  'plugin/src/__tests__/golden/harness.ts': ['getConfig'],
  'plugin/src/__tests__/lifecycle/fixtures.ts': ['getConfig'],
  'plugin/src/__tests__/unit/migration-engine-gone.spec.ts': ['RemoteConfig'],
  'plugin/src/__tests__/unit/regression-dead-fields.spec.ts': [
    'RemoteConfig',
    'ExtensionConfig',
  ],
  'plugin/src/__tests__/unit/flavor-defaults-preserved.spec.ts': ['feature-toggle'],
};

const SKIP_DIRS = new Set([
  'node_modules',
  'expected',
  '.git',
  'dist',
  'out',
  'coverage',
]);

const SELF_FILE = 'symbols-gone.spec.ts';

function collectFiles(root: string, skipTests = false): string[] {
  const out: string[] = [];

  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (skipTests && entry.name === '__tests__') {
          continue;
        }

        if (!SKIP_DIRS.has(entry.name)) {
          walk(path.join(dir, entry.name));
        }
      }
      else if (entry.name === SELF_FILE) {
        // The spec would otherwise match its own token table.
        continue;
      }
      else if (entry.name.endsWith('.ts') || entry.name.endsWith('.vue') || entry.name.endsWith('.js')) {
        out.push(path.join(dir, entry.name));
      }
    }
  };

  walk(root);

  return out;
}

function posix(rel: string): string {
  return rel.split(path.sep)
    .join('/');
}

function wordBoundaryRegex(token: string): RegExp {
  // Escape token for a literal \b...\b match.
  return new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
}

function findElistHits(root: string, wideTokens: string[], skipTests = false): Array<{ file: string;
  line: number;
  token: string }> {
  const hits: Array<{ file: string;
    line: number;
    token: string }> = [];

  for (const file of collectFiles(root, skipTests)) {
    const rel = posix(path.relative(repoRoot, file));
    const allowed = new Set(WHITELIST[rel] ?? []);

    const lines = fs.readFileSync(file, 'utf8')
      .split('\n');

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];

      for (const token of E_TOKENS) {
        const isWide = wideTokens.includes(token);
        const isAllowed = isWide || allowed.has(token);

        if (!isAllowed && wordBoundaryRegex(token)
          .test(line)) {
          hits.push({
            file: rel,
            line: i + 1,
            token,
          });
        }
      }
    }
  }

  return hits;
}

describe('Lock: deleted symbols stay absent', () => {
  it('Removed-symbol tokens are absent from plugin/src, web/src, shared (code)', () => {
    // Code scan skips __tests__ — test fixtures are covered by the next case.
    const hits = findElistHits(pluginRoot, CODE_WIDE_TOKENS, true);

    for (const h of findElistHits(path.join(repoRoot, 'web', 'src'), CODE_WIDE_TOKENS, true)) {
      hits.push(h);
    }

    for (const h of findElistHits(path.join(repoRoot, 'shared'), CODE_WIDE_TOKENS, true)) {
      hits.push(h);
    }

    expect(hits)
      .toEqual([]);
  });

  it('Removed-symbol tokens are absent from plugin tests (fixture data aside)', () => {
    const hits = findElistHits(path.join(pluginRoot, 'src', '__tests__'), TEST_WIDE_TOKENS);

    expect(hits)
      .toEqual([]);
  });

  it('all nls keys are referenced in package.json and vice versa', () => {
    // package.json and package.nls* live at the repo root, not in plugin/.
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    const pkgText = JSON.stringify(pkg);
    const refs = new Set<string>();

    for (const m of pkgText.matchAll(/%([A-Za-z0-9_.\-]+)%/g)) {
      refs.add(m[1]);
    }

    const nlsFiles = [
      'package.nls.json',
      'package.nls.en.json',
      'package.nls.base.json',
      'package.nls.base.en.json',
    ];
    const allKeys = new Set<string>();

    for (const nlsFile of nlsFiles) {
      const keys = Object.keys(JSON.parse(fs.readFileSync(path.join(repoRoot, nlsFile), 'utf8')));
      const dead = keys.filter((key) => !refs.has(key));

      for (const key of keys) {
        allKeys.add(key);
      }

      expect({
        nlsFile,
        dead,
      })
        .toEqual({
          nlsFile,
          dead: [],
        });
    }

    const unreferencedRefs = [...refs].filter((ref) => !allKeys.has(ref));

    expect(unreferencedRefs)
      .toEqual([]);
  });

  it('docs do not mention absent endpoints, keys or file deletion', () => {
    const banned = [
      'getConfigData',
      'saveConfig',
      'getSanitizerConfigs',
      'saveSanitizerForm',
      'internal.settingsMigratedFromLegacy',
    ];
    const contextWords = [
      'legacy',
      'importer',
      'import',
      'migration',
      'remain',
      'left on disk',
      'не удаля',
    ];
    const registryTokens = [
      'projects.json',
      'configs.json',
      'ops.json',
      'RemoteConfig',
    ];
    const problems: string[] = [];

    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          walk(full);
        }
        else if (entry.name.endsWith('.md')) {
          scanDoc(full);
        }
      }
    };

    const scanDoc = (file: string): void => {
      const lines = fs.readFileSync(file, 'utf8')
        .split('\n');

      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];

        for (const token of banned) {
          if (wordBoundaryRegex(token)
            .test(line)) {
            problems.push(`${path.relative(repoRoot, file)}:${i + 1} banned token ${token}`);
          }
        }

        const lower = line.toLowerCase();

        for (const token of registryTokens) {
          if (lower.includes(token.toLowerCase())
            && !contextWords.some((word) => lower.includes(word))) {
            problems.push(`${path.relative(repoRoot, file)}:${i + 1} ${token} without context word`);
          }
        }
      }
    };

    walk(docsRoot);

    const changelog = path.join(repoRoot, 'CHANGELOG.md');

    if (fs.existsSync(changelog)) {
      scanDoc(changelog);
    }

    expect(problems)
      .toEqual([]);
  });

  it('i18n messages do not mention projects.json or projectId', () => {
    const i18nDir = path.join(repoRoot, 'shared', 'i18n');
    const hits: string[] = [];

    for (const file of fs.readdirSync(i18nDir)
      .filter((name) => name.endsWith('.ts'))) {
      const src = fs.readFileSync(path.join(i18nDir, file), 'utf8');

      // Match only 'key': 'value' string pairs — values must be clean.
      for (const m of src.matchAll(/'([^']*)'\s*:\s*'([^']*)'/g)) {
        const value = m[2];

        if (/projects\.json|projectId/i.test(value)) {
          hits.push(`${file}: ${m[1]} = ${value}`);
        }
      }
    }

    expect(hits)
      .toEqual([]);
  });
});
