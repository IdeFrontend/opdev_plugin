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

#include "aclnn_add_custom.h"
#include "add_custom.h"
#include "math/axpy/op_host/op_api/axpy.h"
#include "math/axpy_v2/op_host/op_api/axpy_v2.h"
#include "aclnn_kernels/cast.h"
#include "aclnn_kernels/contiguous.h"
#include "math/mul/op_host/op_api/mul.h"
#include "math/logical_and/op_host/op_api/logical_and.h"
#include "math/logical_or/op_host/op_api/logical_or.h"
#include "aclnn_kernels/common/op_error_check.h"
#include "opdev/common_types.h"
#include "opdev/data_type_utils.h"
#include "opdev/format_utils.h"
#include "opdev/op_dfx.h"
#include "opdev/op_executor.h"
#include "opdev/op_log.h"
#include "opdev/shape_utils.h"
#include "opdev/tensor_view_utils.h"
#include "opdev/platform.h"

using namespace op;
#ifdef __cplusplus
extern "C" {
#endif

/* Add 算子的完整计算流程如下:
 * self                               other
 *   |                                  |
 *   \                                  /
 * Contiguous(workspace_0)    Contiguous(workspace_2)
 *      \                             /
 *     Cast(workspace_1)     Cast(workspace_3)
 *               \            /
 *             Add(workspace_4)
 *                    |
 *               Cast(workspace_5)
 *                    |
 *                ViewCopy
 *                    |
 *                  result
 */

static constexpr size_t MAX_DIM_LEN = 8;

// 根据API定义，需要列出所能支持的所有dtype
static const std::initializer_list<op::DataType> AXPY_DTYPE_SUPPORT_LIST = {
    op::DataType::DT_FLOAT, op::DataType::DT_INT32, op::DataType::DT_FLOAT16};

static const std::initializer_list<op::DataType> ASCEND910_95_AXPY_DTYPE_SUPPORT_LIST = {
    op::DataType::DT_FLOAT, op::DataType::DT_FLOAT16, op::DataType::DT_BF16};

static const std::initializer_list<op::DataType> ASCEND910_95_AXPY_V2_DTYPE_SUPPORT_LIST = {
    op::DataType::DT_FLOAT, op::DataType::DT_BF16, op::DataType::DT_FLOAT16, op::DataType::DT_INT32,
    op::DataType::DT_INT64, op::DataType::DT_INT8, op::DataType::DT_UINT8,   op::DataType::DT_BOOL};

static const std::initializer_list<op::DataType> ASCEND910_DTYPE_SUPPORT_LIST = {
    op::DataType::DT_FLOAT, op::DataType::DT_INT32,     op::DataType::DT_INT64,     op::DataType::DT_FLOAT16,
    op::DataType::DT_INT16, op::DataType::DT_INT8,      op::DataType::DT_UINT8,     op::DataType::DT_DOUBLE,
    op::DataType::DT_BOOL,  op::DataType::DT_COMPLEX64, op::DataType::DT_COMPLEX128};

static const std::initializer_list<op::DataType> ASCEND910B_DTYPE_SUPPORT_LIST = {
    op::DataType::DT_FLOAT, op::DataType::DT_INT32, op::DataType::DT_INT64,     op::DataType::DT_FLOAT16,
    op::DataType::DT_INT16, op::DataType::DT_INT8,  op::DataType::DT_UINT8,     op::DataType::DT_DOUBLE,
    op::DataType::DT_BOOL,  op::DataType::DT_BF16,  op::DataType::DT_COMPLEX64, op::DataType::DT_COMPLEX128};

static bool CheckNotNull(const aclTensor* self, const aclTensor* other, const aclScalar* alpha, const aclTensor* out)
{
    OP_CHECK_NULL(self, return false);
    OP_CHECK_NULL(other, return false);
    OP_CHECK_NULL(alpha, return false);
    OP_CHECK_NULL(out, return false);
    return true;
}

static inline const std::initializer_list<op::DataType>& GetDtypeSupportListBySocVersion()
{
    auto socVersion = GetCurrentPlatformInfo().GetSocVersion();
    switch (socVersion) {
        case SocVersion::ASCEND910B:
        case SocVersion::ASCEND910_93:
        case SocVersion::ASCEND910_95: {
            return ASCEND910B_DTYPE_SUPPORT_LIST;
        }
        case SocVersion::ASCEND910: {
            return ASCEND910_DTYPE_SUPPORT_LIST;
        }
        default: {
            return ASCEND910_DTYPE_SUPPORT_LIST;
        }
    }
}

static op::DataType GetScalarDefaultDtype(const op::DataType input)
{
    if (IsComplexType(input)) {
        return op::DataType::DT_COMPLEX64;
    } else if (IsFloatingType(input)) {
        return op::DataType::DT_FLOAT;
    }
    return input;
}

static op::DataType InnerTypeToComplexType(const op::DataType input)
{
    switch (input) {
        case op::DataType::DT_BF16:
            // BFloat16 has range equivalent to Float,
            // so we map it to ComplexFloat.
            return op::DataType::DT_COMPLEX64;
        case op::DataType::DT_FLOAT16:
            return op::DataType::DT_COMPLEX32;
        case op::DataType::DT_FLOAT:
            return op::DataType::DT_COMPLEX64;
        case op::DataType::DT_DOUBLE:
            return op::DataType::DT_COMPLEX128;
        case op::DataType::DT_COMPLEX32:
            return op::DataType::DT_COMPLEX32;
        case op::DataType::DT_COMPLEX64:
            return op::DataType::DT_COMPLEX64;
        case op::DataType::DT_COMPLEX128:
            return op::DataType::DT_COMPLEX128;
        default:
            OP_LOGE(ACLNN_ERR_PARAM_INVALID, "Unknown Complex ScalarType for [%s]", ToString(input).GetString());
            return op::DataType::DT_UNDEFINED;
    }
}

static op::DataType CombineCategoriesWithComplex(const op::DataType higher, const op::DataType lower)
{
    if (IsComplexType(higher)) {
        return higher;
    } else if (IsComplexType(lower)) {
        // preserve value type of higher if it is floating type.
        if (IsFloatingType(higher)) {
            return InnerTypeToComplexType(higher);
        }
        // in case of integral input
        // lower complex takes precedence.
        return lower;
    } else if (IsFloatingType(higher)) {
        return higher;
    }
    if (higher == op::DataType::DT_BOOL || IsFloatingType(lower)) {
        return op::PromoteType(higher, lower);
    }
    if (higher != op::DataType::DT_UNDEFINED) {
        return higher;
    }
    return lower;
}

static inline float GetCastedFloat(const op::DataType tensorDtype, const aclScalar* scalar)
{
    float castedRes = 0;
    switch (tensorDtype) {
        case DataType::DT_FLOAT16:
            castedRes = static_cast<float>(scalar->ToFp16());
            break;
        case DataType::DT_BF16:
            castedRes = static_cast<float>(scalar->ToBf16());
            break;
        default:
            castedRes = scalar->ToFloat();
            break;
    }
    return castedRes;
}

static inline bool IsFloatEqual(float a, float b)
{
    return std::abs(a - b) <= std::numeric_limits<float>::epsilon();
}

static inline bool IsEqualToOne(const op::DataType calcType, const aclScalar* alpha)
{
    if (GetCurrentPlatformInfo().GetSocVersion() != SocVersion::ASCEND910_95) {
        return !(alpha->ToFloat() > 1 || alpha->ToFloat() < 1);
    }
    if (IsComplexType(alpha->GetDataType()) || IsComplexType(calcType)) {
        return false;
    }

    if (calcType == DataType::DT_DOUBLE) {
        return !(alpha->ToDouble() > 1 || alpha->ToDouble() < 1);
    }
    return !(alpha->ToFloat() > 1 || alpha->ToFloat() < 1);
}

static bool CheckPromoteType(
    const op::DataType selfDtype, const op::DataType otherDtype, const aclScalar* alpha, const op::DataType outDtype,
    op::DataType promoteType)
{
    // 检查self和other能否做数据类型推导
    if (promoteType == DataType::DT_UNDEFINED) {
        OP_LOGE(
            ACLNN_ERR_PARAM_INVALID, "Self dtype %s and other dtype %s can not promote dtype.",
            op::ToString(selfDtype).GetString(), op::ToString(otherDtype).GetString());
        return false;
    }

    // 检查alpha能否转换为推导后的数据类型
    if (promoteType == op::DataType::DT_BOOL) {
        OP_CHECK(
            IsIntegralType(DataType(alpha->GetDataType()), true),
            OP_LOGE(
                ACLNN_ERR_PARAM_INVALID, "Alpha dtype %s can't be cast to the promote dtype %s.",
                op::ToString(DataType(alpha->GetDataType())).GetString(), op::ToString(promoteType).GetString()),
            return false);
    } else if (!CanCast(DataType(alpha->GetDataType()), promoteType)) {
        OP_LOGE(
            ACLNN_ERR_PARAM_INVALID, "Alpha dtype %s can't be cast to the promote dtype %s.",
            op::ToString(DataType(alpha->GetDataType())).GetString(), op::ToString(promoteType).GetString());
        return false;
    }
    if (GetCurrentPlatformInfo().GetSocVersion() == SocVersion::ASCEND910_95) {
        OP_CHECK_RESULT_DTYPE_CAST_FAILED(selfDtype, promoteType, return false);
        OP_CHECK_RESULT_DTYPE_CAST_FAILED(otherDtype, promoteType, return false);
        const auto& supportList = GetDtypeSupportListBySocVersion();
        if (!CheckType(promoteType, supportList)) {
            OP_LOGE(
                ACLNN_ERR_PARAM_INVALID,
                "Input dtype %s is not implemented, it"
                "should be in dtype support list %s.",
                ToString(promoteType).GetString(), op::ToString(supportList).GetString());
            return false;
        }
    }
    // 检查推导后的数据类型能否转换为输出的数据类型
    if (!CanCast(promoteType, outDtype)) {
        OP_LOGE(
            ACLNN_ERR_PARAM_INVALID, "Promote dtype %s can't be cast to the desired output type %s.",
            op::ToString(promoteType).GetString(), op::ToString(outDtype).GetString());
        return false;
    }
    return true;
}

static bool CheckShape(const aclTensor* self, const aclTensor* other, const aclTensor* y)
{
    OP_CHECK_MAX_DIM(self, MAX_DIM_LEN, return false);
    OP_CHECK_MAX_DIM(other, MAX_DIM_LEN, return false);

    op::Shape broadcastShape;
    OP_CHECK_BROADCAST_AND_INFER_SHAPE(self, other, broadcastShape, return false);

    if (broadcastShape != y->GetViewShape()) {
        OP_LOGE(
            ACLNN_ERR_PARAM_INVALID, "Shape of out should be %s, but current is %s.",
            op::ToString(broadcastShape).GetString(), op::ToString(y->GetViewShape()).GetString());
        return false;
    }
    return true;
}

static aclnnStatus CheckParams(
    const aclTensor* self, const aclTensor* other, const aclScalar* alpha, const aclTensor* y)
{
    // 1. 检查参数是否为空指针
    CHECK_RET(CheckNotNull(self, other, alpha, y), ACLNN_ERR_PARAM_NULLPTR);

    // 2. 检查输入的数据类型是否在API支持的数据类型范围之内，需要根据api定义校验
    const std::initializer_list<op::DataType> dtypeSupportList = GetDtypeSupportListBySocVersion();
    // 检查self的数据类型是否在add算子的支持列表内
    OP_CHECK_DTYPE_NOT_SUPPORT(self, dtypeSupportList, return ACLNN_ERR_PARAM_INVALID);
    // 检查other的数据类型是否在add算子的支持列表内
    OP_CHECK_DTYPE_NOT_SUPPORT(other, dtypeSupportList, return ACLNN_ERR_PARAM_INVALID);

    // 3. 检查self和other能否做数据类型推导以及推导的数据类型能否转换为输出数据类型
    op::DataType promoteType = op::PromoteType(self->GetDataType(), other->GetDataType());
    CHECK_RET(
        CheckPromoteType(self->GetDataType(), other->GetDataType(), alpha, y->GetDataType(), promoteType),
        ACLNN_ERR_PARAM_INVALID);

    // 4. 检查双输入是否能broadcast
    CHECK_RET(CheckShape(self, other, y), ACLNN_ERR_PARAM_INVALID);

    return ACLNN_SUCCESS;
}

static bool IsSupportAxpy(const DataType promoteType)
{
    if (GetCurrentPlatformInfo().GetSocVersion() == SocVersion::ASCEND910_95) {
        return CheckType(promoteType, ASCEND910_95_AXPY_DTYPE_SUPPORT_LIST);
    }
    return CheckType(promoteType, AXPY_DTYPE_SUPPORT_LIST);
}

static bool IsSupportAxpyV2(const DataType promoteType)
{
    if (GetCurrentPlatformInfo().GetSocVersion() == SocVersion::ASCEND910_95) {
        return CheckType(promoteType, ASCEND910_95_AXPY_V2_DTYPE_SUPPORT_LIST);
    }
    return false;
}

inline static bool isAddCustomMixDtypeSupport(const aclTensor* self, const aclTensor* other)
{
    return (self->GetDataType() == DataType::DT_FLOAT16 && other->GetDataType() == DataType::DT_FLOAT) ||
           (self->GetDataType() == DataType::DT_FLOAT && other->GetDataType() == DataType::DT_FLOAT16) ||
           (self->GetDataType() == DataType::DT_BF16 && other->GetDataType() == DataType::DT_FLOAT) ||
           (self->GetDataType() == DataType::DT_FLOAT && other->GetDataType() == DataType::DT_BF16);
}

aclnnStatus aclnnAddCustomGetWorkspaceSize(
    const aclTensor* self, const aclTensor* other, const aclScalar* alpha, aclTensor* out, uint64_t* workspaceSize,
    aclOpExecutor** executor)
{
    L2_DFX_PHASE_1(aclnnAddCustom, DFX_IN(self, other, alpha), DFX_OUT(out));
    // 固定写法，创建OpExecutor
    auto uniqueExecutor = CREATE_EXECUTOR();
    CHECK_RET(uniqueExecutor.get() != nullptr, ACLNN_ERR_INNER_CREATE_EXECUTOR);

    // 固定写法，参数检查
    auto ret = CheckParams(self, other, alpha, out);
    CHECK_RET(ret == ACLNN_SUCCESS, ret);

    // add算子的空tensor在kernel中支持，对标竞品根据算子实际情况补充
    if (self->IsEmpty() || other->IsEmpty()) {
        // 根据实际支持情况补充
        *workspaceSize = 0;
        uniqueExecutor.ReleaseTo(executor);
        return ACLNN_SUCCESS;
    }
    // 固定写法，将输入self转换成连续的tensor
    auto selfContiguous = l0op::Contiguous(self, uniqueExecutor.get());
    CHECK_RET(selfContiguous != nullptr, ACLNN_ERR_INNER_NULLPTR);

    // 固定写法，将输入other转换成连续的tensor
    auto otherContiguous = l0op::Contiguous(other, uniqueExecutor.get());
    CHECK_RET(otherContiguous != nullptr, ACLNN_ERR_INNER_NULLPTR);

    // 申请add的输出tensor
    const aclTensor* addOpOut = nullptr;
    // 判断输入是否符合kernel支持的混合输入类型
    bool isMixDataType = isAddCustomMixDtypeSupport(self, other);
    if (isMixDataType && !(alpha->ToFloat() > 1 || alpha->ToFloat() < 1)) {
        // 无需调用Cast，直接调用L0带混合数据类型的kernel
        addOpOut = l0op::AddCustom(selfContiguous, otherContiguous, uniqueExecutor.get());
    } else {
        // 对self和other两个输入做隐式数据类型转换，根据具体算子语义按需调用
        auto promoteType = op::PromoteType(self->GetDataType(), other->GetDataType());

        // 将输入self的数据类型转换成隐式数据类型，根据具体算子语义按需调用
        auto selfCasted = l0op::Cast(selfContiguous, promoteType, uniqueExecutor.get());
        CHECK_RET(selfCasted != nullptr, ACLNN_ERR_INNER_NULLPTR);

        // 将输入other的数据类型转换成隐式数据类型，根据具体算子语义按需调用
        auto otherCasted = l0op::Cast(otherContiguous, promoteType, uniqueExecutor.get());
        CHECK_RET(otherCasted != nullptr, ACLNN_ERR_INNER_NULLPTR);

        // 进行非混合输入类型的Add计算分支判断
        if (IsEqualToOne(promoteType, alpha)) {
            addOpOut = l0op::AddCustom(selfCasted, otherCasted, uniqueExecutor.get());
        } else if (IsSupportAxpy(promoteType)) {
            addOpOut = l0op::Axpy(selfCasted, otherCasted, alpha->ToFloat(), uniqueExecutor.get());
        } else if (IsSupportAxpyV2(promoteType)) {
            auto alphaTensor = uniqueExecutor.get()->ConvertToTensor(alpha, promoteType);
            addOpOut = l0op::AxpyV2(selfCasted, otherCasted, alphaTensor, uniqueExecutor.get());
        } else {
            auto alphaTensor = uniqueExecutor.get()->ConvertToTensor(alpha, promoteType);
            auto otherRes = l0op::Mul(otherCasted, alphaTensor, uniqueExecutor.get());
            CHECK_RET(otherRes != nullptr, ACLNN_ERR_INNER_NULLPTR);
            addOpOut = l0op::AddCustom(selfCasted, otherRes, uniqueExecutor.get());
        }
    }
    CHECK_RET(addOpOut != nullptr, ACLNN_ERR_INNER_NULLPTR);

    // 固定写法，将计算结果转换成输出out的数据类型
    auto castOut = l0op::Cast(addOpOut, out->GetDataType(), uniqueExecutor.get());
    CHECK_RET(castOut != nullptr, ACLNN_ERR_INNER_NULLPTR);

    // 固定写法，将计算结果拷贝到输出out上，out可能是非连续的tensor
    auto viewCopyResult = l0op::ViewCopy(castOut, out, uniqueExecutor.get());
    CHECK_RET(viewCopyResult != nullptr, ACLNN_ERR_INNER_NULLPTR);

    // 固定写法，获取计算过程中需要使用的workspace大小
    *workspaceSize = uniqueExecutor->GetWorkspaceSize();
    uniqueExecutor.ReleaseTo(executor); // 需要把 uniqueExecutor持有executor转移给executor
    return ACLNN_SUCCESS;
}

static bool CheckNotNullScalar(
    const aclTensor* self, const aclScalar* other, const aclScalar* alpha, const aclTensor* out)
{
    OP_CHECK_NULL(self, return false);
    OP_CHECK_NULL(other, return false);
    OP_CHECK_NULL(alpha, return false);
    OP_CHECK_NULL(out, return false);
    return true;
}

static bool CheckShapeScalar(const aclTensor* self, const aclTensor* out)
{
    OP_CHECK_MAX_DIM(self, MAX_DIM_LEN, return false);
    OP_CHECK_SHAPE_NOT_EQUAL(self, out, return false);
    return true;
}

static DataType PromoteTypeScalar(
    const aclTensor* self, const aclScalar* other, const aclScalar* alpha, const aclTensor* out)
{
    auto socVersion = GetCurrentPlatformInfo().GetSocVersion();
    if (socVersion == SocVersion::ASCEND910_95) {
        auto otherDefaultDtype = GetScalarDefaultDtype(other->GetDataType());
        auto promoteType = CombineCategoriesWithComplex(self->GetDataType(), otherDefaultDtype);
        if (promoteType == op::DataType::DT_FLOAT16 || promoteType == op::DataType::DT_BF16) {
            bool isKeepB16 = IsFloatEqual(GetCastedFloat(promoteType, other), other->ToFloat()) &&
                             IsFloatEqual(GetCastedFloat(promoteType, alpha), alpha->ToFloat());
            promoteType = isKeepB16 ? promoteType : op::DataType::DT_FLOAT;
        }
        if (promoteType == op::DataType::DT_COMPLEX32) {
            promoteType = op::DataType::DT_COMPLEX64;
        }
        return promoteType;
    }
    if (IsComplexType(self->GetDataType()) || IsComplexType(other->GetDataType())) {
        return op::PromoteType(self->GetDataType(), other->GetDataType());
    }
    if (IsFloatingType(self->GetDataType())) {
        return self->GetDataType();
    }

    if (other->GetDataType() == op::DataType::DT_DOUBLE && out->GetDataType() == op::DataType::DT_FLOAT) {
        return op::DataType::DT_FLOAT;
    }

    if (IsFloatingType(other->GetDataType()) || self->GetDataType() == op::DataType::DT_BOOL) {
        return op::PromoteType(self->GetDataType(), other->GetDataType());
    }

    return self->GetDataType();
}

static aclnnStatus CheckParamsScalar(
    const aclTensor* self, const aclScalar* other, const aclScalar* alpha, const aclTensor* y)
{
    // 1. 检查参数是否为空指针
    CHECK_RET(CheckNotNullScalar(self, other, alpha, y), ACLNN_ERR_PARAM_NULLPTR);

    // 2. 检查输入的数据类型是否在API支持的数据类型范围之内，需要根据api定义校验
    const std::initializer_list<op::DataType> dtypeSupportList = GetDtypeSupportListBySocVersion();
    // 检查self的数据类型是否在add算子的支持列表内
    OP_CHECK_DTYPE_NOT_SUPPORT(self, dtypeSupportList, return ACLNN_ERR_PARAM_INVALID);

    // 3. 检查self和other能否做数据类型推导以及推导的数据类型能否转换为输出数据类型
    auto promoteType = PromoteTypeScalar(self, other, alpha, y);
    CHECK_RET(
        CheckPromoteType(self->GetDataType(), other->GetDataType(), alpha, y->GetDataType(), promoteType),
        ACLNN_ERR_PARAM_INVALID);

    // 4. 检查shape
    CHECK_RET(CheckShapeScalar(self, y), ACLNN_ERR_PARAM_INVALID);

    return ACLNN_SUCCESS;
}

aclnnStatus aclnnAddCustomsGetWorkspaceSize(
    const aclTensor* self, const aclScalar* other, const aclScalar* alpha, aclTensor* out, uint64_t* workspaceSize,
    aclOpExecutor** executor)
{
    L2_DFX_PHASE_1(aclnnAddCustoms, DFX_IN(self, other, alpha), DFX_OUT(out));
    // 固定写法，创建OpExecutor
    auto uniqueExecutor = CREATE_EXECUTOR();
    CHECK_RET(uniqueExecutor.get() != nullptr, ACLNN_ERR_INNER_CREATE_EXECUTOR);

    // 固定写法，参数检查
    auto ret = CheckParamsScalar(self, other, alpha, out);
    CHECK_RET(ret == ACLNN_SUCCESS, ret);

    // add算子的空tensor在kernel中支持，对标竞品根据算子实际情况补充
    if (self->IsEmpty()) {
        // 根据实际支持情况补充
        *workspaceSize = 0;
        uniqueExecutor.ReleaseTo(executor);
        return ACLNN_SUCCESS;
    }

    auto promoteType = PromoteTypeScalar(self, other, alpha, out);

    // 固定写法，将输入self转换成连续的tensor
    auto selfContiguous = l0op::Contiguous(self, uniqueExecutor.get());
    CHECK_RET(selfContiguous != nullptr, ACLNN_ERR_INNER_NULLPTR);

    // 将输入self的数据类型转换成隐式数据类型，根据具体算子语义按需调用
    auto selfCasted = l0op::Cast(selfContiguous, promoteType, uniqueExecutor.get());
    CHECK_RET(selfCasted != nullptr, ACLNN_ERR_INNER_NULLPTR);

    auto otherTensor = uniqueExecutor.get()->ConvertToTensor(other, promoteType);

    // 进行Add计算
    const aclTensor* addOpOut = nullptr;
    if (IsEqualToOne(promoteType, alpha)) {
        // alpha为1时不需要Mul
        addOpOut = l0op::AddCustom(selfCasted, otherTensor, uniqueExecutor.get());
    } else if (IsSupportAxpy(promoteType)) {
        addOpOut = l0op::Axpy(selfCasted, otherTensor, alpha->ToFloat(), uniqueExecutor.get());
    } else if (IsSupportAxpyV2(promoteType)) {
        auto alphaTensor = uniqueExecutor.get()->ConvertToTensor(alpha, promoteType);
        addOpOut = l0op::AxpyV2(selfCasted, otherTensor, alphaTensor, uniqueExecutor.get());
    } else {
        auto alphaTensor = uniqueExecutor.get()->ConvertToTensor(alpha, promoteType);
        auto otherRes = l0op::Mul(otherTensor, alphaTensor, uniqueExecutor.get());
        CHECK_RET(otherRes != nullptr, ACLNN_ERR_INNER_NULLPTR);
        addOpOut = l0op::AddCustom(selfCasted, otherRes, uniqueExecutor.get());
    }
    CHECK_RET(addOpOut != nullptr, ACLNN_ERR_INNER_NULLPTR);

    // 固定写法，将计算结果转换成输出out的数据类型
    auto castOut = l0op::Cast(addOpOut, out->GetDataType(), uniqueExecutor.get());
    CHECK_RET(castOut != nullptr, ACLNN_ERR_INNER_NULLPTR);

    // bool类型Tensor加"True"时，防止出现值为"2"
    if (self->GetDataType() == op::DataType::DT_BOOL && other->GetDataType() == op::DataType::DT_BOOL &&
        alpha->GetDataType() == op::DataType::DT_BOOL && out->GetDataType() != op::DataType::DT_BOOL &&
        other->ToBool() && alpha->ToBool()) {
        castOut = l0op::Cast(castOut, op::DataType::DT_BOOL, uniqueExecutor.get());
        CHECK_RET(castOut != nullptr, ACLNN_ERR_INNER_NULLPTR);
        castOut = l0op::Cast(castOut, out->GetDataType(), uniqueExecutor.get());
        CHECK_RET(castOut != nullptr, ACLNN_ERR_INNER_NULLPTR);
    }

    // 固定写法，将计算结果拷贝到输出out上，out可能是非连续的tensor
    auto viewCopyResult = l0op::ViewCopy(castOut, out, uniqueExecutor.get());
    CHECK_RET(viewCopyResult != nullptr, ACLNN_ERR_INNER_NULLPTR);

    // 固定写法，获取计算过程中需要使用的workspace大小
    *workspaceSize = uniqueExecutor->GetWorkspaceSize();
    uniqueExecutor.ReleaseTo(executor); // 需要把 uniqueExecutor持有executor转移给executor
    return ACLNN_SUCCESS;
}

static inline aclnnStatus CheckInplace(const aclTensor* selfRef, const aclTensor* other)
{
    OP_CHECK_NULL(selfRef, return ACLNN_ERR_PARAM_NULLPTR);
    OP_CHECK_NULL(other, return ACLNN_ERR_PARAM_NULLPTR);

    op::Shape broadcastShape;
    OP_CHECK_BROADCAST_AND_INFER_SHAPE(selfRef, other, broadcastShape, return ACLNN_ERR_PARAM_INVALID);

    OP_CHECK(
        selfRef->GetViewShape() == broadcastShape,
        OP_LOGE(
            ACLNN_ERR_PARAM_NULLPTR, "Expected shape of selfRef should be %s, but got %s.",
            op::ToString(broadcastShape).GetString(), op::ToString(selfRef->GetViewShape()).GetString()),
        return ACLNN_ERR_PARAM_INVALID);
    return ACLNN_SUCCESS;
}

aclnnStatus aclnnInplaceAddCustomGetWorkspaceSize(
    const aclTensor* selfRef, const aclTensor* other, const aclScalar* alpha, uint64_t* workspaceSize,
    aclOpExecutor** executor)
{
    auto ret = CheckInplace(selfRef, other);
    CHECK_RET(ret == ACLNN_SUCCESS, ret);

    auto out = const_cast<aclTensor*>(selfRef);
    return aclnnAddCustomGetWorkspaceSize(selfRef, other, alpha, out, workspaceSize, executor);
}

aclnnStatus aclnnInplaceAddCustomsGetWorkspaceSize(
    const aclTensor* selfRef, const aclScalar* other, const aclScalar* alpha, uint64_t* workspaceSize,
    aclOpExecutor** executor)
{
    auto out = const_cast<aclTensor*>(selfRef);
    return aclnnAddCustomsGetWorkspaceSize(selfRef, other, alpha, out, workspaceSize, executor);
}

aclnnStatus aclnnAddCustom(void* workspace, uint64_t workspaceSize, aclOpExecutor* executor, aclrtStream stream)
{
    L2_DFX_PHASE_2(aclnnAddCustom);
    // 固定写法，调用框架能力，完成计算
    return CommonOpExecutorRun(workspace, workspaceSize, executor, stream);
}

aclnnStatus aclnnInplaceAddCustom(void* workspace, uint64_t workspaceSize, aclOpExecutor* executor, aclrtStream stream)
{
    L2_DFX_PHASE_2(aclnnInplaceAddCustom);
    // 固定写法，调用框架能力，完成计算
    return CommonOpExecutorRun(workspace, workspaceSize, executor, stream);
}

aclnnStatus aclnnAddCustoms(void* workspace, uint64_t workspaceSize, aclOpExecutor* executor, aclrtStream stream)
{
    L2_DFX_PHASE_2(aclnnAddCustoms);
    // 固定写法，调用框架能力，完成计算
    return CommonOpExecutorRun(workspace, workspaceSize, executor, stream);
}

aclnnStatus aclnnInplaceAddCustoms(void* workspace, uint64_t workspaceSize, aclOpExecutor* executor, aclrtStream stream)
{
    L2_DFX_PHASE_2(aclnnInplaceAddCustoms);
    // 固定写法，调用框架能力，完成计算
    return CommonOpExecutorRun(workspace, workspaceSize, executor, stream);
}

#ifdef __cplusplus
}
#endif