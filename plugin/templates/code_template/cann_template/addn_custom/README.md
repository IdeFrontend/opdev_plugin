# addn_custom算子直调样例
本样例基于addn算子工程，介绍了单算子<<<>>>直调方法。样例支持两个张量的动态相加运算，使用ListTensorDesc结构灵活处理多个输入参数，实现高效、可扩展的核函数调用。

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

  此算子实现了两个数据相加，返回相加结果的功能，其中核函数的输入参数为动态输入，动态输入参数包含两个入参，x和y。对应的数学表达式为：  
  ```
  z = x + y
  ```
- 算子规格：
  <table>
  </tr>
  <tr><td rowspan="3" align="center">算子输入</td><td align="center">name</td><td align="center">shape</td><td align="center">data type</td><td align="center">format</td></tr>
  <tr><td align="center">x（动态输入参数srcList[0]）</td><td align="center">8 * 2048</td><td align="center">float</td><td align="center">ND</td></tr>
  <tr><td align="center">y（动态输入参数srcList[1]）</td><td align="center">8 * 2048</td><td align="center">float</td><td align="center">ND</td></tr>
  </tr>
  </tr>
  <tr><td rowspan="1" align="center">算子输出</td><td align="center">z</td><td align="center">8 * 2048</td><td align="center">float</td><td align="center">ND</td></tr>
  </tr>
  </table>
- 算子实现：  

  动态输入特性是指，核函数的入参采用ListTensorDesc的结构存储输入数据信息。  
  构造TensorList数据结构，示例如下。
  ```cpp
  constexpr uint32_t SHAPE_DIM = 2;
    struct TensorDesc {
      uint32_t dim{SHAPE_DIM};
      uint32_t index;
      uint64_t shape[SHAPE_DIM] = {8, 2048};
    };

  constexpr uint32_t TENSOR_DESC_NUM = 2;
    struct ListTensorDesc {
      uint64_t ptrOffset;
      TensorDesc tensorDesc[TENSOR_DESC_NUM];
      uintptr_t dataPtr[TENSOR_DESC_NUM];
    } inputDesc;
  ```
  将申请分配的Tensor入参组合成ListTensorDesc的数据结构，示例如下。
  ```cpp
  inputDesc = {(1 + (1 + SHAPE_DIM) * TENSOR_DESC_NUM) * sizeof(uint64_t),
              {xDesc, yDesc},
              {(uintptr_t)xDevice, (uintptr_t)yDevice}};
  ``` 
  按照传入的数据格式，解析出对应的各入参，示例如下。

  ```cpp
  uint64_t buf[SHAPE_DIM] = {0};
  AscendC::TensorDesc<int32_t> tensorDesc;
  tensorDesc.SetShapeAddr(buf);
  listTensorDesc.GetDesc(tensorDesc, 0);
  uint64_t totalLength = tensorDesc.GetShape(0) * tensorDesc.GetShape(1);
  __gm__ uint8_t *x = listTensorDesc.GetDataPtr<__gm__ uint8_t>(0);
  __gm__ uint8_t *y = listTensorDesc.GetDataPtr<__gm__ uint8_t>(1);
  ```
  - 调用实现  
    使用内核调用符<<<>>>调用核函数。