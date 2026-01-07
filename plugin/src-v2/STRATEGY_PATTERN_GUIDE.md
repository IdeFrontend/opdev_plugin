# 策略模式架构使用指南

> **导航**: [← 返回项目主页](../../README.md) | [← V2 架构概览](README.md) | [快速开始](QUICKSTART.md) | [重构总结](REFACTORING_SUMMARY.md)

---

## 📐 架构概览

V2 架构采用**策略模式 + 责任链模式**,支持灵活的算子执行流程定制。

```
Controller → Application → Orchestrator → Strategy Factory → Concrete Strategy → Steps → Executor
```

## 🎯 核心概念

### 1. 执行步骤 (Execution Step)
单一职责的原子操作,可组合、可复用。

```typescript
// 示例:构建步骤
class BuildStep implements IExecutionStep {
  readonly name = 'Build';
  async execute(context: ExecutionContext): Promise<Result<unknown, Error>> {
    // 执行构建逻辑
  }
}
```

### 2. 执行策略 (Execution Strategy)
步骤的有序组合,定义完整的任务流程。

```typescript
// 示例:标准上板策略
class StandardOnBoardStrategy extends AbstractExecutionStrategy {
  getSteps() {
    return [
      new BuildForOnBoardStep(),  // 步骤 1: 上板前编译
      new OnBoardStep(),           // 步骤 2: 上板分析
    ];
  }
}
```

### 3. 策略工厂 (Strategy Factory)
根据任务类型和变体创建对应策略。

```typescript
const strategy = factory.create({
  taskType: TaskType.ON_BOARD,
  variant: StrategyVariant.STANDARD,
});
```

## 📝 使用示例

### 示例 1: 使用现有策略

```typescript
// 在 BuildOrchestratorService 中
const result = await orchestrator.onBoardWithStrategy(
  buildConfigId,
  onBoardConfigId,
  exampleConfigId,
  StrategyVariant.STANDARD,  // 使用标准策略
);
```

### 示例 2: 创建自定义策略

```typescript
// 1. 创建自定义策略类
class CustomValidationStrategy extends AbstractExecutionStrategy {
  readonly strategyName = 'custom-validation';

  getSteps() {
    return [
      new BuildStep(this.commandGenerator),       // 普通编译
      new CustomValidationStep(),                 // 自定义验证
      new BuildForOnBoardStep(this.commandGenerator), // 上板前编译
      new OnBoardStep(this.commandGenerator),     // 上板分析
    ];
  }
}

// 2. 注册策略
const factory = orchestrator.getStrategyFactory();
factory.register(
  TaskType.ON_BOARD,
  StrategyVariant.CUSTOM,
  () => new CustomValidationStrategy(commandGenerator)
);

// 3. 使用自定义策略
const result = await orchestrator.onBoardWithStrategy(
  buildConfigId,
  onBoardConfigId,
  exampleConfigId,
  StrategyVariant.CUSTOM,
);
```

### 示例 3: 配置驱动的策略选择

```typescript
// 1. 设置项目配置
const config: OperatorProjectConfig = {
  projectId: 12345,
  projectType: OperatorProjectType.CUSTOM,
  taskStrategies: {
    [TaskType.ON_BOARD]: {
      taskType: TaskType.ON_BOARD,
      variant: StrategyVariant.WITH_VALIDATION,  // 使用带验证的策略
    },
  },
};

// 2. 保存配置
await strategyConfigRepo.saveProjectConfig(config);

// 3. 自动应用配置的策略
const result = await buildService.startOnBoard();
// 自动使用 WITH_VALIDATION 策略
```

## 🔧 扩展新算子类型

### 步骤 1: 创建自定义执行步骤

```typescript
// 创建特殊的验证步骤
export class CustomValidationStep implements IExecutionStep {
  readonly name = 'CustomValidation';

  async execute(context: ExecutionContext): Promise<Result<unknown, Error>> {
    // 实现自定义验证逻辑
    console.log('执行自定义验证...');

    // 可以访问 context 中的参数
    const customParam = context.parameters?.customParam;

    // 返回验证结果
    return ResultUtils.ok({ validated: true });
  }

  // 可选:根据条件跳过步骤
  canSkip(context: ExecutionContext): boolean {
    return context.parameters?.skipValidation === true;
  }
}
```

### 步骤 2: 组合成新策略

```typescript
export class SpecialProjectStrategy extends AbstractExecutionStrategy {
  readonly strategyName = 'special-project';

  getSteps() {
    return [
      new BuildStep(this.commandGenerator, '--special-flag'),
      new CustomValidationStep(),
      new BuildForOnBoardStep(this.commandGenerator),
      new CustomDataCollectionStep(),  // 额外的数据收集步骤
      new OnBoardStep(this.commandGenerator),
    ];
  }
}
```

### 步骤 3: 注册并使用

