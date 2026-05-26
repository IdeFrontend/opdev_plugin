# Add

本目录仅包含Add算子对应的aclnn接口；如您想要贡献该算子的AscendC实现，请参考[贡献流程](../../CONTRIBUTING.md)。

## A4 vs A5（910B-class vs Ascend 950 / Atlas A5）

标准自定义算子通过工作区 `build.sh`（`--soc={soc_version}` 占位符）与 `CMakeLists.txt` 构建。

| 环境 | 扩展注入（spawn env） | 手动 cmake（无 env 时） |
|------|----------------------|-------------------------|
| A4 / 910B-class | `SOC_VERSION=ascend910b` 等，`NPU_ARCH=dav-2201`，`SUPPORT_COMPUTE_UNIT=ascend910_95`，`SUPPORT_TILING_DIR=arch22` | 须设置上述变量，否则 cmake 报错 |
| A5 / 950 | `SOC_VERSION=ascend950`，`NPU_ARCH=dav-3510`，`SUPPORT_COMPUTE_UNIT=ascend910_95`，`SUPPORT_TILING_DIR=arch35` | 须设置上述变量，否则 cmake 报错（CANN ACLNN 平台名为 `910_95`，非 `ascend950`） |

在 VS Code 中设置 **`op-devtools.environment.socVersion`** 为 `ascend950`，或使用仿真器 `Ascend950PR_9589`，扩展会在每次构建命令中注入上述环境变量。详见 [`docs/project-upgrade-a5.md`](../../../../docs/project-upgrade-a5.md) 与 [`docs/ascend-env-spec.md`](../../../../docs/ascend-env-spec.md)。