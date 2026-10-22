/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
/**
 * 这个时给新建算子的时候加给名称（业务要求的）
 */
export class ProjectNameFactory {
  /**
   * 生成默认算子工程名称 opXXXXXX（随机六位数字）
   */
  static generateDefaultProjectName(): string {
    const num = Math.floor(100000 + Math.random() * 900000);

    return `op${num}`;
  }
}
