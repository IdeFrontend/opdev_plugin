# hello_world算子直调样例
本样例基于helloworld算子工程，介绍了单算子<<<>>>直调方法。样例支持两个张量的动态相加运算，使用ListTensorDesc结构灵活处理多个输入参数，实现高效、可扩展的核函数调用。

## 支持的产品
- Atlas A3 训练系列产品/Atlas A3 推理系列产品
- Atlas A2 训练系列产品/Atlas A2 推理系列产品

## 基于一站式算子开发平台进行算子开发
基于一站式算子开发平台快速完成算子创建、开发、异常检测、性能调优 \
指导文档：**[https://gitcode.com/org/cann/discussions/54](https://gitcode.com/org/cann/discussions/54)**

## 编译运行

如何快速编译算子
| 模式 | 命令 | 用途 |
|------|------|------|
| 普通编译 | `bash build.sh` | 日常开发验证 |
| 异常检测 | `bash build.sh --mssanitizer` | 问题检测 |
| 上板调优 | `bash build.sh --onboard` | 真实环境性能分析 |
| 仿真调优 | `bash build.sh --simulator` | 指令级详细分析 |

## 算子描述
- 算子功能：  

  本样例通过使用<<<>>>内核调用符来完成算子核函数在NPU侧运行验证的基础流程，核函数内通过printf打印输出结果。  