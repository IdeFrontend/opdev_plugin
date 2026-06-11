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
