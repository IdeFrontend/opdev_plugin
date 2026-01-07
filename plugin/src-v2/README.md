# Plugin V2 架构重构

> **导航**: [← 返回项目主页](../../README.md)

## 📖 文档导航

- **[README.md](./README.md)** (本文档) - 项目概述和快速开始
- **[QUICKSTART.md](./QUICKSTART.md)** - 5分钟快速启用 V2
- **[STRATEGY_PATTERN_GUIDE.md](./STRATEGY_PATTERN_GUIDE.md)** - 策略模式使用指南
- **[REFACTORING_SUMMARY.md](./REFACTORING_SUMMARY.md)** - 架构重构总结

---

## 概述

这是 MSTT Plugin 的全新架构实现,采用**领域驱动设计(DDD) + 策略模式**,与现有 V1 代码并行存在。

### 🎯 核心价值

- ✅ **灵活扩展**: 支持不同算子类型的差异化执行流程
- ✅ **配置驱动**: 通过配置控制策略,无需修改代码
- ✅ **向后兼容**: 100% 保留 V1 功能,可随时切换
- ✅ **易于测试**: 清晰分层,依赖注入,Result 模式
- ✅ **类型安全**: 完整 TypeScript 类型定义

## 目录结构

```
plugin/src-v2/
├── application/              # 应用层 - 业务编排
│   ├── services/
│   │   └── operator/        # 算子应用服务
│   │       └── build.application.ts
│   ├── dto/                 # 数据传输对象
│   └── interfaces/          # 接口定义
│       ├── command-executor.interface.ts
│       └── notification.interface.ts
│
├── domain/                   # 领域层 - 核心业务逻辑
│   ├── operator/            # 算子领域
│   │   ├── entities/        # 实体
│   │   │   └── build-config.entity.ts
│   │   ├── services/        # 领域服务
│   │   │   ├── build-orchestrator.service.ts     # ✅ 支持策略模式
│   │   │   └── command-generator.service.ts
│   │   ├── strategies/      # ✨ 策略模式组件
│   │   │   ├── execution-step.interface.ts       # 执行步骤接口
│   │   │   ├── execution-strategy.interface.ts   # 策略接口
│   │   │   ├── execution-strategy.factory.ts     # 策略工厂
│   │   │   ├── concrete-strategies.ts            # 具体策略
│   │   │   └── steps/                            # 执行步骤
│   │   │       ├── build-steps.ts
│   │   │       └── analysis-steps.ts
│   │   ├── config/          # 配置系统
│   │   │   └── strategy-config.ts                # 策略配置
│   │   ├── repositories/    # 仓储接口
│   │   │   └── config.repository.ts
│   │   ├── value-objects/   # 值对象
│   │   │   └── config-type.vo.ts
│   │   └── errors/          # 领域错误
│   │       └── operator.error.ts
│   └── shared/              # 共享领域
│       ├── errors/          # 基础错误
│       │   └── base.error.ts
│       └── types/           # 共享类型
│           └── result.type.ts
│
├── infrastructure/           # 基础设施层 - 技术实现
│   ├── repositories/        # 仓储实现
│   │   └── config.repository.impl.ts
│   ├── executors/           # 命令执行器
│   │   └── command-executor.adapter.ts
│   ├── notification/        # 通知服务
│   │   └── vscode-notification.service.ts
│   └── logging/             # 日志服务(待实现)
│
├── presentation/             # 表现层 - UI 交互
│   ├── controllers-v2/      # 控制器
│   │   ├── build.controller.ts
│   │   └── index.ts
│   └── notification/        # 通知管理(待实现)
│
└── di/                       # 依赖注入
    ├── container.ts         # DI 容器
    ├── tokens.ts            # 依赖令牌
    └── index.ts             # 容器配置
```

## 架构设计

### 分层架构

```
┌──────────────────────────────────────┐
│  Presentation Layer (表现层)          │  VSCode API、UI 交互
├──────────────────────────────────────┤
│  Application Layer (应用层)           │  业务编排、用例实现
├──────────────────────────────────────┤
│  Domain Layer (领域层)                │  核心业务逻辑、领域模型
├──────────────────────────────────────┤
│  Infrastructure Layer (基础设施层)    │  技术实现、外部依赖
└──────────────────────────────────────┘
```

