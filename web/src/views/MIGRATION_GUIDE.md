# 视图层 API 调用迁移指南

## 已完成迁移

### 1. Config/buildConfig.vue ✅
**旧代码:**
```js
import { message } from "../../../untils/Message.ts";

message.sendMessageToParent({ command: "vscodeSaveBuildConfig", data });
message.sendMessageToParent({ command: "vscodeSaveAndStartBuild", data });
message.sendMessageToParent({ command: "vscodeSaveAndStartBuildExample", data });
```

**新代码:**
```js
import { saveBuildConfig as saveBuildConfigAPI, startBuild, startBuildExample } from "@/apis";

await saveBuildConfigAPI({ data });
await saveBuildConfigAPI({ data, showMessage: false });
await startBuild({ configId: config_id });
await startBuildExample({ configId: config_id });
```

### 2. Config/sanitizerConfig.vue ✅
**旧代码:**
```js
const getSanitizerForm = {
  command: 'iframeSetSanitizerForm',
  callback: (message) => {
    const obj = JSON.parse(message.data || '{}')?.user_options || {}
    // 处理数据
  }
}
message.addMessageListener(getSanitizerForm)
message.sendMessageToParent({ command: 'vscodeGetSanitizerForm' });
message.sendMessageToParent({ command: "vscodeSaveSanitizerForm", data });
```

**新代码:**
```js
import { getSanitizerConfigs, saveSanitizerForm as saveSanitizerFormAPI } from '@/apis';

async function loadSanitizerForm() {
  const configs = await getSanitizerConfigs();
  const obj = (configs[0] || {})?.user_options || {};
  // 处理数据
}

async function saveSanitizerForm() {
  await saveSanitizerFormAPI({ data });
}

onBeforeMount(async () => {
  await loadSanitizerForm();
})
```

## 待迁移模式

### Config/SimulationTab.vue & OnboardTab.vue
**模式:** 保存配置
```js
// 旧代码
message.sendMessageToParent({
  command: "vscodeSaveConfig",
  data: { type: 'simulate', data: [obj] }
});

// 新代码
import { saveConfig } from '@/apis';
await saveConfig({ type: 'simulate', data: [obj] });
```

### Config/APP.vue & main.ts
**模式:** 获取项目ID和配置
```js
// 旧代码
message.sendMessageToParent({ command: 'vscodeGetProjectId' });
message.sendMessageToParent({ command: 'vscodeGetBuildConfig' });

// 新代码
import { initOps, getProjectId, getConfigData } from '@/apis';
await initOps();
const projectId = await getProjectId();
const configData = await getConfigData();
```

## 通用迁移规则

### 1. 删除 Message 导入
```js
// 删除
import { message } from "../../../untils/Message.ts";

// 添加
import {
  initOps,
  getProjectId,
  getConfigData,
  saveBuildConfig,
  // ... 其他需要的 API
} from '@/apis';
```

### 2. 替换 postMessage 调用

| 旧的 command | 新的 API | 参数 |
|-------------|---------|------|
| `vscodeGetProjectId` | `getProjectId()` | 无 |
| `vscodeGetBuildConfig` | `getConfigData()` | 无 |
| `vscodeSaveBuildConfig` | `saveBuildConfig({ data })` | `{ data, showMessage? }` |
| `vscodeSaveAndStartBuild` | `saveBuildConfig()` + `startBuild()` | 分两步调用 |
| `vscodeSaveAndStartBuildExample` | `saveBuildConfig()` + `startBuildExample()` | 分两步调用 |
| `vscodeGetSanitizerForm` | `getSanitizerConfigs()` | 无 |
| `vscodeSaveSanitizerForm` | `saveSanitizerForm({ data })` | `{ data, showMessage? }` |
| `vscodeSaveConfig` | `saveConfig({ type, data })` | `{ type, data, showMessage? }` |
| `vscodeSaveProjectSH` | `updateShScript({ accendEnvScript })` | `{ accendEnvScript }` |
| `vscodeCreatedProject` | `initOps({ ... })` | `{ accendEnvScript?, projectPath?, projectName? }` |

### 3. 替换消息监听器

```js
// 旧模式
const getSomething = {
  command: 'iframeSetSomething',
  callback: (message) => {
    // 处理 message.data
  }
}
message.addMessageListener(getSomething);
message.sendMessageToParent({ command: 'vscodeGetSomething' });

// 新模式
async function loadSomething() {
  const result = await getSomethingAPI();
  // 直接处理 result
}
onBeforeMount(async () => {
  await loadSomething();
})
```

## 需要迁移的文件列表

- [x] Config/buildConfig.vue
- [x] Config/sanitizerConfig.vue
- [ ] Config/SimulationTab.vue
- [ ] Config/OnboardTab.vue
- [ ] Config/APP.vue
- [ ] Config/main.ts
- [ ] Link/main.ts
- [ ] Home/APP.vue
- [ ] Home/main.ts
- [ ] Board/main.ts
- [ ] Operate/main.ts
- [ ] ProjectSH/main.ts
- [ ] MsSanitizerPanelView/main.ts
- [ ] newPrototype/main.ts
- [ ] Welcome/APP.vue
- [ ] Welcome/main.ts

## 注意事项

1. **异步处理**: 所有新的 API 调用都是异步的，需要使用 `async/await`
2. **错误处理**: 建议添加 try-catch 处理错误
3. **类型提示**: 使用 TypeScript 类型可以获得更好的代码提示
4. **初始化**: 某些操作需要先调用 `initOps()` 初始化项目
5. **消息移除**: 迁移后可以移除 `message.addMessageListener` 和 `message.sendMessageToParent` 调用
