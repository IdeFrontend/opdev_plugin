import { 
  INotificationService 
} from '../../application/interfaces/notification.interface';

// 这个测试确保接口定义正确且可以被实现
describe('Notification Service Interface', () => {
  // 创建一个模拟实现来测试接口
  const mockNotificationService: INotificationService = {
    showInfo: jest.fn(),
    showError: jest.fn(),
    showWarning: jest.fn(),
    showProgress: jest.fn(),
  };

  it('should have showInfo method with correct signature', () => {
    expect(typeof mockNotificationService.showInfo).toBe('function');
  });

  it('should have showError method with correct signature', () => {
    expect(typeof mockNotificationService.showError).toBe('function');
  });

  it('should have showWarning method with correct signature', () => {
    expect(typeof mockNotificationService.showWarning).toBe('function');
  });

  it('should have showProgress method with correct signature', () => {
    expect(typeof mockNotificationService.showProgress).toBe('function');
  });
});