# V2 快速开始指南

> **导航**: [← 返回项目主页](../../README.md) | [V2 架构概览](README.md) | [策略模式指南](STRATEGY_PATTERN_GUIDE.md) | [重构总结](REFACTORING_SUMMARY.md)

---

## 5 分钟启用 V2

### Step 1: 启用 V2 构建功能

```bash
cd plugin/src-v2
node toggle-v2.js enable build
```

### Step 2: 编译插件

```bash
cd ..
npm run compile
```

### Step 3: 启动调试

按 `F5` 键启动 VSCode Extension 调试

### Step 4: 测试功能

在新窗口中:
1. 打开一个算子项目
2. 打开 Webview 操作面板
3. 点击"编译算子"
4. 观察控制台输出

**成功标志**: 看到 `[V2]` 开头的日志

---

## 查看 V2 状态

```bash
node toggle-v2.js status
```

输出示例:
```
📊 V2 功能状态:

┌─────────────────┬──────────┐
│ 功能            │ 状态     │
├─────────────────┼──────────┤
│ build           │ ✅ 启用  │
│ run             │ ✅ 启用  │
│ buildExample    │ ✅ 启用  │
│ simulate        │ ❌ 禁用  │
│ onBoard         │ ❌ 禁用  │
│ sanitizer       │ ❌ 禁用  │
└─────────────────┴──────────┘

进度: 3/6 (50%) 功能已迁移到 V2
```

---

## 常用命令

### 启用所有已实现的 V2 功能

```bash
node toggle-v2.js enable all
```

### 禁用所有 V2 功能 (回退到 V1)

```bash
node toggle-v2.js disable all
```

### 启用单个功能

```bash
node toggle-v2.js enable build        # 启用构建
node toggle-v2.js enable run          # 启用运行
node toggle-v2.js enable buildExample # 启用示例构建
```

### 禁用单个功能

```bash
node toggle-v2.js disable build
```

---

## 开发模式

### 监听文件变化自动编译

```bash
cd plugin
npm run watch
```

在另一个终端:
```bash
# 修改代码后,自动重新编译
# 在调试窗口按 Ctrl+R 重新加载扩展
```

---

## 添加调试日志

编辑控制器文件,添加日志:

```typescript
// plugin/src-v2/presentation/controllers-v2/build.controller.ts
async startBuild(params: StartBuildParams = {}): Promise<void> {
  console.log('[V2] startBuild called:', params);  // 添加这行

  try {
    await this.projectManager.initProject();
    console.log('[V2] Project initialized');      // 添加这行

    // ... 后续代码
  }
}
```

重新编译后,在调试控制台查看日志。

---

## 快速测试流程

### 1. 测试编译功能

```bash
# 启用 V2
node toggle-v2.js enable build

# 编译
cd ..
npm run compile

# 按 F5 调试
# 在新窗口点击"编译算子"
```

### 2. 对比 V1/V2 行为

```bash
# 测试 V2
node toggle-v2.js enable build
# ... 测试并记录结果

# 测试 V1
node toggle-v2.js disable build
# ... 测试并对比
```

### 3. 验证错误处理

触发错误场景:
- 配置缺失: 删除 `.vscode/devtool_config.json`
- 编译失败: 修改算子代码引入语法错误

观察 V2 的错误提示是否更清晰。

---

## 故障排除

### 问题 1: 修改 feature-flags 不生效

**解决**:
```bash
# 清理编译产物
rm -rf out/

# 重新编译
npm run compile

# 重启调试 (按 Ctrl+Shift+F5)
```

### 问题 2: TypeScript 编译错误

**解决**:
```bash
# 检查编译错误
npm run compile

# 查看详细错误
npx tsc --noEmit
```

### 问题 3: 看不到 V2 日志

**检查**:
1. 确认 feature flag 已启用
2. 确认重新编译
3. 确认重新加载扩展

---

## 下一步

完成基础测试后:

1. 📖 阅读 [README.md](./README.md) 了解架构
2. 🧪 查看 [TESTING.md](./TESTING.md) 进行完整测试
3. 🔧 学习 [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) 迁移新功能
4. 📚 浏览 [INDEX.md](./INDEX.md) 查看所有文档

---

## 快速参考

| 命令 | 用途 |
|------|------|
| `node toggle-v2.js status` | 查看状态 |
| `node toggle-v2.js enable build` | 启用构建 |
| `node toggle-v2.js disable build` | 禁用构建 |
| `node toggle-v2.js enable all` | 启用全部 |
| `npm run compile` | 编译插件 |
| `npm run watch` | 监听模式 |
| `F5` | 启动调试 |
| `Ctrl+R` | 重新加载扩展 |

---

**5 分钟即可体验 V2 架构!** 🚀
