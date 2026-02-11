import * as vscode from 'vscode';
import { VscodeNotificationService } from '../../../infrastructure/notification/vscode-notification.service';
import { INotificationService } from '../../../application/interfaces/notification.interface';

// Mock VSCode API
jest.mock('vscode', () => ({
  window: {
    showInformationMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    withProgress: jest.fn(),
    ProgressLocation: {
      Notification: 1,
    },
  },
}));

describe('VscodeNotificationService', () => {
  let notificationService: INotificationService;

  beforeEach(() => {
    notificationService = new VscodeNotificationService();
    jest.clearAllMocks();
  });

  describe('showInfo', () => {
    it('should call vscode.window.showInformationMessage', () => {
      // Arrange
      const message = 'Test info message';

      // Act
      notificationService.showInfo(message);

      // Assert
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(message);
    });
  });

  describe('showError', () => {
    it('should call vscode.window.showErrorMessage', () => {
      // Arrange
      const message = 'Test error message';

      // Act
      notificationService.showError(message);

      // Assert
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(message);
    });
  });

  describe('showWarning', () => {
    it('should call vscode.window.showWarningMessage', () => {
      // Arrange
      const message = 'Test warning message';

      // Act
      notificationService.showWarning(message);

      // Assert
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(message);
    });
  });

  describe('showProgress', () => {
    it('should call vscode.window.withProgress with correct options', async () => {
      // Arrange
      const title = 'Test Progress';
      const mockTask = jest.fn().mockResolvedValue(undefined);

      // Act
      await notificationService.showProgress(title, mockTask);

      // Assert
      expect(vscode.window.withProgress).toHaveBeenCalledWith(
        {
          location: vscode.ProgressLocation.Notification,
          title,
          cancellable: false,
        },
        expect.any(Function) // The callback function that executes the task
      );
      expect(mockTask).toHaveBeenCalled();
    });

    it('should properly execute the task within progress wrapper', async () => {
      // Arrange
      const title = 'Test Progress';
      const mockTask = jest.fn().mockResolvedValue('task result');

      // Act
      await notificationService.showProgress(title, mockTask);

      // Extract the callback function that was passed to withProgress
      const progressCallback = (vscode.window.withProgress as jest.Mock).mock.calls[0][1];
      
      // Verify that the task was executed
      expect(mockTask).toHaveBeenCalled();
    });
  });
});