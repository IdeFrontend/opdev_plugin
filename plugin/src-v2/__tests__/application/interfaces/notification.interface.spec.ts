import { 
  INotificationService 
} from '../../application/interfaces/notification.interface';

// Ensures interface is well-defined and implementable
describe('Notification Service Interface', () => {
  // Mock implementation to test interface
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