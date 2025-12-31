# OpsOption API 使用文档

本文档说明如何通过新的 API 层调用 OpsOption 的方法。

## 概述

原本 `OpsOption.ts` 中的方法现在已经被改造成类似 `plugin/src/apis` 的结构，可以通过 Webview 与插件后端进行通信。

## 文件结构

```
plugin/src/apis/
├── ops.ts                    # 算子操作相关 API 实现
shared/api-types/
├── ops.d.ts                  # 算子操作相关类型定义
```

## API 列表

所有 API 都在 `ops` 命名空间下，可以通过 `ops/methodName` 路径访问。

### 初始化和创建

| API 路径 | 参数类型 | 返回类型 | 描述 |
|---------|---------|---------|------|
| `ops/init` | `InitOpsParams` | `Promise<string>` | 初始化算子项目，返回 projectId |
| `ops/createOps` | `CreateOpsParams` | `Promise<string>` | 创建算子原型文件 |
| `ops/createOpsByPrototype` | `CreateOpsByPrototypeParams` | `Promise<void>` | 通过原型生成算子工程 |
| `ops/checkVscode` | 无参数 | `Promise<boolean>` | 检查 .vscode 目录 |
| `ops/updateShScript` | `UpdateShScriptParams` | `Promise<string>` | 更新脚本文件 |

### 配置管理

| API 路径 | 参数类型 | 返回类型 | 描述 |
|---------|---------|---------|------|
| `ops/getConfigData` | 无参数 | `Promise<GetConfigDataResult>` | 获取所有配置数据 |
| `ops/getBuildConfigs` | 无参数 | `Promise<BuildConfig[]>` | 获取构建配置列表 |
| `ops/getBuildConfig` | 无参数 | `Promise<number \| undefined>` | 获取构建配置ID |
| `ops/getBuildExampleConfig` | 无参数 | `Promise<number \| undefined>` | 获取示例构建配置ID |
| `ops/getSimulateConfig` | 无参数 | `Promise<string>` | 获取仿真配置ID |
| `ops/getOnBoardConfig` | 无参数 | `Promise<string>` | 获取上板配置ID |
| `ops/saveBuildConfig` | `SaveBuildConfigParams` | `Promise<void>` | 保存构建配置 |
| `ops/saveConfig` | `SaveConfigParams` | `Promise<void>` | 保存配置（仿真/上板） |

### 构建和运行

| API 路径 | 参数类型 | 返回类型 | 描述 |
|---------|---------|---------|------|
| `ops/startBuild` | `StartBuildParams` | `Promise<void>` | 编译算子 |
| `ops/startBuildExample` | `StartBuildExampleParams` | `Promise<void>` | 编译示例 |
| `ops/startRun` | `StartRunParams` | `Promise<void>` | 运行算子 |
| `ops/startSimulate` | 无参数 | `Promise<void>` | 开始仿真分析 |
| `ops/startOnBoard` | 无参数 | `Promise<void>` | 开始上板分析 |

### 异常检测

| API 路径 | 参数类型 | 返回类型 | 描述 |
|---------|---------|---------|------|
| `ops/getSanitizerConfigs` | 无参数 | `Promise<BuildConfig[]>` | 获取异常检测配置列表 |
| `ops/getSanitizerConfigId` | 无参数 | `Promise<number \| undefined>` | 获取异常检测配置ID |
| `ops/saveSanitizerForm` | `SaveSanitizerFormParams` | `Promise<void>` | 保存异常检测表单配置 |
| `ops/runSanitizer` | 无参数 | `Promise<void>` | 运行异常检测 |

## 使用示例

### Webview 端调用示例（伪代码）

```typescript
// 初始化项目
const projectId = await callApi('ops/init', {
  accendEnvScript: '/path/to/script.sh',
  projectPath: '/workspace',
  projectName: 'my-operator'
});

// 创建算子原型
const result = await callApi('ops/createOps', {
  projectName: 'my-operator',
  projectId: projectId,
  prototypeName: 'add'
});

// 编译算子（支持编译选项）
await callApi('ops/startBuild', {
  configId: '123',
  compileOption: '--debug'  // 或 '--mssanitizer' 用于异常检测模式
});

// 保存构建配置
await callApi('ops/saveBuildConfig', {
  data: { /* 配置数据 */ },
  showMessage: true  // 是否显示成功/失败提示
});

// 运行仿真分析
await callApi('ops/startSimulate');

// 运行异常检测
await callApi('ops/runSanitizer');
```

## 类型定义

### InitOpsParams
```typescript
{
  accendEnvScript?: string;
  projectPath?: string;
  projectName?: string;
}
```

### CreateOpsParams
```typescript
{
  projectName?: string;
  projectId?: string;
  prototypeName?: string;
}
```

### CreateOpsByPrototypeParams
```typescript
{
  opsPrototypeFile: string;
  opType?: 'ascend' | 'cann';
}
```

### StartBuildParams
```typescript
{
  configId?: string;
  compileOption?: string;  // '--debug' 或 '--mssanitizer'
}
```

### SaveBuildConfigParams
```typescript
{
  data: any;
  showMessage?: boolean;
}
```

### SaveConfigParams
```typescript
{
  type: string;
  data: any;
  showMessage?: boolean;
}
```

## 架构说明

1. **单例模式**: `OpsOption` 实例通过单例模式管理，确保在整个插件生命周期中只有一个实例
2. **全局 Context**: ExtensionContext 通过 `globalThis.extensionContext` 在插件激活时设置，供 API 层使用
3. **类型安全**: 所有参数和返回值都有明确的类型定义，位于 `shared/api-types/ops.d.ts`
4. **错误处理**: 继承 ApiServer 的全局错误处理机制，支持自动错误提示

## 对比原有调用方式

### 之前（直接调用 OpsOption 方法）
```typescript
const opsOption = new OpsOption(context);
await opsOption.startBuild('123', '--debug');
```

### 现在（通过 API 层调用）
```typescript
// Webview 端
await callApi('ops/startBuild', {
  configId: '123',
  compileOption: '--debug'
});
```

## 优势

1. ✅ **解耦**: Webview 与插件逻辑分离，通过统一的 API 层通信
2. ✅ **类型安全**: 参数和返回值类型明确，减少运行时错误
3. ✅ **可维护性**: 集中管理 API 定义，便于维护和扩展
4. ✅ **一致性**: 与其他 API（performance、view、msSanitizer）保持一致的结构
5. ✅ **错误处理**: 统一的错误处理和用户提示机制
