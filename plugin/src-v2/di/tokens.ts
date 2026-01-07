/**
 * 依赖注入令牌
 * 用于标识和获取依赖
 */
export const DI_TOKENS = {
  // 基础设施层
  NotificationService: Symbol('NotificationService'),
  CommandExecutor: Symbol('CommandExecutor'),
  FileSystem: Symbol('FileSystem'),
  Logger: Symbol('Logger'),

  // 领域层 - 仓储
  ConfigRepository: Symbol('ConfigRepository'),
  OperatorRepository: Symbol('OperatorRepository'),

  // 领域层 - 服务
  CommandGeneratorService: Symbol('CommandGeneratorService'),
  BuildOrchestratorService: Symbol('BuildOrchestratorService'),

  // 应用层
  BuildApplicationService: Symbol('BuildApplicationService'),

  // 表现层
  BuildController: Symbol('BuildController'),

  // 核心
  ProjectManager: Symbol('ProjectManager'),
} as const;

export type DIToken = (typeof DI_TOKENS)[keyof typeof DI_TOKENS];
