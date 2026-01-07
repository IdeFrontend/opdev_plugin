# Ops API 使用指南

> **导航**: [← 返回项目主页](../../../README.md) | [← Web 模块指南](../../README.md)

---

## 概述

现在视图层（Vue 组件）可以直接调用 ops 相关的 API，无需通过 WebviewMessageList 中的消息处理。

## 使用示例

### 1. 在 Vue 组件中导入 API

```typescript
import {
  initOps,
  getConfigData,
  saveBuildConfig,
  startBuild,
  getBuildConfigs,
} from '@/apis';
```

### 2. 基础用法示例

#### 初始化项目

```typescript
// 使用默认参数
await initOps();

// 或带参数
await initOps({
  accendEnvScript: '/path/to/script.sh',
  projectPath: '/path/to/project',
  projectName: 'my-project',
});
```

#### 获取配置数据

```typescript
const configData = await getConfigData();
console.log(configData);
```

#### 获取构建配置列表

```typescript
const configs = await getBuildConfigs();
configs.forEach((config) => {
  console.log(config.config_name, config.config_type);
});
```

#### 保存并编译

```typescript
// 保存配置
await saveBuildConfig({
  data: buildConfigArray,
  showMessage: true,
});

// 开始编译
await startBuild({
  configId: '123',
  compileOption: '--debug',
});
```

### 3. 完整的 Vue 组件示例

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { initOps, getConfigData, startBuild } from '@/apis';
import type { BuildConfig } from '@shared/api-types';

const configData = ref<BuildConfig[]>([]);
const isBuilding = ref(false);

// 组件挂载时初始化
onMounted(async () => {
  await initOps();
  await loadConfigData();
});

// 加载配置数据
async function loadConfigData() {
  const result = await getConfigData();
  configData.value = result.data || [];
}

// 开始编译
async function handleBuild() {
  isBuilding.value = true;
  try {
    await startBuild();
    console.log('编译成功');
  } catch (error) {
    console.error('编译失败:', error);
  } finally {
    isBuilding.value = false;
  }
}
</script>

<template>
  <div>
    <button
      @click="handleBuild"
      :disabled="isBuilding"
    >
      {{ isBuilding ? '编译中...' : '开始编译' }}
    </button>
  </div>
</template>
```

### 4. 错误处理

```typescript
try {
  await startBuild({ configId: '123' });
} catch (error) {
  // 处理错误
  console.error('编译失败:', error);
}
```

### 5. 异常检测示例

```typescript
import { getSanitizerConfigs, saveSanitizerForm, runSanitizer } from '@/apis';

// 获取异常检测配置
const configs = await getSanitizerConfigs();

// 保存配置
await saveSanitizerForm({
  data: {
    // sanitizer 配置数据
  },
  showMessage: true,
});

// 运行异常检测
await runSanitizer();
```

## 可用的 API 列表

### 项目管理

- `initOps(params?)` - 初始化算子项目
- `getProjectId()` - 获取当前项目ID
- `updateShScript(params)` - 更新脚本文件
- `checkVscode()` - 检查 .vscode 目录

### 算子创建

- `createOps(params?)` - 创建算子原型文件
- `createOpsByPrototype(params)` - 通过原型生成算子工程

### 配置管理

- `getConfigData()` - 获取配置数据
- `getBuildConfigs()` - 获取构建配置列表
- `saveBuildConfig(params)` - 保存构建配置
- `saveConfig(params)` - 保存配置（仿真/上板）
- `getBuildConfig()` - 获取构建配置ID
- `getBuildExampleConfig()` - 获取示例构建配置ID
- `getSimulateConfig()` - 获取仿真配置ID
- `getOnBoardConfig()` - 获取上板配置ID

### 编译和运行

- `startBuild(params?)` - 编译算子
- `startRun(params?)` - 运行算子
- `startBuildExample(params?)` - 编译示例

### 性能分析

- `startSimulate()` - 开始仿真分析
- `startOnBoard()` - 开始上板分析

### 异常检测

- `getSanitizerConfigs()` - 获取异常检测配置列表
- `getSanitizerConfigId()` - 获取异常检测配置ID
- `saveSanitizerForm(params)` - 保存异常检测表单配置
- `runSanitizer()` - 运行异常检测

## 类型定义

所有的类型定义都在 `@shared/api-types` 中：

```typescript
import type {
  InitOpsParams,
  CreateOpsParams,
  BuildConfig,
  SaveBuildConfigParams,
  // ... 其他类型
} from '@shared/api-types';
```

## 注意事项

1. **异步调用**：所有 API 都返回 Promise，需要使用 `async/await` 或 `.then()` 处理
2. **错误处理**：建议使用 try-catch 捕获错误
3. **类型安全**：TypeScript 会提供完整的类型检查和自动补全
4. **初始化**：大部分操作前需要先调用 `initOps()` 初始化项目

## 与旧方式的对比

### 旧方式（通过 WebviewMessageList）

```typescript
// 通过 postMessage 发送消息
that.panel.webview.postMessage({
  command: 'vscodeBuildOp',
  data: { ... }
});
```

### 新方式（直接调用 API）

```typescript
// 直接调用，像调用普通函数一样
await startBuild({ configId: '123' });
```

## 优势

1. **更简洁**：无需处理复杂的消息传递
2. **类型安全**：完整的 TypeScript 类型支持
3. **更易维护**：API 调用清晰明了
4. **更好的错误处理**：Promise 标准错误处理
5. **自动补全**：IDE 提供完整的代码提示
