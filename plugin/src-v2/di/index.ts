import { Container } from './container';
import { DI_TOKENS } from './tokens';
import { ProjectManager } from '@plugin/core/project/project-manager';

// Infrastructure layer
import { VscodeNotificationService } from '@plugin-v2/infrastructure/notification/vscode-notification.service';
import { CommandExecutorAdapter } from '@plugin-v2/infrastructure/executors/command-executor.adapter';
import { ConfigRepositoryImpl } from '@plugin-v2/infrastructure/repositories/config.repository.impl';

// Domain layer
import { CommandGeneratorService } from '@plugin-v2/domain/operator/services/command-generator.service';
import { BuildOrchestratorService } from '@plugin-v2/domain/operator/services/build-orchestrator.service';

// Application layer
import { BuildApplicationService } from '@plugin-v2/application/services/operator/build.application';

// Presentation layer
import { BuildControllerV2 } from '@plugin-v2/presentation/controllers-v2/build.controller';

/**
 * Create and configure DI container
 */
export function createContainer(): Container {
  const container = new Container();

  // Register ProjectManager (use existing singleton)
  container.registerInstance(
    DI_TOKENS.ProjectManager,
    ProjectManager.getInstance(),
  );

  // Register infrastructure layer services
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

  // Register domain layer services
  container.registerSingleton(
    DI_TOKENS.CommandGeneratorService,
    () => new CommandGeneratorService(),
  );

  container.registerSingleton(DI_TOKENS.BuildOrchestratorService, (c) => {
    const commandGenerator = c.get<CommandGeneratorService>(DI_TOKENS.CommandGeneratorService);
    const executor = c.get<CommandExecutorAdapter>(DI_TOKENS.CommandExecutor);

    return new BuildOrchestratorService(commandGenerator, executor);
  });

  // Register application layer services
  container.registerSingleton(DI_TOKENS.BuildApplicationService, (c) => {
    const configRepo = c.get<ConfigRepositoryImpl>(DI_TOKENS.ConfigRepository);
    const buildOrchestrator = c.get<BuildOrchestratorService>(DI_TOKENS.BuildOrchestratorService);

    return new BuildApplicationService(configRepo, buildOrchestrator);
  });

  // Register presentation layer controller
  container.registerSingleton(DI_TOKENS.BuildController, (c) => {
    const buildService = c.get<BuildApplicationService>(DI_TOKENS.BuildApplicationService);
    const notification = c.get<VscodeNotificationService>(DI_TOKENS.NotificationService);
    const pm = c.get<ProjectManager>(DI_TOKENS.ProjectManager);

    return new BuildControllerV2(buildService, notification, pm);
  });

  return container;
}

// Create global container instance
export const containerV2 = createContainer();
