#!/usr/bin/env node
/**
 * Smoke-test operator template sources: walk unpacked template folders under
 * plugin/templates/code_template/, apply the same __MSTT_* replacements as
 * BaseOpGenerator._replaceMsttPlaceholders, assert no placeholder substrings remain.
 *
 * Usage (repo root): node scripts/verify-template-entrypoints.cjs
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

/** Unpacked template roots (see scripts/build-extension.ts pack step). */
const templateSourceDirs = [
  'plugin/templates/code_template/triton_template/triton_vector_add',
  'plugin/templates/code_template/cann_template/pyasc_temple',
];

function pascalFromSnake(opName) {
  return opName
    .split('_')
    .map((s) => s.charAt(0)
      .toUpperCase() + s.slice(1))
    .join('');
}

function replaceMstt(content, opName) {
  const cap = pascalFromSnake(opName);
  return content
    .split('__MSTT_OP_NAME_PASCAL__')
    .join(cap)
    .split('__MSTT_OP_NAME_UPPER__')
    .join(opName.toUpperCase())
    .split('__MSTT_OP_NAME__')
    .join(opName);
}

function walk(dir, fn) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) {
      walk(full, fn);
    }
    else {
      fn(full);
    }
  }
}

const opName = 'verify_entry_op';

for (const rel of templateSourceDirs) {
  const dirPath = path.join(root, rel);

  if (!fs.existsSync(dirPath)) {
    console.error(`Missing template source dir: ${dirPath}`);
    process.exit(1);
  }

  const leftover = [];

  walk(dirPath, (file) => {
    if (!/\.(py|md|txt|sh|asc|json)$/i.test(file)) {
      return;
    }

    const c = fs.readFileSync(file, 'utf8');
    const n = replaceMstt(c, opName);

    if (n.includes('__MSTT_OP_NAME')) {
      leftover.push(file);
    }
  });

  if (leftover.length) {
    console.error(`Leftover __MSTT_* placeholders under ${rel}:\n${leftover.join('\n')}`);
    process.exit(1);
  }

  console.log('ok', rel);
}

console.log('verify-template-entrypoints: all checks passed.');
