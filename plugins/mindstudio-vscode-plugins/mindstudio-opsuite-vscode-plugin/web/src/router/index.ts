/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
    { path: '/', component: () => import('../views/Home.vue'), name: 'home' },
    { path: '/link', component: () => import('../views/Link/index.vue'), name: 'about' },
];

const router = createRouter({ 
    history: createWebHashHistory(),
    routes,
});

export default router