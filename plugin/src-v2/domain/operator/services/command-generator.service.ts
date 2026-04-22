import {
  getBuildOpCommand,
  getBuildExampleCommand,
  getRunCommand,
  getSimulateCommand,
  getOnBoardCommand,
  getSanitizerCommand,
  getUtTestCommand,
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
  generateBuildExampleCommand(
    configId: number,
    compileOption?: string,
    operatorNames?: string,
  ): string {
    return getBuildExampleCommand(configId, compileOption, operatorNames);
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
    operatorNames?: string,
  ): string {
    return getSimulateCommand(simulateConfigId, exampleConfigId, operatorNames);
  }

  /**
   * Generate on-board analysis command
   */
  generateOnBoardCommand(
    onBoardConfigId: number,
    exampleConfigId: number,
    operatorNames?: string,
  ): string {
    return getOnBoardCommand(onBoardConfigId, exampleConfigId, operatorNames);
  }

  /**
   * Generate sanitizer (anomaly detection) command
   */
  generateSanitizerCommand(
    sanitizerConfigId: number,
    exampleConfigId: number,
    operatorNames?: string,
  ): string {
    return getSanitizerCommand(sanitizerConfigId, exampleConfigId, operatorNames);
  }

  /**
   * Generate build command with simulator
   */
  generateBuildWithSimulatorCommand(
    configId: number,
    simulatorType: string,
    operatorNames?: string,
  ): string {
    return getBuildOpCommand(
      configId,
      objectToCommandString({ [`simulator ${simulatorType || ''}`]: true }),
      operatorNames,
    );
  }

  /**
   * Generate pre-on-board build command
   */
  generateBuildForOnBoardCommand(configId: number, operatorNames?: string): string {
    return getBuildOpCommand(configId, objectToCommandString({ onboard: true }), operatorNames);
  }

  /**
   * Generate pre-sanitizer build command
   */
  generateBuildForSanitizerCommand(configId: number, operatorNames?: string): string {
    return getBuildOpCommand(configId, '--mssanitizer', operatorNames);
  }

  /**
   * Generate UT test command
   */
  generateUtTestCommand(configId: number, operatorNames?: string): string {
    return getUtTestCommand(configId, operatorNames);
  }
}
