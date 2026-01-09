/**
 * 命令执行结果
 */
export interface CommandExecutionResult {
  /** 退出码 */
  code: number;
  /** 输出内容 */
  output: string;
}

/**
 * 命令执行器接口
 * 抽象命令执行,使业务逻辑层不依赖具体的执行实现
 */
export interface ICommandExecutor {
  /**
   * 执行命令
   * @param command 要执行的命令
   * @param args 命令参数(可选)
   * @param extraArgs
   * @param env 环境变量(可选)
   * @param showOutput 是否显示输出
   * @returns 执行结果
   */
  execute(
    command: string,
    args?: string[],
    extraArgs?: string[],
    env?: Record<string, string>,
    showOutput?: boolean,
  ): Promise<CommandExecutionResult>;

  /**
   * 终止当前执行的命令
   */
  kill(): Promise<void>;
}
