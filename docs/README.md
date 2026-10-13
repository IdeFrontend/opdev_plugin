# 项目文档

## 目录说明

关键目录结构如下：

```text
docs
├── assets                     # 图片资源目录
├── design-docs                # 设计与实现规范目录（面向插件维护者）
│   └── README.md              # 设计文档索引
├── user_guide.md              # 插件使用操作文档
└── README.md
```

## 文档说明

为方便开发者快速熟悉本项目，可按需获取对应文档，文档内容包括：

| 文档 | 面向对象 | 内容介绍 |
|---|---|---|
| [使用操作文档](./user_guide.md) | 使用本插件进行Ascend C算子开发的开发者。 | 介绍插件的环境准备，以及算子工程创建、代码开发、编译部署与运行、算子调试、异常检测、性能分析的完整使用流程。 |
| [设计文档索引](./design-docs/README.md) | 插件维护者与代码贡献者。 | 插件设计与实现规范索引，覆盖环境规格、编译运行调试集成、异常检测、性能分析、算子工程生成等模块。 |

## 附录

除了上述系统性介绍的相关文档外，您还可以根据实际场景和开发阶段，有选择性地快速了解插件所集成的CANN工具链资料。

- 工具链文档
  - [mssanitizer使用文档](https://gitcode.com/Ascend/mssanitizer/blob/master/docs/zh/user_guide/mssanitizer_user_guide.md)
  - [npu-check用户手册](https://gitcode.com/cann/asc-tools/blob/experimental/npu_tools/npu_check/npu_check.md)
  - [npu-compute使用文档](https://gitcode.com/cann/asc-tools/blob/experimental/docs/06_npu_compute.md)
  - [msopprof使用文档](https://gitcode.com/Ascend/msopprof/blob/master/docs/zh/user_guide/msopprof_user_guide.md)
- 相关仓库
  - [算子样例仓ops-math](https://gitcode.com/cann/ops-math)
  - [插件发布仓](https://gitcode.com/opdevtools/plugin_release/releases)
  - 问题反馈：[asc-vscode](https://gitcode.com/cann/asc-vscode/issues)（推荐）或[plugin_release](https://gitcode.com/opdevtools/plugin_release/issues)
