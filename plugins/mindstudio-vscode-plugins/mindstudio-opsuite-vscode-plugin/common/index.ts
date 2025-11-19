/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// 主入口文件 - 按照你的要求只导出 HttpClient
import HttpClient from './class/HttpClient';

export default {
  HttpClient
};

// 同时提供命名导出
export { default as HttpClient } from './class/HttpClient';
