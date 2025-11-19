/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { HttpClient } from 'common';

 const urlParams = new URLSearchParams(window.location.search);

const port = urlParams.get('backendPort')||'3000'

const host = 'http://127.0.0.1'

const local = new HttpClient(`${host}:${port}`);

export async function health(){
    return await local.get('/api/health')
}