/**
 * Idempotent integration prep for a fresh MSTT checkout.
 *
 * - default        → ensure the profiling-report submodule is initialized (compile needs its source).
 * - --types        → additionally build profiling-report/dist/index.d.ts and out/shared declarations
 *                    (vue-tsc resolves the profiling-report alias to dist/index.d.ts).
 *
 * Each step is guarded by existence checks so it is a no-op when already prepared.
 * ponytail: guards are existence-based, not staleness-based — a stale dist is reused
 * until the submodule dir is reset or dist is deleted.
 */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const prDir = join(root, 'profiling-report');

function run(cmd, args, cwd = root) {
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: false });

  if (result.error) {
    console.error(`[prepare-integration] ${cmd} failed to start:`, result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`[prepare-integration] ${cmd} ${args.join(' ')} exited with ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

const withTypes = process.argv.includes('--types');

if (!existsSync(join(prDir, 'src', 'index.ts'))) {
  console.log('[prepare-integration] initializing profiling-report submodule');
  run('git', ['submodule', 'update', '--init', '--recursive', 'profiling-report']);
}

if (withTypes) {
  if (!existsSync(join(prDir, 'dist', 'index.d.ts'))) {
    if (!existsSync(join(prDir, 'node_modules'))) {
      console.log('[prepare-integration] installing profiling-report dependencies (npm ci)');
      run('npm', ['ci'], prDir);
    }

    console.log('[prepare-integration] building profiling-report (npm run build)');
    run('npm', ['run', 'build'], prDir);
  }

  if (!existsSync(join(root, 'out', 'shared', 'index.d.ts'))) {
    console.log('[prepare-integration] building shared declarations (tsc --build shared)');
    run('npx', ['tsc', '--build', 'shared']);
  }
}
