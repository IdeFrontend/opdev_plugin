import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { KNOWN_FLAVOR_IDS } from '../flavors/schema';
import {
  applyFlavor, restoreCommittedFlavorArtifacts,
} from './apply-flavor';

const REPO_ROOT = path.resolve(__dirname, '..');

function readPackageManifest(): { name: string;
  version: string } {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as {
    name: string;
    version: string;
  };

  return pkg;
}

function packageFlavor(flavorId: string): string {
  applyFlavor(flavorId);
  execSync('pnpm run compile', {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });

  const {
    name, version,
  } = readPackageManifest();
  const outName = `${name}-${version}.vsix`;

  execSync(`pnpm exec vsce package --no-dependencies --allow-missing-repository --out ${outName}`, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });

  return path.join(REPO_ROOT, outName);
}

function main(): void {
  const outputs: string[] = [];

  try {
    for (const flavorId of KNOWN_FLAVOR_IDS) {
      console.log(`\n[package-all-flavors] Packaging flavor "${flavorId}"…`);
      outputs.push(packageFlavor(flavorId));
    }

    console.log('\n[package-all-flavors] Built:');

    for (const outPath of outputs) {
      console.log(`  ${outPath}`);
    }
  }
  finally {
    console.log('\n[package-all-flavors] Restoring Huawei flavor artifacts…');
    restoreCommittedFlavorArtifacts();
  }
}

if (process.argv[1]?.replace(/\\/g, '/')
  .endsWith('scripts/package-all-flavors.ts')) {
  main();
}
