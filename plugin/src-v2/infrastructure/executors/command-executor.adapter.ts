import { CommandExecutor } from '@plugin/class/command-options';
import {
  ICommandExecutor,
  CommandExecutionResult,
} from '@plugin-v2/application/interfaces/command-executor.interface';

/**
 * 命令执行器适配器
 * 将现有的 CommandExecutor 适配为 ICommandExecutor 接口
 */
export class CommandExecutorAdapter implements ICommandExecutor {
  constructor(private executor: CommandExecutor) {}

  async execute(
    command: string,
    args: string[] = [],
    extraArgs: string[] = [],
    env: Record<string, string> = {},
    showOutput = true,
  ): Promise<CommandExecutionResult> {
    const result = await this.executor.execute(command, args, extraArgs, env, showOutput);

    // 适配返回类型
    return {
      code: result.code ?? 0,
      output: result.output,
    };
  }

  kill(): void {
    this.executor.kill();
  }
}
