import { t } from 'i18next';
import { getOpRunPath } from '@plugin/domain/utils/op-util';
import {
  joinCommands,
  Command,
} from '@plugin/domain/utils/command-utils';
import { ConfigRecord } from '@plugin/domain/models/config-model';
import { OpRecord } from '@plugin/domain/models/model';
import { ProfilerFactory } from '../profiler-service';
import {
  CommandStrategy,
  BaseContext,
  CommandContext,
  CommandBuildParams,
  ProfilerCommandParams,
} from './types';
import { getConfig, getConfigById } from '../../services/configuration';

/**
 * PyAsc 类型命令策略
 * PyAsc 是基于 Python 的算子实现方式，直接运行 Python 文件
 */
export class PyAscCommandStrategy implements CommandStrategy {
  buildCommandContext(baseContext: BaseContext): CommandContext {
    const { config, project, operator } = baseContext;

    // PyAsc 类型使用 ascend_env_script 作为环境脚本（与 CANN 一样）
    const sourceCannCmd =
      project && project.ascend_env_script
        ? `. ${project.ascend_env_script}`
        : '';

    let runPath: string;

    if (operator) {
      runPath = getOpRunPath(operator);
    }
    else {
      // 如果找不到算子，但有配置脚本，使用项目路径作为运行路径
      if (config.script && project) {
        runPath = project.project_path;
      }
      else {
        throw new Error(`Operator not found: ${config.op}`);
      }
    }

    const cdCmd = `cd ${runPath}`;
    const cdBuildCmd = `cd ${runPath}`;

    return {
      config,
      project,
      operator,
      sourceCannCmd,
      cdCmd,
      cdBuildCmd,
    };
  }

  buildRunCommand(context: CommandContext): string {
    const { config, sourceCannCmd, cdCmd } = context;

    return joinCommands(sourceCannCmd, cdCmd, config.target_file);
  }

  buildOpCommand(params: CommandBuildParams): string {
    // PyAsc 类型不支持 buildExampleCommand
    throw new Error(t('pyasc.buildOpNotSupported'));
  }

  buildExampleCommand(params: CommandBuildParams): string {
    // PyAsc 类型不支持 buildExampleCommand
    throw new Error(t('pyasc.buildExampleNotSupported'));
  }

  buildSanitizerCommand(
    config: ConfigRecord,
    operator: OpRecord | null,
    sourceCannCmd: string,
    cdCmd: string,
    exampleTargetFile?: string
  ): string {
    // PyAsc 类型不支持 buildSanitizerCommand
    throw new Error(t('pyasc.buildSanitizerNotSupported'));
  }

  buildSimulateCommand(params: ProfilerCommandParams): string {
    const { config, project, operator, sourceCannCmd, cdCmd, exampleTargetFile } = params;

    // 如果找不到算子记录，但有项目路径，创建一个临时算子对象
    let effectiveOperator = operator;

    if (!effectiveOperator) {
      if (!project || !project.project_path) {
        throw new Error(t('cann.cannotGenerateSimulateCommand', { op: config.op }));
      }

      // 创建临时算子对象，使用项目路径作为 op_path
      effectiveOperator = {
        id: 0,
        project_id: config.project_id,
        op_name: config.op,
        op_type: 'pyasc',
        op_path: project.project_path,
      } as OpRecord;
    }

    const simulatorCmd = ProfilerFactory.getStrategy('simulator')
      .generate(
        config,
        effectiveOperator,
        exampleTargetFile,
      );

    return joinCommands(sourceCannCmd, cdCmd, simulatorCmd);
  }

  buildOnBoardCommand(params: ProfilerCommandParams): string {
    const { config, project, operator, sourceCannCmd, cdCmd, exampleTargetFile } = params;

    // 如果找不到算子记录，但有项目路径，创建一个临时算子对象
    let effectiveOperator = operator;

    if (!effectiveOperator) {
      if (!project || !project.project_path) {
        throw new Error(t('cann.cannotGenerateOnBoardCommand', { op: config.op }));
      }

      // 创建临时算子对象，使用项目路径作为 op_path
      effectiveOperator = {
        id: 0,
        project_id: config.project_id,
        op_name: config.op,
        op_type: 'pyasc',
        op_path: project.project_path,
      } as OpRecord;
    }

    const opprofCmd = ProfilerFactory.getStrategy('onboard')
      .generate(
        config,
        effectiveOperator,
        exampleTargetFile,
      );

    return joinCommands(sourceCannCmd, cdCmd, opprofCmd);
  }

  getRunTargetFile(config: ConfigRecord, operator: OpRecord | null): string {
    // PyAsc 类型：使用当前配置的 target_file
    return config.target_file || '';
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
