/** 通信频道 */
export type ConnectChannel = '__connector__' | 'request' | 'viewQuery';

export type ConnectMessage = { channel: ConnectChannel;
  data: unknown };

/** 通信双向ready消息频道 */
export const CONNECTOR_READY_CHANNEL: ConnectChannel;
