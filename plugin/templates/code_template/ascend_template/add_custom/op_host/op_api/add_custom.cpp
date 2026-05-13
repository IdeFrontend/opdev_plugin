/**
 * This program is free software, you can redistribute it and/or modify it.
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This file is a part of the CANN Open Software.
 * Licensed under CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING
 * BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */

#include "add_custom.h"
#include "opdev/aicpu/aicpu_task.h"
#include "opdev/make_op_executor.h"
#include "opdev/op_log.h"
#include "opdev/op_def.h"
#include "opdev/op_dfx.h"
#include "opdev/op_executor.h"
#include "opdev/shape_utils.h"
#include "opdev/platform.h"

using namespace op;

namespace l0op {

OP_TYPE_REGISTER(AddCustom);

static const std::initializer_list<DataType> ASCEND910_AICORE_DTYPE_SUPPORT_LIST = {
    DataType::DT_FLOAT, DataType::DT_FLOAT16, DataType::DT_INT32, DataType::DT_BOOL,
    DataType::DT_INT8,  DataType::DT_UINT8,   DataType::DT_INT64};

static const std::initializer_list<DataType> ASCEND910B_AICORE_DTYPE_SUPPORT_LIST = {
    DataType::DT_FLOAT, DataType::DT_FLOAT16, DataType::DT_INT32, DataType::DT_INT8,     DataType::DT_UINT8,
    DataType::DT_INT64, DataType::DT_BF16,    DataType::DT_BOOL,  DataType::DT_COMPLEX64};

static const std::initializer_list<DataType> ASCEND610LITE_AICORE_DTYPE_SUPPORT_LIST = {
    DataType::DT_FLOAT, DataType::DT_FLOAT16, DataType::DT_INT32, DataType::DT_INT8, DataType::DT_UINT8};

static inline const std::initializer_list<DataType>& GetAiCoreDtypeSupportListBySocVersion()
{
    auto socVersion = GetCurrentPlatformInfo().GetSocVersion();
    switch (socVersion) {
        case SocVersion::ASCEND910B:
        case SocVersion::ASCEND910_95:
        case SocVersion::ASCEND910_93: {
            return ASCEND910B_AICORE_DTYPE_SUPPORT_LIST;
        }
        case SocVersion::ASCEND910: {
            return ASCEND910_AICORE_DTYPE_SUPPORT_LIST;
        }
        case SocVersion::ASCEND610LITE: {
            return ASCEND610LITE_AICORE_DTYPE_SUPPORT_LIST;
        }
        default: {
            return ASCEND910_AICORE_DTYPE_SUPPORT_LIST;
        }
    }
}

// 根据芯片类型、dtype判断算子是否支持走aicore
static inline bool IsAiCoreSupport(const aclTensor* self)
{
    return CheckType(self->GetDataType(), GetAiCoreDtypeSupportListBySocVersion());
}

// AICORE算子kernel
static const aclTensor* AddCustomAiCore(
    const aclTensor* self, const aclTensor* other, aclTensor* addOut, aclOpExecutor* executor)
{
    L0_DFX(AddCustomAiCore, self, other, addOut);
    // 使用框架宏ADD_TO_LAUNCHER_LIST_AICORE，将AiCore Add算子加入任务队列
    // Add是算子的OpType，self、other是算子的输入，addOut是算子的输出
    auto ret = ADD_TO_LAUNCHER_LIST_AICORE(AddCustom, OP_INPUT(self, other), OP_OUTPUT(addOut));
    OP_CHECK(
        ret == ACL_SUCCESS, OP_LOGE(ACLNN_ERR_INNER_NULLPTR, "AddAiCore ADD_TO_LAUNCHER_LIST_AICORE failed."),
        return nullptr);
    return addOut;
}

// AICPU算子kernel
static const aclTensor* AddCustomAiCpu(
    const aclTensor* self, const aclTensor* other, aclTensor* addOut, aclOpExecutor* executor)
{
    // 使用框架宏ADD_TO_LAUNCHER_LIST_AICPU，将AiCpu Add算子加入任务队列
    // Add是算子的OpType，self、other是算子的输入，addOut是算子的输出
    L0_DFX(AddCustomAiCpu, self, other);

    static internal::AicpuTaskSpace space("AddCustom");
    auto ret = ADD_TO_LAUNCHER_LIST_AICPU(AddCustom, OP_ATTR_NAMES(), OP_INPUT(self, other), OP_OUTPUT(addOut));
    OP_CHECK(
        ret == ACL_SUCCESS, OP_LOGE(ACLNN_ERR_INNER_NULLPTR, "AddCustomAiCpu ADD_TO_LAUNCHER_LIST_AICPU failed."),
        return nullptr);
    return addOut;
}

const aclTensor* AddCustom(const aclTensor* self, const aclTensor* other, aclOpExecutor* executor)
{
    Shape broadcastShape;
    if (!BroadcastInferShape(self->GetViewShape(), other->GetViewShape(), broadcastShape)) {
        OP_LOGE(
            ACLNN_ERR_PARAM_INVALID, "Broadcast %s and %s failed.", op::ToString(self->GetViewShape()).GetString(),
            op::ToString(other->GetViewShape()).GetString());
        return nullptr;
    }

    bool isMixDataType = (self->GetDataType() == DataType::DT_FLOAT16 && other->GetDataType() == DataType::DT_FLOAT) ||
                         (self->GetDataType() == DataType::DT_FLOAT && other->GetDataType() == DataType::DT_FLOAT16) ||
                         (self->GetDataType() == DataType::DT_BF16 && other->GetDataType() == DataType::DT_FLOAT) ||
                         (self->GetDataType() == DataType::DT_FLOAT && other->GetDataType() == DataType::DT_BF16);

    auto addOut = isMixDataType ? executor->AllocTensor(broadcastShape, DataType::DT_FLOAT) :
                                  executor->AllocTensor(broadcastShape, self->GetDataType());
    if (isMixDataType || (IsAiCoreSupport(self) && IsAiCoreSupport(other))) {
        return AddCustomAiCore(self, other, addOut, executor);
    }

    return AddCustomAiCpu(self, other, addOut, executor);
}

} // namespace l0op
