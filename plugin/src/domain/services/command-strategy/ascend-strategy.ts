import { soc_version } from '@plugin/domain/utils/ascend-util';
import { parse_cmd_options } from '@plugin/domain/utils/aicore-utils';
import { getOpRunPath } from '@plugin/domain/utils/op-util';
import {
  joinCommands,
  getExecutableCommand,
  Command,
  objectToCommandString,
} from '@plugin/domain/utils/command-utils';
import { OpRecord } from '@plugin/domain/models/model';
import { ProfilerFactory } from '../profiler-service';
import {
  CommandStrategy,
  BaseContext,
  CommandContext,
  CommandBuildParams,
  ProfilerCommandParams,
} from './types';
import { ConfigRecord } from '@plugin/domain/models/config-model';
import { getConfig, getConfigById } from '../../services/configuration';
import { getProjectById } from '@plugin/domain/models/project-model';

/**
 * Ascend 类型命令策略
 */
export class AscendCommandStrategy implements CommandStrategy {
  /**
   * 替换脚本中的 {soc_version} 占位符
   * @param script 原始脚本字符串
   * @param projectId 项目ID
   * @returns 替换后的脚本字符串
   */
  private replaceSocVersion(script: string, projectId: number): string {
    if (projectId) {
      const project = getProjectById(projectId);
      if (project && project.soc_version) {
        return script.replace(/{soc_version}/g, project.soc_version);
      } else {
        // 如果项目配置中没有 soc_version，使用默认值
        return script.replace(/{soc_version}/g, soc_version);
      }
    }
    return script;
  }

