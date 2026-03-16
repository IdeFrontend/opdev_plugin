/**
 * Notification service interface
 * Abstracts UI interaction so business logic does not depend on concrete UI
 */
export interface INotificationService {
  /**
   * Show info message
   */
  showInfo(message: string): void;

  /**
   * Show error message
   */
  showError(message: string): void;

  /**
   * Show warning message
   */
  showWarning(message: string): void;

  /**
   * Show progress
   */
  showProgress(title: string, task: ()=> Promise<void>): Promise<void>;
}
