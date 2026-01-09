import {
  getBuildOpCommand,
  getBuildExampleCommand,
  getRunCommand,
  getSimulateCommand,
  getOnBoardCommand,
  getSanitizerCommand,
  objectToCommandString,
} from '@plugin/domain';

/**
 * 命令生成器服务
 * 领域服务,负责生成各种算子操作命令
 */
export class CommandGeneratorService {
  /**
   * 生成构建算子命令
   */
  generateBuildCommand(configId: number, compileOption?: string): string {
    return getBuildOpCommand(configId, compileOption);
  }

  /**
   * 生成构建示例命令
   */
  generateBuildExampleCommand(configId: number): string {
    return getBuildExampleCommand(configId);
  }

  /**
   * 生成运行命令
   */
  generateRunCommand(configId: number): string {
    return getRunCommand(configId);
  }

  /**
   * 生成仿真分析命令
   */
  generateSimulateCommand(
    simulateConfigId: number,
    exampleConfigId: number,
  ): string {
    return getSimulateCommand(simulateConfigId, exampleConfigId);
  }

  /**
   * 生成上板分析命令
   */
  generateOnBoardCommand(
    onBoardConfigId: number,
    exampleConfigId: number,
  ): string {
    return getOnBoardCommand(onBoardConfigId, exampleConfigId);
  }

  /**
   * 生成异常检测命令
   */
  generateSanitizerCommand(
    sanitizerConfigId: number,
    exampleConfigId: number,
  ): string {
    return getSanitizerCommand(sanitizerConfigId, exampleConfigId);
  }

  /**
   * 生成带仿真器的构建命令
   */
  generateBuildWithSimulatorCommand(
    configId: number,
    simulatorType: string,
  ): string {
    return getBuildOpCommand(
      configId,
      objectToCommandString({ [`simulator ${simulatorType || ''}`]: true }),
    );
  }

  /**
   * 生成上板前的构建命令
   */
  generateBuildForOnBoardCommand(configId: number): string {
    return getBuildOpCommand(configId, objectToCommandString({ onboard: true }));
  }

  /**
   * 生成异常检测前的构建命令
   */
  generateBuildForSanitizerCommand(configId: number): string {
    return getBuildOpCommand(configId, '--mssanitizer');
  }
}
