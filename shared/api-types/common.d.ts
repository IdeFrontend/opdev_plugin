/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
export type CheckPathExistsParams = {
  path: string;
  mustFile?: boolean;
};

export type SaveFileParams = {
  /** 源文件/目录路径 */
  sourcePath: string;

  /** 保存的文件名和后缀 */
  filename: string;

  /** 对话框标题 */
  dialogTitle?: string;

  /** 允许保存的文件类型 */
  allowedTypes?: string[];
};

/** 保存文件返回结果（Web 版本返回文件数据，桌面版本返回 boolean） */
export type SaveFileResult = boolean | {
  /** Base64 编码的文件数据 */
  data: string;
  /** 文件名 */
  filename: string;
};
