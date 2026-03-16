/**
 * Dependency injection tokens
 * Identify and resolve dependencies
 */
export const DI_TOKENS = {
  // Infrastructure layer
  NotificationService: Symbol('NotificationService'),
  CommandExecutor: Symbol('CommandExecutor'),
  FileSystem: Symbol('FileSystem'),
  Logger: Symbol('Logger'),

  // Domain layer - repositories
  ConfigRepository: Symbol('ConfigRepository'),
  OperatorRepository: Symbol('OperatorRepository'),

  // Domain layer - services
  CommandGeneratorService: Symbol('CommandGeneratorService'),
  BuildOrchestratorService: Symbol('BuildOrchestratorService'),

  // Application layer
  BuildApplicationService: Symbol('BuildApplicationService'),

  // Presentation layer
  BuildController: Symbol('BuildController'),

  // Core
  ProjectManager: Symbol('ProjectManager'),
} as const;

export type DIToken = (typeof DI_TOKENS)[keyof typeof DI_TOKENS];