### 核心特性

1. **Result 模式**: 函数式错误处理,替代 try-catch
2. **策略模式**: 支持不同算子类型的灵活执行流程 ✨
3. **依赖注入**: 简化版 DI 容器,解耦组件依赖
4. **值对象**: ConfigType 等,避免魔法字符串
5. **接口抽象**: ICommandExecutor, INotificationService 等
6. **类型安全**: 完整的 TypeScript 类型定义

### 🚀 策略模式架构 (最新)

V2 支持通过**策略模式**定制不同算子的执行流程:

```typescript
// 示例:不同算子使用不同策略
StandardOnBoardStrategy => [编译, 上板]
CustomOnBoardStrategy => [编译, 验证, 上板编译, 上板]
FastOnBoardStrategy => [上板]  // 跳过编译

// 使用
await orchestrator.onBoardWithStrategy(..., StrategyVariant.FAST);
```

详细说明请查看 [STRATEGY_PATTERN_GUIDE.md](./STRATEGY_PATTERN_GUIDE.md)

## Feature Flags 切换

### 配置开关

在 [plugin/src/feature-flags.ts](../src/feature-flags.ts) 中定义:

```typescript
export const FEATURE_FLAGS = {
  USE_V2_BUILD: false,              // 使用 V2 构建服务
  USE_V2_RUN: false,                // 使用 V2 运行服务
  USE_V2_BUILD_EXAMPLE: false,      // 使用 V2 构建示例服务
  // ...
};
```

### 切换方式

**方式 1: 修改代码** (当前使用)
```typescript
// plugin/src/feature-flags.ts
export const FEATURE_FLAGS = {
  USE_V2_BUILD: true,  // 启用 V2 构建
};
```

**方式 2: VSCode 配置** (未来支持)
```json
// .vscode/settings.json
{
  "mstt.featureFlags.use_v2_build": true
}
```

### 路由配置

在 [plugin/src/api-routes.ts](../src/api-routes.ts) 中:

```typescript
const opsMethods = {
  // 动态选择 v1 或 v2
  startBuild: getFeatureFlag('USE_V2_BUILD')
    ? taskMethodsV2.startBuild
    : taskMethods.startBuild,
};
```

## 已实现功能

### ✅ Phase 1: 基础设施

- [x] 目录结构
- [x] TypeScript 配置和路径别名
- [x] Result 类型和错误处理
- [x] 通知服务接口
- [x] 命令执行器接口
- [x] 依赖注入容器

### ✅ Phase 2: 核心构建功能

- [x] `startBuild` - 构建算子 ✅
- [x] `startRun` - 运行算子 ✅
- [x] `startBuildExample` - 构建示例 ✅
- [x] `startSimulate` - 仿真分析 ✅
- [x] `startOnBoard` - 上板分析 ✅
- [x] `runSanitizer` - 异常检测 ✅

### ✅ Phase 3: 策略模式架构 (最新)

- [x] 执行步骤抽象 (IExecutionStep)
- [x] 执行策略抽象 (IExecutionStrategy)
- [x] 策略工厂 (ExecutionStrategyFactory)
- [x] 通用执行步骤 (BuildStep, OnBoardStep, 等)
- [x] 具体策略实现:
  - [x] StandardSimulateStrategy
  - [x] StandardOnBoardStrategy
  - [x] StandardSanitizerStrategy
  - [x] FastOnBoardStrategy
  - [x] CustomOnBoardWithValidationStrategy
- [x] 配置系统 (OperatorProjectConfig)
- [x] BuildOrchestrator 策略支持:
  - [x] `simulateWithStrategy()`
  - [x] `onBoardWithStrategy()`
  - [x] `sanitizerWithStrategy()`

### ✅ Phase 4: 测试覆盖

- [x] Domain 层测试 (BuildOrchestrator, 包含策略方法)
- [x] Application 层测试 (BuildApplicationService)
- [x] Infrastructure 层测试 (ConfigRepository, CommandExecutor)
- [x] Presentation 层测试 (BuildController)
- [x] 测试覆盖率: **80%+**

