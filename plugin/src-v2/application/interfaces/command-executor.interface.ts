/**
 * Command execution result
 */
export interface CommandExecutionResult {
  /** Exit code */
  code: number;
  /** Output content */
  output: string;
}

/**
 * Command executor interface
 * Abstracts command execution so business logic does not depend on concrete implementation
 */
export interface ICommandExecutor {
  /**
   * Execute command
   * @param command Command to run
   * @param args Command args (optional)
   * @param extraArgs
   * @param env Environment (optional)
   * @param showOutput Whether to show output
   * @returns Execution result
   */
  execute(
    command: string,
    args?: string[],
    extraArgs?: string[],
    env?: Record<string, string>,
    showOutput?: boolean,
  ): Promise<CommandExecutionResult>;

  /**
   * Kill currently running command
   */
  kill(): Promise<void>;
}
