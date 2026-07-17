/**
 * 通信频道
 * @value request 数据请求
 * @value viewQuery 页面参数
 * @value viewServerApi 页面服务端 - api方法
 * @value viewServerRef 页面服务端 - 响应式对象
 */
export type ConnectChannel = '__connector__' | 'request' | 'viewQuery' | 'stTestResults';

export type ConnectMessage = { channel: ConnectChannel;
  data: unknown };

/** 通信双向ready消息频道 */
export const CONNECTOR_READY_CHANNEL: ConnectChannel = '__connector__';
