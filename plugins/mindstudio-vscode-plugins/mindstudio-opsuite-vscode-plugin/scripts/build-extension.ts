import esbuild from 'esbuild';

const useSourcemap = process.argv.some((item) => item === '--sourcemap' || item === '--sourcemap=true') || false;

esbuild.build({
  entryPoints: ['./plugin/src/extension.ts'],
  outfile: 'out/extension.js',
  bundle: true,
  format: 'cjs',
  platform: 'node',
  external: ['vscode'],
  sourcemap: useSourcemap,
});
