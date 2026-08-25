import { t } from 'i18next';
import { joinCommands } from '@plugin/domain/utils/command-utils';
import type {
  BuildOpConfig,
  BuildExampleConfig,
  UtTestConfig,
  SanitizerConfig,
} from '@plugin/service/config-service';
import {
  OpRecord,
  resolveFallbackOperatorName,
} from '@plugin/domain/models/op-record';
import {
  CommandStrategy,
  CommandContext,
  CommandBuildParams,
  ProfilerTargetConfig,
} from './types';
import { ConfigService } from '@plugin/service/config-service';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import {
  getPythonRunTargetFile,
  normalizePythonCommandInterpreter,
} from './python-operator-strategy-shared';
import { BasePythonCommandStrategy } from './base-python-strategy';

/**
 * PyAsc type command strategy
 * PyAsc is a Python-based operator implementation that directly runs Python files
 */
export class PyAscCommandStrategy extends BasePythonCommandStrategy implements CommandStrategy {
  protected readonly pythonOpType = 'pyasc';

  buildRunCommand(context: CommandContext<BuildOpConfig>): string {
    const {
      config, sourceCannCmd, cdCmd, op,
    } = context;

    const runScript = normalizePythonCommandInterpreter(config.targetFile || '');

    if (!runScript) {
      throw new Error(t('cann.configMissingScript', { op }));
    }

    return joinCommands(sourceCannCmd, cdCmd, runScript);
  }

  buildOpCommand(_params: CommandBuildParams<BuildOpConfig>): string {
    // PyAsc type does not support buildExampleCommand
    throw new Error(t('pyasc.buildOpNotSupported'));
  }

  buildExampleCommand(_params: CommandBuildParams<BuildExampleConfig>): string {
    // PyAsc type does not support buildExampleCommand
    throw new Error(t('pyasc.buildExampleNotSupported'));
  }

  buildSanitizerCommand(_context: CommandContext<SanitizerConfig>, _exampleTargetFile?: string): string {
    // PyAsc type does not support buildSanitizerCommand
    throw new Error(t('pyasc.buildSanitizerNotSupported'));
  }

  getRunTargetFile(): string {
    return getPythonRunTargetFile();
  }

  getProfilerTargetFile(config: ProfilerTargetConfig, operator: OpRecord | null, op: string): string {
    return ConfigService.readBuildOpDeployTargetFromWorkspace()
      || OperatorPluginRegistry.getDefaultPaths({
        op_type: 'pyasc',
        op_path: operator?.op_path || '',
        op_name: resolveFallbackOperatorName(operator, op),
      }).targetOpFile;
  }

  buildUtTestCommand(_params: CommandBuildParams<UtTestConfig>): string {
    // PyAsc 类型不支持 buildUtTestCommand
    throw new Error('PyAsc 类型不支持 buildUtTestCommand 操作');
  }
}
