import { t } from 'i18next';
import {
  joinCommands,
  Command,
} from '@plugin/domain/utils/command-utils';
import { ConfigRecord } from '@plugin/domain/models/config-model';
import { OpRecord } from '@plugin/domain/models/model';
import {
  CommandStrategy,
  CommandContext,
  CommandBuildParams,
  ProfilerCommandParams,
} from './types';
import {
  getConfig,
} from '../../services/configuration';
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

  buildRunCommand(context: CommandContext): string {
    const {
      config, sourceCannCmd, cdCmd,
    } = context;

    const runScript = normalizePythonCommandInterpreter(config.target_file || '');
    if (!runScript) {
      throw new Error(t('cann.configMissingScript', { op: config.op }));
    }
    return joinCommands(sourceCannCmd, cdCmd, runScript);
  }

  buildOpCommand(params: CommandBuildParams): string {
    // PyAsc type does not support buildExampleCommand
    throw new Error(t('pyasc.buildOpNotSupported'));
  }

  buildExampleCommand(params: CommandBuildParams): string {
    // PyAsc type does not support buildExampleCommand
    throw new Error(t('pyasc.buildExampleNotSupported'));
  }

  buildSanitizerCommand(
    config: ConfigRecord,
    operator: OpRecord | null,
    sourceCannCmd: string,
    cdCmd: string,
    exampleTargetFile?: string,
  ): string {
    // PyAsc type does not support buildSanitizerCommand
    throw new Error(t('pyasc.buildSanitizerNotSupported'));
  }

  getRunTargetFile(config: ConfigRecord, operator: OpRecord | null): string {
    return getPythonRunTargetFile(config);
  }

  getProfilerTargetFile(config: ConfigRecord, operator: OpRecord | null, exampleConfigId: number): string {
    const buildOpConfigs = getConfig(config.project_id, 'build_op', config.op);
    const buildOpConfig = buildOpConfigs.length > 0 ? buildOpConfigs[0] : null;

    return buildOpConfig?.target_file || '';
  }

  buildUtTestCommand(params: CommandBuildParams): string {
    // PyAsc 类型不支持 buildUtTestCommand
    throw new Error('PyAsc 类型不支持 buildUtTestCommand 操作');
  }
}
