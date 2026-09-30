/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import en from './en';
import zhCn from './zh-cn';
import { flavorI18nOverrides } from './flavor-overrides';

function mergeTranslations(
  base: Record<string, string>,
  overrides: Record<string, string>,
): Record<string, string> {
  return {
    ...base,
    ...overrides,
  };
}

export default {
  en: { translation: mergeTranslations(en, flavorI18nOverrides.en) },
  'zh-cn': { translation: mergeTranslations(zhCn, flavorI18nOverrides['zh-cn']) },
  // Alias so both zh-CN and zh-cn work (VSCode may send either)
  'zh-CN': { translation: mergeTranslations(zhCn, flavorI18nOverrides['zh-CN']) },
};
