import { Container } from './container';
import { DI_TOKENS } from './tokens';
import { ProjectManager } from '@plugin/core/project/project-manager';

// 基础设施层
import { VscodeNotificationService } from '@plugin-v2/infrastructure/notification/vscode-notification.service';
import { CommandExecutorAdapter } from '@plugin-v2/infrastructure/executors/command-executor.adapter';
import { ConfigRepositoryImpl } from '@plugin-v2/infrastructure/repositories/config.repository.impl';

// 领域层
import { CommandGeneratorService } from '@plugin-v2/domain/operator/services/command-generator.service';
import { BuildOrchestratorService } from '@plugin-v2/domain/operator/services/build-orchestrator.service';

// 应用层
import { BuildApplicationService } from '@plugin-v2/application/services/operator/build.application';

// 表现层
import { BuildControllerV2 } from '@plugin-v2/presentation/controllers-v2/build.controller';

/**
 * 创建并配置依赖注入容器
 */
export function createContainer(): Container {
  const container = new Container();

  // 注册 ProjectManager (使用现有的单例)
  container.registerInstance(
    DI_TOKENS.ProjectManager,
    ProjectManager.getInstance(),
  );

  // 注册基础设施层服务
  container.registerSingleton(
    DI_TOKENS.NotificationService,
    () => new VscodeNotificationService(),
  );

  container.registerSingleton(DI_TOKENS.CommandExecutor, (c) => {
    const pm = c.get<ProjectManager>(DI_TOKENS.ProjectManager);

    return new CommandExecutorAdapter(pm.getExecutor());
  });

  container.registerSingleton(DI_TOKENS.ConfigRepository, (c) => {
    const pm = c.get<ProjectManager>(DI_TOKENS.ProjectManager);
    const projectId = Number(pm.projectId);

    return new ConfigRepositoryImpl(projectId);
  });

  // 注册领域层服务
  container.registerSingleton(
    DI_TOKENS.CommandGeneratorService,
    () => new CommandGeneratorService(),
  );

  container.registerSingleton(DI_TOKENS.BuildOrchestratorService, (c) => {
    const commandGenerator = c.get<CommandGeneratorService>(DI_TOKENS.CommandGeneratorService);
    const executor = c.get<CommandExecutorAdapter>(DI_TOKENS.CommandExecutor);

    return new BuildOrchestratorService(commandGenerator, executor);
  });

  // 注册应用层服务
  container.registerSingleton(DI_TOKENS.BuildApplicationService, (c) => {
    const configRepo = c.get<ConfigRepositoryImpl>(DI_TOKENS.ConfigRepository);
    const buildOrchestrator = c.get<BuildOrchestratorService>(DI_TOKENS.BuildOrchestratorService);

    return new BuildApplicationService(configRepo, buildOrchestrator);
  });

  // 注册表现层控制器
  container.registerSingleton(DI_TOKENS.BuildController, (c) => {
    const buildService = c.get<BuildApplicationService>(DI_TOKENS.BuildApplicationService);
    const notification = c.get<VscodeNotificationService>(DI_TOKENS.NotificationService);
    const pm = c.get<ProjectManager>(DI_TOKENS.ProjectManager);

    return new BuildControllerV2(buildService, notification, pm);
  });

  return container;
}

// 创建全局容器实例
export const containerV2 = createContainer();
