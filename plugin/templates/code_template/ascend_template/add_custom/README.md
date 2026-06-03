# Add

本目录仅包含Add算子对应的aclnn接口；如您想要贡献该算子的AscendC实现，请参考[贡献流程](../../CONTRIBUTING.md)。

## A4 vs A5（910B-class vs Ascend 950 / Atlas A5）

标准自定义算子通过工作区 `build.sh`（`--soc={soc_version}` 占位符）与 `CMakeLists.txt` 构建。

| 环境 | `CMakeLists.txt`（创建算子时写入） | 构建时扩展注入 |
|------|-----------------------------------|----------------|
| A4 / 910B-class | `SUPPORT_COMPUTE_UNIT=ascend910_95`，`SUPPORT_TILING_DIR=arch22` | `SOC_VERSION` / `NPU_ARCH`（spawn env） |
| A5 / 950 | `SUPPORT_COMPUTE_UNIT=ascend950`，`SUPPORT_TILING_DIR=arch35` | 同上 |

创建算子前请设置 **`op-devtools.environment.socVersion`**（或依赖扩展的 SOC 自动检测）；扩展会根据当前 SOC 将上述常量写入 `CMakeLists.txt`。构建命令仍通过 `{soc_version}` 与 spawn 环境注入 `SOC_VERSION`、`NPU_ARCH`。详见 [`docs/project-upgrade-a5.md`](../../../../docs/project-upgrade-a5.md) 与 [`docs/ascend-env-spec.md`](../../../../docs/ascend-env-spec.md)。
