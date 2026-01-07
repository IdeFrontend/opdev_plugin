#!/usr/bin/env node

/**
 * V2 功能开关脚本
 * 用于快速启用/禁用 V2 功能
 *
 * 使用方法:
 *   node toggle-v2.js enable build       # 启用 V2 构建
 *   node toggle-v2.js disable build      # 禁用 V2 构建
 *   node toggle-v2.js enable all         # 启用所有 V2 功能
 *   node toggle-v2.js status             # 查看当前状态
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
    console.error(`❌ 未知功能: ${feature}`);
    console.log(`可用功能: ${Object.keys(FEATURES)
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

  console.log('\n📊 V2 功能状态:\n');
  console.log('┌─────────────────┬──────────┐');
  console.log('│ 功能            │ 状态     │');
  console.log('├─────────────────┼──────────┤');

  for (const [
    feature,
    enabled,
  ] of Object.entries(flags)) {
    const status = enabled ? '✅ 启用' : '❌ 禁用';
    const padding = ' '.repeat(15 - feature.length);

    console.log(`│ ${feature}${padding} │ ${status}  │`);
  }

  console.log('└─────────────────┴──────────┘\n');

  const enabledCount = Object.values(flags)
    .filter(Boolean).length;
  const totalCount = Object.keys(flags).length;
  const progress = ((enabledCount / totalCount) * 100).toFixed(0);

  console.log(`进度: ${enabledCount}/${totalCount} (${progress}%) 功能已迁移到 V2\n`);

  if (enabledCount === 0) {
    console.log('💡 提示: 运行 `node toggle-v2.js enable build` 启用构建功能');
  }
  else if (enabledCount === totalCount) {
    console.log('🎉 所有功能已启用 V2!');
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
      console.error('❌ 请指定功能名称或 "all"');
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
      console.error('❌ 请指定功能名称或 "all"');
      process.exit(1);
    }
  }
  else {
    console.error('❌ 未知操作:', action);
    console.log('\n用法:');
    console.log('  node toggle-v2.js status                 # 查看状态');
    console.log('  node toggle-v2.js enable <feature|all>   # 启用功能');
    console.log('  node toggle-v2.js disable <feature|all>  # 禁用功能');
    console.log('\n可用功能:', Object.keys(FEATURES)
      .join(', '));
    process.exit(1);
  }

  console.log('\n💡 提示: 修改后需要重新编译插件 (npm run compile)');
}

main();
