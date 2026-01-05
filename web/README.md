# 脚本功能

- `dev`: 启动本地开发服务器
- `build`: 类型检查并产出生产包
- `build:debug`: 调试模式构建
- `preview`: 预览打包结果

# 视图结构说明

本项目采用 MPA (Multi-Page Application) 架构。

## 目录结构

所有视图位于 `web/src/views/` 目录下，每个视图是一个独立的文件夹，包含完整的入口文件。

推荐的视图目录结构如下：

```text
web/src/views/
└── {view-name}/             # 视图名称
    ├── app.vue              # 根组件
    ├── main.ts              # 入口脚本
    ├── {view-name}.html     # 入口 HTML
    └── components/          # 视图私有组件
```

## 新增视图步骤

1. 在 `web/src/views/` 下创建新的视图目录（例如 `my-view`）。
2. 添加 `my-view.html`, `main.ts`, `app.vue`。
3. 在 `web/vite.config.ts` 中的 `TEMP_MULTI_ENTRIES` 数组中添加视图名称（例如 `'my-view'`）。
4. 在 Plugin 端注册视图时，使用该名称作为路由路径。
