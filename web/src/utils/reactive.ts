/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { toRaw } from 'vue';

/**
 * 递归去除所有vue响应式生成的proxy
 * @param maybeProxy 输入
 * @param visitedObjects 递归过程中已访问的对象和数组
 */
export function deepToRaw<T>(
  maybeProxy: T,
  visitedObjects = new WeakSet<object>(),
): T {
  if (maybeProxy === undefined) {
    return maybeProxy;
  }

  const raw = toRaw(maybeProxy);

  // 非对象类型（包括 null）直接返回
  if (raw === null || typeof raw !== 'object') {
    return raw;
  }

  // 循环依赖
  if (visitedObjects.has(raw)) {
    return raw;
  }

  // 数组
  if (Array.isArray(raw)) {
    visitedObjects.add(raw);
    raw.forEach((item, index) => {
      raw[index] = deepToRaw(item, visitedObjects);
    });

    return raw;
  }

  // Date 对象
  if (raw instanceof Date) {
    return raw;
  }

  // 普通对象
  visitedObjects.add(raw);
  const keys = Object.keys(raw);

  for (const key of keys) {
    (raw as Record<string, any>)[key] = deepToRaw((raw as Record<string, any>)[key], visitedObjects);
  }

  return raw;
}
