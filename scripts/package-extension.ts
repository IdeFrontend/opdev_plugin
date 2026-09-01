import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  KNOWN_FLAVOR_IDS, type FlavorDefinition,
} from '../flavors/schema';

const REPO_ROOT = path.resolve(__dirname, '..');

type PackageManifest = {
  name: string;
  publisher: string;
  version: string;
};

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

/**
 * Resolve the .vsix artifact name for the manifest currently on disk. A flavor
 * can keep a stable artifact name (vsixBaseName) when its marketplace id changes.
 */
export function resolveVsixFileName(manifest: PackageManifest): string {
  for (const flavorId of KNOWN_FLAVOR_IDS) {
    const flavor = readJson<FlavorDefinition>(path.join(REPO_ROOT, 'flavors', flavorId, 'flavor.json'));

    if (flavor.manifest.publisher === manifest.publisher && flavor.manifest.name === manifest.name) {
      const baseName = flavor.vsixBaseName ?? flavor.manifest.name;

      return `${baseName}-${manifest.version}.vsix`;
    }
  }

  return `${manifest.name}-${manifest.version}.vsix`;
}

/** Package the currently applied flavor with the flavor's artifact naming. */
function main(): void {
  const manifest = readJson<PackageManifest>(path.join(REPO_ROOT, 'package.json'));
  const vsixFileName = resolveVsixFileName(manifest);

  execSync(`pnpm exec vsce package --no-dependencies --allow-missing-repository --out ${vsixFileName}`, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });
}

if (process.argv[1]?.replace(/\\/g, '/')
  .endsWith('scripts/package-extension.ts')) {
  main();
}