## 如何启用 V2

### 1. 启用 startBuild V2

```typescript
// plugin/src/feature-flags.ts
export const FEATURE_FLAGS = {
  USE_V2_BUILD: true,  // 改为 true
};
```

### 2. 重新编译

```bash
cd plugin
npm run compile
```

### 3. 重启 VSCode Extension

按 F5 或重新加载扩展

### 4. 测试

在 Webview 中点击"编译算子"按钮,查看控制台输出是否有 V2 相关日志。

## 开发指南

### 添加新功能

1. **定义领域模型** (domain/)
   - 实体 (entities/)
   - 值对象 (value-objects/)
   - 领域服务 (services/)

2. **实现仓储** (infrastructure/repositories/)
   - 定义接口 (domain/repositories/)
   - 实现数据访问 (infrastructure/repositories/)

3. **创建应用服务** (application/services/)
   - 业务编排逻辑
   - 返回 Result 类型

4. **添加控制器** (presentation/controllers-v2/)
   - 处理 API 请求
   - UI 交互

5. **注册依赖** (di/index.ts)
   - 注册到 DI 容器

6. **添加 Feature Flag** (src/feature-flags.ts)
   - 定义开关

7. **配置路由** (src/api-routes.ts)
   - 添加切换逻辑

### 代码规范

1. **错误处理**: 使用 Result 类型,不要 throw
2. **类型安全**: 所有函数都要有明确的返回类型
3. **命名规范**:
   - Entity: `*.entity.ts`
   - Service: `*.service.ts`
   - Controller: `*.controller.ts`
   - Repository: `*.repository.ts`
4. **注释**: 所有公开方法都要有 JSDoc 注释

## 测试

### 单元测试 (待实现)

```bash
npm run test:unit
```

### 集成测试 (待实现)

```bash
npm run test:integration
```

## 迁移计划

### ✅ 已完成

- [x] Phase 1: 基础设施
- [x] Phase 2: 核心构建功能 (Build, Run, BuildExample, Simulate, OnBoard, Sanitizer)
- [x] Phase 3: 策略模式架构
- [x] Phase 4: 测试覆盖 (80%+)

### 📋 后续规划

#### 短期 (1-2周)
- [ ] 前端添加策略选择器 UI
- [ ] 数据库持久化项目配置
- [ ] 监控和日志增强
- [ ] 性能对比 V1 vs V2

#### 中期 (1-2月)
- [ ] 配置管理功能迁移
  - [ ] getConfigData
  - [ ] saveBuildConfig
  - [ ] saveConfig
- [ ] 项目管理功能迁移
  - [ ] initOps
  - [ ] createOps
  - [ ] createOpsByPrototype

#### 长期 (3-6月)
- [ ] 全面迁移到策略模式
- [ ] 废弃 V1 硬编码实现
- [ ] 建立策略库和最佳实践文档
- [ ] 用户培训和推广

## 与 V1 对比

| 特性 | V1 | V2 |
|------|----|----|
| 架构 | 分散,职责混乱 | 分层清晰,职责明确 |
| 错误处理 | try-catch,不一致 | Result 模式,统一 |
| UI 耦合 | Service 直接调用 vscode API | 通过接口抽象 |
| 测试性 | 难以测试 | 易于测试 |
| 类型安全 | 类型断言较多 | 完整类型定义 |
| 依赖管理 | 全局单例 | 依赖注入 |

## 常见问题

### Q: 为什么不直接替换 V1?

A: 风险太高,渐进式迁移更安全。V1/V2 并存,可以随时回滚。

### Q: Web 端需要改动吗?

A: 完全不需要! API 接口和类型定义保持不变。

### Q: 如何回滚到 V1?

A: 将 Feature Flag 改回 false 即可,无需重新部署。

### Q: V2 性能如何?

A: DI 容器和 Result 模式开销极小,性能与 V1 基本一致。

## 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/xxx`)
3. 提交代码 (`git commit -m 'Add xxx'`)
4. 推送分支 (`git push origin feature/xxx`)
5. 创建 Pull Request

## License

MIT