  buildCommandContext(baseContext: BaseContext): CommandContext {
    const { config, project, operator } = baseContext;

    // Ascend 类型使用 ascend_env_script 作为环境脚本
    const sourceCannCmd =
      project && project.ascend_env_script
        ? `. ${project.ascend_env_script}`
        : '';

    let runPath: string;

    if (operator) {
      runPath = getOpRunPath(operator, config);
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
    const cdBuildCmd = `mkdir -p ${runPath}/build && cd ${runPath}/build`;

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
    const run_cmd = getExecutableCommand(config.target_file || '', { execute: true });

    return joinCommands(sourceCannCmd, cdCmd, run_cmd);
  }

  buildOpCommand(params: CommandBuildParams): string {
    const { config, sourceCannCmd, cdCmd, compileOption, advance_cmd, operatorNames } = params;

    const scriptField = params.scriptField || 'script'

    const userOptions = (config.user_options as Record<string, unknown> | null | undefined) || {}

    let script = userOptions[scriptField] as string || '';
    // 替换 {soc_version} 为项目配置中的 soc_version
    script = this.replaceSocVersion(script, config.project_id);

    const cmd = new Command(script);

    const options: Record<string, unknown> = {};

    // 只有当 operatorNames 存在且不为空时，才添加 ops 参数
    if (operatorNames && operatorNames.trim()) {
      options.ops = operatorNames;
    }

    cmd.addOptions(options);

    if (compileOption) {
      cmd.addArgument(compileOption);
    }

    if (advance_cmd) {
      cmd.addArgument(advance_cmd);
    }

    const deploy_cmd = getExecutableCommand(config.target_file || '', { execute: true });

    return joinCommands(sourceCannCmd, cdCmd, cmd.toString(), deploy_cmd);
  }

  buildExampleCommand(params: CommandBuildParams): string {
    const { config, sourceCannCmd, cdCmd, compileOption, advance_cmd, operatorNames } = params;

    const options = (config.user_options as Record<string, unknown> | null | undefined) || {};
    const mode = options.execution_mode as string || 'eager';
    let pkg_mode = 'cust';
    // 如果提供了 operatorNames，优先使用它；否则使用 config.op
    const op = operatorNames || '';

    let script = config.script || '';
    // 替换 {soc_version} 为项目配置中的 soc_version
    script = this.replaceSocVersion(script, config.project_id);

    const cmd = new Command(script);

    cmd.addArgument(op);
    cmd.addArgument(mode);
    cmd.addArgument(pkg_mode);

    if (compileOption) {
      cmd.addArgument(compileOption);
    }

    if (advance_cmd) {
      cmd.addArgument(advance_cmd);
    }

    return joinCommands(sourceCannCmd, cdCmd, cmd.toString());
  }

  buildUtTestCommand(params: CommandBuildParams): string {
    const { config, sourceCannCmd, cdCmd, advance_cmd, operatorNames } = params;

    let script = config.script || '';
    // 替换 {soc_version} 为项目配置中的 soc_version
    script = this.replaceSocVersion(script, config.project_id);

    // 替换 {operatorNames} 为传入的算子名称
    if (operatorNames) {
      script = script.replace('{operatorNames}', operatorNames);
    } else {
      script = script.replace('{operatorNames}', '');
    }

    const cmd = new Command(script);

    if (advance_cmd) {
      cmd.addArgument(advance_cmd);
    }

    return joinCommands(sourceCannCmd, cdCmd, cmd.toString());
  }

  buildSanitizerCommand(
    config: ConfigRecord,
    operator: OpRecord | null,
    sourceCannCmd: string,
    cdCmd: string,
    exampleTargetFile?: string
  ): string {
    // 替换 {soc_version} 为项目配置中的 soc_version
    let script = config.script || '';
    script = this.replaceSocVersion(script, config.project_id);

    const mssanitizer = new Command('mssanitizer');

    // 添加目标文件
    if (exampleTargetFile) {
      mssanitizer.addArgument(exampleTargetFile);
    }

    // 处理配置选项
    const options = (config.user_options as Record<string, unknown> | null | undefined) || {};
    const toolOptions = (options.tool as Record<string, unknown> | undefined) || {};
    const tools = Object.keys(toolOptions)
      .filter((key) => toolOptions[key]);

    mssanitizer.addOption('tool', tools);

    if (toolOptions.memcheck) {
      const memcheckOptions = (options.memcheckOption as Record<string, unknown> | undefined) || {};

      Object.keys(memcheckOptions)
        .forEach((key) => {
          if (memcheckOptions[key]) {
            mssanitizer.addOption(key, 'yes');
          }
        });
    }

    mssanitizer.addOption('log-level', options.logLevel as string | undefined);
    mssanitizer.addOption('max-debuglog-size', options.maxDebuglogSize as string | undefined);
    mssanitizer.addOption('block-id', options.blockId as string | number | undefined);
    mssanitizer.addOption(
      'log-file',
      `${operator?.op_path}/.vscode/mindstudio_sanitizer_log/mssanitizer_${new Date()
        .valueOf()}.log`,
    );

    return joinCommands(sourceCannCmd, cdCmd, mssanitizer.toString());
  }

  buildSimulateCommand(params: ProfilerCommandParams): string {
    const { config, project, operator, sourceCannCmd, cdBuildCmd, exampleTargetFile } = params;

    // 如果找不到算子记录，但有项目路径，创建一个临时算子对象
    let effectiveOperator = operator;

    if (!effectiveOperator) {
      if (!project || !project.project_path) {
        throw new Error(`无法生成仿真命令：找不到算子记录 ${config.op}，且项目路径不可用`);
      }

      // 创建临时算子对象，使用项目路径作为 op_path
      effectiveOperator = {
        id: 0,
        project_id: config.project_id,
        op_name: config.op,
        op_type: 'ascend',
        op_path: project.project_path,
      } as OpRecord;
    }

    const simulatorCmd = ProfilerFactory.getStrategy('simulator')
      .generate(
        config,
        effectiveOperator,
        exampleTargetFile,
      );

    return joinCommands(sourceCannCmd, cdBuildCmd, simulatorCmd);
  }

  buildOnBoardCommand(params: ProfilerCommandParams): string {
    const { config, project, operator, sourceCannCmd, cdBuildCmd, exampleTargetFile } = params;

    // 如果找不到算子记录，但有项目路径，创建一个临时算子对象
    let effectiveOperator = operator;

    if (!effectiveOperator) {
      if (!project || !project.project_path) {
        throw new Error(`无法生成上板命令：找不到算子记录 ${config.op}，且项目路径不可用`);
      }

      // 创建临时算子对象，使用项目路径作为 op_path
      effectiveOperator = {
        id: 0,
        project_id: config.project_id,
        op_name: config.op,
        op_type: 'ascend',
        op_path: project.project_path,
      } as OpRecord;
    }

    const opprofCmd = ProfilerFactory.getStrategy('onboard')
      .generate(
        config,
        effectiveOperator,
        exampleTargetFile,
      );

    return joinCommands(sourceCannCmd, cdBuildCmd, opprofCmd);
  }

  getRunTargetFile(config: ConfigRecord, operator: OpRecord | null): string {
    // ascend 类型：使用当前配置的 target_file
    return config.target_file || '';
  }

  getProfilerTargetFile(config: ConfigRecord, operator: OpRecord | null, exampleConfigId: number): string {
    // ascend 类型：使用示例配置的 target_file
    const exConfig = getConfigById(exampleConfigId) as unknown as ConfigRecord;
    return exConfig?.target_file || '';
  }
}
