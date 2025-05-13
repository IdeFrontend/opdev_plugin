/**
 * Copyright (c) 2024 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export interface MemoryReference {
    // GM/UB/L0A/L0B/L0C/COMMON
	memoryLocation:string;
    // number or 0x123
	address:string;
    // >= 0
	dataLength:string;
    // int64/int32/int16/int8/uint8/fp64/fp32/fp16/bf16
	dataType?:string;
}
