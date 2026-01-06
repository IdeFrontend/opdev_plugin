import type { Ref } from 'vue';

/**
 * 消息数据接口
 */
export interface MessageData {
  command: string;
  data?: unknown;
}

/**
 * 消息处理上下文接口
 */
export interface MessageHandlerContext {
  homePath: Ref<string | null>;
  workspacePath: Ref<string | null>;
  projectPath: { projectPath: string };
  isPathSetFromContextMenu: Ref<boolean>;
}

/**
 * 消息处理策略接口
 */
export interface MessageHandlerStrategy {
  handle(message: MessageData, context: MessageHandlerContext): void;
  canHandle(command: string): boolean;
}

/**
 * 设置Home路径消息处理策略
 */
export class SetHomeMessageHandlerStrategy implements MessageHandlerStrategy {
  canHandle(command: string): boolean {
    return command === 'iframeSetHome';
  }

  handle(message: MessageData, context: MessageHandlerContext): void {
    const obj = (message.data as string) || '/home/developer';

    context.homePath.value = obj;

    if (
      !context.isPathSetFromContextMenu.value
      && (!context.projectPath.projectPath
        || context.projectPath.projectPath === '/home/developer')
    ) {
      if (context.workspacePath.value) {
        context.projectPath.projectPath = context.workspacePath.value;
      }
      else {
        context.projectPath.projectPath = obj;
      }
    }
  }
}

/**
 * 设置项目路径消息处理策略
 */
export class SetProjectPathMessageHandlerStrategy implements MessageHandlerStrategy {
  canHandle(command: string): boolean {
    return command === 'iframeSetProjectPath';
  }

  handle(message: MessageData, context: MessageHandlerContext): void {
    if (message.data) {
      context.projectPath.projectPath = message.data as string;
      context.isPathSetFromContextMenu.value = true;
    }
  }
}

/**
 * 设置最后项目路径消息处理策略
 */
export class SetLastProjectPathMessageHandlerStrategy implements MessageHandlerStrategy {
  canHandle(command: string): boolean {
    return command === 'iframeSetLastProjectPath';
  }

  handle(message: MessageData, context: MessageHandlerContext): void {
    if (!context.isPathSetFromContextMenu.value && message.data) {
      context.projectPath.projectPath = message.data as string;
    }
  }
}

/**
 * 设置工作区路径消息处理策略
 */
export class SetWorkspaceMessageHandlerStrategy implements MessageHandlerStrategy {
  canHandle(command: string): boolean {
    return command === 'iframeSetWorkspace';
  }

  handle(message: MessageData, context: MessageHandlerContext): void {
    context.workspacePath.value = (message.data as string) || null;

    if (
      context.workspacePath.value
      && !context.isPathSetFromContextMenu.value
    ) {
      const currentPath = context.projectPath.projectPath;
      const isDefaultPath = !currentPath || currentPath === '/home/developer';
      const isHomePath =
        context.homePath.value && currentPath === context.homePath.value;

      if (isDefaultPath || isHomePath) {
        context.projectPath.projectPath = context.workspacePath.value;
      }
    }
  }
}

/**
 * 消息处理策略管理器
 * 使用策略模式管理不同的消息处理逻辑
 */
export class MessageHandlerStrategyManager {
  private strategies: MessageHandlerStrategy[] = [];

  constructor() {
    // 注册所有策略
    this.strategies = [
      new SetHomeMessageHandlerStrategy(),
      new SetProjectPathMessageHandlerStrategy(),
      new SetLastProjectPathMessageHandlerStrategy(),
      new SetWorkspaceMessageHandlerStrategy(),
    ];
  }

  /**
   * 处理消息
   */
  handle(message: MessageData, context: MessageHandlerContext): void {
    const strategy = this.strategies.find((s) => s.canHandle(message.command));

    if (strategy) {
      strategy.handle(message, context);
    }
  }
}
