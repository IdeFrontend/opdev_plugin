# Huawei OP DevTools (VS Code Plugin)

华为算子一站式开发平台 VS Code 插件。提供算子开发、调试、性能分析等一站式功能。

## 📁 目录结构

```text
├── plugin/                 # VS Code 插件主进程代码 (Extension Host)
│   ├── src/
│   │   ├── controller/     # 业务控制器 (处理 Webview 消息)
│   │   ├── core/           # 核心架构层
│   │   │   ├── storage/    # 数据存储服务 (JsonStorage)
│   │   │   ├── view/       # Webview 视图管理与路由
│   │   │   └── ...
│   │   ├── domain/         # 领域业务逻辑 (原 autogen-server 移植)
│   │   │   ├── models/     # 业务实体模型
│   │   │   └── services/   # 领域服务 (Project, Ops 等)
│   │   ├── service/        # 应用层服务
│   │   └── api-routes.ts   # API 路由定义
│   └── templates/          # 工程与代码模板
│
├── web/                    # 插件前端 UI 代码 (WebView)
│   ├── src/
│   │   ├── views/          # 各功能页面 (Vue 3 组件)
│   │   ├── apis/           # 前端 API 封装
│   │   └── ...
│   └── vite.config.ts      # Vite 构建配置
│
├── shared/                 # 前后端共享模块 (Workspace Package)
│   ├── api-types/          # 共享类型定义
│   └── i18n/               # 国际化资源
│
├── server_legacy/          # [已归档] 旧版 Python 后端服务
│
├── scripts/                # 构建与工具脚本
└── resources/              # 静态资源 (图标、图片等)
```

## 🛠️ 开发脚本

- `pnpm run package`: 编译并打包 VS Code 扩展 (.vsix)
- `pnpm run compile`: 执行全量编译 (Web + Plugin)
- `pnpm run compile:web`: 仅构建前端 Webview 代码
- `pnpm run compile:plugin`: 仅构建插件主进程代码
- `pnpm run compile:debug`: 调试模式构建 (带 SourceMap)
- `pnpm run lint`: 代码风格检查
