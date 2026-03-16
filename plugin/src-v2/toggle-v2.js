#!/usr/bin/env node

/**
 * V2 feature toggle script
 * Quickly enable/disable V2 features
 *
 * Usage:
 *   node toggle-v2.js enable build       # Enable V2 build
 *   node toggle-v2.js disable build      # Disable V2 build
 *   node toggle-v2.js enable all         # Enable all V2 features
 *   node toggle-v2.js status             # Show current status
 */

const fs = require('fs');
const path = require('path');

const FEATURE_FLAGS_PATH = path.join(__dirname, '../src/feature-flags.ts');

const FEATURES = {
  build: 'USE_V2_BUILD',
  run: 'USE_V2_RUN',
  buildExample: 'USE_V2_BUILD_EXAMPLE',
  simulate: 'USE_V2_SIMULATE',
  onBoard: 'USE_V2_ON_BOARD',
  sanitizer: 'USE_V2_SANITIZER',
};

function readFeatureFlags() {
  const content = fs.readFileSync(FEATURE_FLAGS_PATH, 'utf-8');
  const flags = {};

  for (const [
    feature,
    flag,
  ] of Object.entries(FEATURES)) {
    const regex = new RegExp(`${flag}:\\s*(true|false)`);
    const match = content.match(regex);

    if (match) {
      flags[feature] = match[1] === 'true';
    }
  }

  return {
    content,
    flags,
  };
}

function writeFeatureFlags(content) {
  fs.writeFileSync(FEATURE_FLAGS_PATH, content, 'utf-8');
}

function toggleFeature(feature, enable) {
  const flag = FEATURES[feature];

  if (!flag) {
    console.error(`❌ Unknown feature: ${feature}`);
    console.log(`Available: ${Object.keys(FEATURES)
      .join(', ')}, all`);
    process.exit(1);
  }

  const { content } = readFeatureFlags();
  const regex = new RegExp(`(${flag}:\\s*)(true|false)`);
  const newValue = enable ? 'true' : 'false';
  const newContent = content.replace(regex, `$1${newValue}`);

  writeFeatureFlags(newContent);

  const emoji = enable ? '✅' : '❌';

  console.log(`${emoji} ${feature}: ${enable ? 'ENABLED' : 'DISABLED'}`);
}

function toggleAll(enable) {
  for (const feature of Object.keys(FEATURES)) {
    toggleFeature(feature, enable);
  }
}

function showStatus() {
  const { flags } = readFeatureFlags();

  console.log('\n📊 V2 feature status:\n');
  console.log('┌─────────────────┬──────────┐');
  console.log('│ Feature         │ Status   │');
  console.log('├─────────────────┼──────────┤');

  for (const [
    feature,
    enabled,
  ] of Object.entries(flags)) {
    const status = enabled ? '✅ ON ' : '❌ OFF';
    const padding = ' '.repeat(15 - feature.length);

    console.log(`│ ${feature}${padding} │ ${status}  │`);
  }

  console.log('└─────────────────┴──────────┘\n');

  const enabledCount = Object.values(flags)
    .filter(Boolean).length;
  const totalCount = Object.keys(flags).length;
  const progress = ((enabledCount / totalCount) * 100).toFixed(0);

  console.log(`Progress: ${enabledCount}/${totalCount} (${progress}%) migrated to V2\n`);

  if (enabledCount === 0) {
    console.log('💡 Tip: run `node toggle-v2.js enable build` to enable build');
  }
  else if (enabledCount === totalCount) {
    console.log('🎉 All V2 features enabled!');
  }
}

function main() {
  const [
    ,, action,
    feature,
  ] = process.argv;

  if (!action || action === 'status') {
    showStatus();

    return;
  }

  if (action === 'enable') {
    if (feature === 'all') {
      toggleAll(true);
    }
    else if (feature) {
      toggleFeature(feature, true);
    }
    else {
      console.error('❌ Specify feature name or "all"');
      process.exit(1);
    }
  }
  else if (action === 'disable') {
    if (feature === 'all') {
      toggleAll(false);
    }
    else if (feature) {
      toggleFeature(feature, false);
    }
    else {
      console.error('❌ Specify feature name or "all"');
      process.exit(1);
    }
  }
  else {
    console.error('❌ Unknown action:', action);
    console.log('\nUsage:');
    console.log('  node toggle-v2.js status                 # Show status');
    console.log('  node toggle-v2.js enable <feature|all>   # Enable feature(s)');
    console.log('  node toggle-v2.js disable <feature|all>  # Disable feature(s)');
    console.log('\nAvailable:', Object.keys(FEATURES)
      .join(', '));
    process.exit(1);
  }

  console.log('\n💡 Tip: recompile plugin after changes (npm run compile)');
}

main();
