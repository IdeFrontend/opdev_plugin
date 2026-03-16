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
 * Command generator service
 * Domain service; generates operator operation commands
 */
export class CommandGeneratorService {
  /**
   * Generate build operator command
   */
  generateBuildCommand(configId: number, compileOption?: string, operatorNames?: string): string {
    return getBuildOpCommand(configId, compileOption, operatorNames);
  }

  /**
   * Generate build example command
   */
  generateBuildExampleCommand(configId: number, operatorNames?: string): string {
    return getBuildExampleCommand(configId, undefined, operatorNames);
  }

  /**
   * Generate run command
   */
  generateRunCommand(configId: number): string {
    return getRunCommand(configId);
  }

  /**
   * Generate simulate analysis command
   */
  generateSimulateCommand(
    simulateConfigId: number,
    exampleConfigId: number,
  ): string {
    return getSimulateCommand(simulateConfigId, exampleConfigId);
  }

  /**
   * Generate on-board analysis command
   */
  generateOnBoardCommand(
    onBoardConfigId: number,
    exampleConfigId: number,
  ): string {
    return getOnBoardCommand(onBoardConfigId, exampleConfigId);
  }

  /**
   * Generate sanitizer (anomaly detection) command
   */
  generateSanitizerCommand(
    sanitizerConfigId: number,
    exampleConfigId: number,
  ): string {
    return getSanitizerCommand(sanitizerConfigId, exampleConfigId);
  }

  /**
   * Generate build command with simulator
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
   * Generate pre-on-board build command
   */
  generateBuildForOnBoardCommand(configId: number): string {
    return getBuildOpCommand(configId, objectToCommandString({ onboard: true }));
  }

  /**
   * Generate pre-sanitizer build command
   */
  generateBuildForSanitizerCommand(configId: number): string {
    return getBuildOpCommand(configId, '--mssanitizer');
  }
}