```typescript
// 在服务初始化时注册
orchestrator.getStrategyFactory().register(
  TaskType.ON_BOARD,
  'special' as StrategyVariant,
  () => new SpecialProjectStrategy(commandGenerator)
);

// 使用
const result = await orchestrator.onBoardWithStrategy(
  buildConfigId,
  onBoardConfigId,
  exampleConfigId,
  'special' as StrategyVariant,
);
```

## 🎨 内置策略

### 上板策略
- `STANDARD`: 标准上板 (编译 + 上板)
- `FAST`: 快速上板 (跳过编译)
- `WITH_VALIDATION`: 带验证上板 (编译 + 验证 + 上板编译 + 上板)

### 仿真策略
- `STANDARD`: 标准仿真 (仿真前编译 + 仿真分析)

### 异常检测策略
- `STANDARD`: 标准异常检测 (带 --mssanitizer 编译 + 异常检测)

## 📊 配置系统

### 项目类型
```typescript
enum OperatorProjectType {
  AICORE_STANDARD = 'aicore-standard',
  VECTOR_STANDARD = 'vector-standard',
  CUSTOM = 'custom',
  HYBRID = 'hybrid',
}
```

### 默认策略配置
```typescript
DefaultStrategyConfigs.CONFIGS = {
  'aicore-standard': {
    onboard: { variant: 'standard' },
    simulate: { variant: 'standard' },
  },
  'custom': {
    onboard: { variant: 'with-validation' },  // 自定义项目需要验证
  },
};
```

## 🧪 测试

### 测试单个步骤
```typescript
test('BuildStep should execute build command', async () => {
  const step = new BuildStep(mockCommandGenerator);
  const context = {
    buildConfigId: 123,
    executor: mockExecutor,
  };

  const result = await step.execute(context);
  expect(ResultUtils.isOk(result)).toBe(true);
});
```

### 测试策略组合
```typescript
test('StandardOnBoardStrategy should have 2 steps', () => {
  const strategy = new StandardOnBoardStrategy(mockCommandGenerator);
  expect(strategy.getSteps()).toHaveLength(2);
  expect(strategy.getSteps()[0].name).toBe('BuildForOnBoard');
  expect(strategy.getSteps()[1].name).toBe('OnBoard');
});
```

## 🚀 最佳实践

1. **单一职责**: 每个步骤只做一件事
2. **可复用**: 通用步骤可在多个策略中复用
3. **可配置**: 通过参数而非硬编码控制行为
4. **错误处理**: 使用 Result 模式,明确错误类型
5. **可测试**: 步骤和策略都可独立测试
6. **向后兼容**: 保留原有方法,新增策略方法

## 📖 API 参考

### BuildOrchestratorService

#### 原有方法(保持兼容)
- `simulate()`: 标准仿真
- `onBoard()`: 标准上板
- `sanitizer()`: 标准异常检测

#### 新增策略方法
- `simulateWithStrategy(buildId, simulateId, exampleId, simulatorType, variant)`
- `onBoardWithStrategy(buildId, onBoardId, exampleId, variant)`
- `sanitizerWithStrategy(buildId, sanitizerId, exampleId, variant)`
- `getStrategyFactory()`: 获取工厂用于注册自定义策略

### ExecutionStrategyFactory

- `create(selector)`: 创建策略
- `register(taskType, variant, factory)`: 注册策略
- `registerCustom(id, factory)`: 注册自定义策略
- `listStrategies()`: 列出所有已注册策略

## 🔄 迁移指南

### 从硬编码到策略模式

**Before:**
```typescript
// 硬编码:每个算子类型都需要修改代码
async onBoard() {
  if (projectType === 'aicore') {
    // AiCore 逻辑
  } else if (projectType === 'custom') {
    // Custom 逻辑
  }
}
```

**After:**
```typescript
// 策略模式:通过配置选择策略
const variant = config.taskStrategies.onboard.variant;
await orchestrator.onBoardWithStrategy(..., variant);
```

## 💡 FAQ

**Q: 如何知道使用哪个策略?**
A: 通过项目配置自动选择,或手动指定 `StrategyVariant`。

**Q: 能否动态修改策略?**
A: 可以,通过更新项目配置或直接调用 `WithStrategy` 方法指定。

**Q: 如何调试策略执行?**
A: 每个步骤都有 `name` 属性,可以添加日志追踪执行流程。

**Q: 策略执行失败如何处理?**
A: 使用 Result 模式,检查 `ResultUtils.isErr(result)` 并获取详细错误信息。

---

## 📞 联系支持

如有问题,请参考:
- 源码: `plugin/src-v2/domain/operator/strategies/`
- 测试: `plugin/src-v2/domain/operator/strategies/__tests__/`
- 配置: `plugin/src-v2/domain/operator/config/strategy-config.ts`
