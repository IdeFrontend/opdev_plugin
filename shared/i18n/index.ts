import en from './en';
import zhCn from './zh-cn';

export default {
  en: { translation: en },
  'zh-cn': { translation: zhCn },
  // Alias so both zh-CN and zh-cn work (VSCode may send either)
  'zh-CN': { translation: zhCn },
};
