// 主入口文件 - 按照你的要求只导出 HttpClient
import HttpClient from './class/HttpClient';

export default {
  HttpClient
};

// 同时提供命名导出
export { default as HttpClient } from './class/HttpClient';
