# Huawei OP DevTools (VS Code Plugin)

华为算子一站式开发平台 VS Code 插件。提供算子开发、调试、性能分析等一站式功能。

## 📖 文档导航

### 🎯 我是新手，想快速上手
1. **[开发环境搭建](#极速开发指南-保姆级教程)** - 本文档下方，3步启动热更新开发
2. **[目录结构说明](#📁-目录结构)** - 了解项目组织方式
3. **[构建脚本说明](#📦-构建脚本)** - 掌握常用命令

### 🎨 我是前端开发者
1. **[Web 模块开发指南](https://gitcode.com/kaocong/mstt/blob/vscode_plugin/web/README.md)** - MPA架构、视图结构、构建脚本
2. **[Ops API 使用指南](https://gitcode.com/kaocong/mstt/blob/vscode_plugin/web/src/apis/OPS_API_USAGE.md)** - 前端调用算子操作 API（完整示例）
3. **[开发环境搭建](#极速开发指南-保姆级教程)** - 配置热更新环境

### 🔧 我是后端/架构师
1. **[Plugin V2 架构概览](https://gitcode.com/kaocong/mstt/blob/vscode_plugin/plugin/src-v2/README.md)** - DDD分层架构、Feature Flags、依赖注入
2. **[策略模式使用指南](https://gitcode.com/kaocong/mstt/blob/vscode_plugin/plugin/src-v2/STRATEGY_PATTERN_GUIDE.md)** - 扩展新算子类型、自定义执行流程
3. **[架构重构总结](https://gitcode.com/kaocong/mstt/blob/vscode_plugin/plugin/src-v2/REFACTORING_SUMMARY.md)** - 设计模式应用、代码统计、最佳实践

### ⚡ 我想体验 V2 新架构
- **[V2 快速开始](https://gitcode.com/kaocong/mstt/blob/vscode_plugin/plugin/src-v2/QUICKSTART.md)** - 5分钟启用 V2，对比 V1/V2 差异

### 📊 文档关系图

```
项目根目录 (README.md) ────────────────────┐
│                                           │
├─ 前端开发 ────────────────┐               │
│  │                         │               │
│  ├─ Web 模块 (web/README.md)              │
│  │                         │               │
│  └─ Ops API 使用 (web/src/apis/OPS_API_USAGE.md)
│                                            │
└─ 后端架构 ────────────────┬────────────────┘
   │                        │
   └─ Plugin V2 (plugin/src-v2/README.md) ──┬──────┐
      │                                      │      │
      ├─ 快速开始 (QUICKSTART.md)           │      │
      ├─ 策略模式指南 (STRATEGY_PATTERN_GUIDE.md) │
      └─ 重构总结 (REFACTORING_SUMMARY.md) ───────┘
```

---

## 📁 目录结构

```text
├── plugin/                      # VS Code 插件主进程代码 (Extension Host)
│   ├── src/                     # V1 实现代码
│   │   ├── controller/          # 业务控制器 (处理 Webview 消息)
│   │   ├── core/                # 核心架构层
│   │   │   ├── storage/         # 数据存储服务 (JsonStorage)
│   │   │   ├── view/            # Webview 视图管理与路由
│   │   │   ├── project/         # 项目管理
│   │   │   ├── api-server.ts    # API 服务器
│   │   │   └── connector.ts     # 连接器
│   │   ├── domain/              # 领域业务逻辑
│   │   ├── service/             # 应用层服务
│   │   ├── routes/              # 路由定义
│   │   ├── helpers/             # 工具函数
│   │   ├── api-routes.ts        # API 路由配置
│   │   ├── feature-flags.ts     # V1/V2 功能开关
│   │   └── extension.ts         # 插件入口
│   ├── src-v2/                  # V2 架构实现 (DDD + 策略模式)
│   │   ├── application/         # 应用层 - 业务编排
│   │   ├── domain/              # 领域层 - 核心业务逻辑
│   │   ├── infrastructure/      # 基础设施层 - 技术实现
│   │   ├── presentation/        # 表现层 - UI 交互
│   │   └── di/                  # 依赖注入容器
│   └── templates/               # 工程与代码模板
│
├── web/                         # 插件前端 UI 代码 (WebView)
│   ├── src/
│   │   ├── views/               # 各功能页面 (Vue 3 组件, MPA 架构)
│   │   ├── apis/                # 前端 API 封装
│   │   ├── core/                # 核心功能
│   │   ├── utils/               # 工具函数
│   │   └── assets/              # 静态资源
│   ├── resources/               # 资源文件 (图标、图片等)
│   ├── vite-plugins/            # Vite 插件
│   └── vite.config.ts           # Vite 构建配置
│
├── shared/                      # 前后端共享模块 (Workspace Package)
│   ├── api-types/               # 共享类型定义
│   ├── api-server/              # API 服务器共享代码
│   ├── connector/               # 连接器共享代码
│   └── i18n/                    # 国际化资源
│
└── scripts/                     # 构建与工具脚本
```

## � 极速开发指南 (保姆级教程)

本插件支持 **热更新 (Hot Module Replacement)** 开发模式。这意味着你修改代码后，**不需要**每次都重新打包或重启插件，改动会即时生效！

请严格按照以下 3 个步骤操作：

### 第一步：准备工作

确保你已经安装了所有依赖。在项目根目录下打开终端，执行：

```bash
pnpm install
```

### 第二步：启动前端热更新服务

1.  在 VS Code 中，点击顶部菜单栏的 `终端(Terminal)` -> `新建终端(New Terminal)`。
2.  在下方的终端窗口中，输入以下命令并回车：

    ```bash
    cd web
    pnpm dev
    ```

3.  当你看到类似下面的输出时，说明启动成功：
    ```text
      ➜  Local:   http://localhost:5173/
      ➜  Network: use --host to expose
    ```
    ⚠️ **注意**：**请不要关闭这个终端窗口！** 把它最小化或者放在一边即可。

### 第三步：启动插件调试模式

1.  点击 VS Code 左侧活动栏的 **“运行和调试”** 图标（也就是那只带播放按钮的虫子图标），或者直接按快捷键 `Ctrl + Shift + D`。
2.  在顶部的下拉选择框中，找到并选中 **"调试vscode扩展 (Hot Mode)"**。
3.  点击绿色的 ▶️ 播放按钮，或者直接按 `F5` 键。
4.  此时会自动弹出一个新的 VS Code 窗口（标题栏会显示 `[扩展开发宿主]`），这个新窗口就是运行了我们插件的测试环境。

---

### 🎉 开始愉快地写代码吧！

现在你已经进入了极速开发模式：

- **如果你修改了 `web/` 目录下的前端代码（Vue文件）：**
  - 直接保存文件 (`Ctrl + S`)。
  - **新窗口**里的插件界面会自动刷新，立刻显示你的修改！无需任何操作。

- **如果你修改了 `plugin/` 目录下的插件逻辑代码（TS文件）：**
  - 直接保存文件 (`Ctrl + S`)。
  - 观察 VS Code底部的状态栏，会看到构建任务在自动运行。
  - 切换到那个弹出的 **[扩展开发宿主]** 新窗口。
  - 按下快捷键 `Ctrl + R` (Reload Window) 刷新窗口，你的修改就生效了！

## 📦 构建脚本

- `pnpm run package`: 编译并打包 VS Code 扩展 (.vsix)
- `pnpm run compile`: 执行全量编译 (Web + Plugin)
- `pnpm run compile:web`: 仅构建前端 Webview 代码
- `pnpm run compile:plugin`: 仅构建插件主进程代码
- `pnpm run compile:debug`: 调试模式构建 (带 SourceMap)
- `pnpm run lint`: 代码风格检查
