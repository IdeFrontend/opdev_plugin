/**
 * 通知服务接口
 * 抽象 UI 交互,使业务逻辑层不依赖具体的 UI 实现
 */
export interface INotificationService {
  /**
   * 显示信息提示
   */
  showInfo(message: string): void;

  /**
   * 显示错误提示
   */
  showError(message: string): void;

  /**
   * 显示警告提示
   */
  showWarning(message: string): void;

  /**
   * 显示进度提示
   */
  showProgress(title: string, task: ()=> Promise<void>): Promise<void>;
}
