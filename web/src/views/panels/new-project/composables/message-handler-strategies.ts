/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import type { Ref } from 'vue';

export interface MessageData {
  command: string;
  data?: unknown;
}

export interface MessageHandlerContext {
  homePath: Ref<string | null>;
  workspacePath: Ref<string | null>;
  projectPath: { projectPath: string };
  isPathSetFromContextMenu: Ref<boolean>;
}

export interface MessageHandlerStrategy {
  handle(message: MessageData, context: MessageHandlerContext): void;
  canHandle(command: string): boolean;
}

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

export class MessageHandlerStrategyManager {
  private strategies: MessageHandlerStrategy[] = [];

  constructor() {
    this.strategies = [
      new SetHomeMessageHandlerStrategy(),
      new SetProjectPathMessageHandlerStrategy(),
      new SetWorkspaceMessageHandlerStrategy(),
    ];
  }

  handle(message: MessageData, context: MessageHandlerContext): void {
    const strategy = this.strategies.find((s) => s.canHandle(message.command));

    if (strategy) {
      strategy.handle(message, context);
    }
  }
}
