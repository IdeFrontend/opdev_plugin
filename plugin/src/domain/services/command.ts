import { getOpByProjectIdAndOpName } from './ops';
import { getProjectById } from '@plugin/domain';
import { getConfigById } from './configuration';
import { soc_version } from '@plugin/domain/utils/ascend-util';
import { parse_cmd_options } from '@plugin/domain/utils/aicore-utils';
import { getOpRunPath } from '@plugin/domain/utils/op-util';
import {
  joinCommands,
  getExecutableCommand,
  getAdvanceCmd,
  Command,
} from '@plugin/domain/utils/command-utils';
import { ConfigRecord } from '@plugin/domain/models/config-model';
import { ProjectRecord } from '@plugin/domain/models/project-model';
import { OpRecord } from '@plugin/domain/models/model';
import { ProfilerFactory } from './profiler-service';

/**
 * 上下文接口，包含生成命令所需的基础信息
 */
interface CommandContext {
  config: ConfigRecord;
  project: ProjectRecord | null;
  operator: OpRecord | null;
  sourceCannCmd: string;
  cdCmd: string;
}

/**
 * 获取命令生成所需的通用上下文信息
 *
 * @param configId 配置ID
 * @returns CommandContext 上下文对象
 * @throws Error 如果配置不存在
 */
function getCommandContext(configId: number): CommandContext {
  const config = getConfigById(configId) as unknown as ConfigRecord;

  if (!config) {
    throw new Error('配置不存在');
  }

  const project = getProjectById(config.project_id);
  const operator = getOpByProjectIdAndOpName(config.project_id, config.op);

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

  return {
    config,
    project,
    operator,
    sourceCannCmd,
    cdCmd,
  };
}

/**
 * 生成算子编译命令
 *
 * @param config_id 配置ID
 * @param compileOption 编译参数 --debug: debug模式 ；  --mssanitizer: 异常检测模式
 * @returns 完整的shell执行命令字符串
 */
export function getBuildOpCommand(config_id: number, compileOption?: string) {
  try {
    const {
      config, operator, sourceCannCmd, cdCmd,
    } =
      getCommandContext(config_id);
    const userOptions = config.user_options as Record<string, unknown> | null | undefined;
    const advance_cmd = getAdvanceCmd(userOptions?.advance_param);

    // 如果没有算子记录，或者算子类型不是 ascend，使用自定义脚本
    if (!operator || operator.op_type !== 'ascend') {
      // 如果没有脚本，抛出错误
      if (!config.script) {
        throw new Error(`配置缺少脚本信息，且找不到算子记录: ${config.op}`);
      }

      const cmd = new Command(config.script || '');

      if (config.custom_options) {
        cmd.addArgument(config.custom_options);
      }

      if (compileOption) {
        cmd.addArgument(compileOption);
      }

      if (advance_cmd) {
        cmd.addArgument(advance_cmd);
      }

      return joinCommands(sourceCannCmd, cdCmd, cmd.toString());
    }

    let soc = soc_version;
    let vendor_name = 'custom';
    const op = config.op;
    const args = parse_cmd_options(config.custom_options || null);

    if (args && args.vendor_name) {
      vendor_name = args.vendor_name;
    }

    if (args && args.soc) {
      soc = args.soc;
    }

    const cmd = new Command(config.script || '');

    cmd.addOptions({
      pkg: true,
      soc,
      vendor_name,
      ops: op,
    });

    if (compileOption) {
      cmd.addArgument(compileOption);
    }

    if (advance_cmd) {
      cmd.addArgument(advance_cmd);
    }

    const deploy_cmd = getExecutableCommand(config.target_file || '', { execute: true });

    return joinCommands(sourceCannCmd, cdCmd, cmd.toString(), deploy_cmd);
  }
  catch (e: unknown) {
    throw new Error(`生成编译命令失败:${(e as Error).message}`);
  }
}

/**
 * 生成算子运行命令
 *
 * @param config_id 配置ID
 * @returns 完整的shell执行命令字符串
 */
export function getRunCommand(config_id: number) {
  try {
    const {
      config, sourceCannCmd, cdCmd,
    } = getCommandContext(config_id);
    const run_cmd = getExecutableCommand(config.target_file || '', { execute: true });

    // 注意：原始代码中两个分支的返回值相同，这里保持简化的逻辑。
    return joinCommands(sourceCannCmd, cdCmd, run_cmd);
  }
  catch (e: unknown) {
    throw new Error(`生成运行命令失败:${(e as Error).message}`);
  }
}

/**
 * 生成示例编译命令
 *
 * @param config_id 配置ID
 * @param compileOption 编译选项
 * @returns 完整的shell执行命令字符串
 */
export function getBuildExampleCommand(
  config_id: number,
  compileOption?: string,
) {
  try {
    const {
      config, operator, sourceCannCmd, cdCmd,
    } =
      getCommandContext(config_id);
    const userOptions = config.user_options as Record<string, unknown> | null | undefined;
    const advance_cmd = getAdvanceCmd(userOptions?.advance_param);

    // 如果没有算子记录，或者算子类型不是 ascend，使用自定义脚本
    if (!operator || operator.op_type !== 'ascend') {
      // 如果没有脚本，抛出错误
      if (!config.script) {
        throw new Error(`配置缺少脚本信息，且找不到算子记录: ${config.op}`);
      }

      const cmd = new Command(config.script || '');

      if (config.custom_options) {
        cmd.addArgument(config.custom_options);
      }

      if (compileOption) {
        cmd.addArgument(compileOption);
      }

      if (advance_cmd) {
        cmd.addArgument(advance_cmd);
      }

      return joinCommands(sourceCannCmd, cdCmd, cmd.toString());
    }

    let vendor_name = 'custom';
    let pkg_mode = 'cust';
    let mode = 'eager';
    const op = config.op;
    const args = parse_cmd_options(config.custom_options || null);

    if (args && args.vendor_name) {
      vendor_name = args.vendor_name;
    }

    if (args && args.pkg_mode) {
      pkg_mode = args.pkg_mode;
    }

    if (args && args.mode) {
      mode = args.mode;
    }

    const cmd = new Command(config.script || '');

    cmd.addOption('run_example', true);
    cmd.addArgument(op);
    cmd.addArgument(mode);
    cmd.addArgument(pkg_mode);
    cmd.addArgument(vendor_name);

    if (compileOption) {
      cmd.addArgument(compileOption);
    }

    if (advance_cmd) {
      cmd.addArgument(advance_cmd);
    }

    return joinCommands(sourceCannCmd, cdCmd, cmd.toString());
  }
  catch (e: unknown) {
    throw new Error(`生成编译命令失败:${(e as Error).message}`);
  }
}

/**
 * 生成仿真命令
 *
 * 示例:
 * msprof op --output=$home/projects/output $home/projects/MyApp/out/main blockdim 1
 * msprof op simulator --soc-version=Ascendxxxyy --output=...
 *
 * @param config_id 配置ID
 * @param example_config_id 示例配置ID
 * @returns 完整的shell执行命令字符串
 */
export function getSimulateCommand(
  config_id: number,
  example_config_id: number,
) {
  try {
    const {
      config, project, operator, sourceCannCmd, cdCmd,
    } =
      getCommandContext(config_id);

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
        op_type: 'ascend', // 默认假设为 ascend 类型
        op_path: project.project_path,
      } as OpRecord;
    }

    const exConfig = getConfigById(example_config_id) as unknown as ConfigRecord;

    const simulatorCmd = ProfilerFactory.getStrategy('simulator')
      .generate(
        config,
        effectiveOperator,
        exConfig?.target_file || '',
      );

    return joinCommands(sourceCannCmd, cdCmd, simulatorCmd);
  }
  catch (e: unknown) {
    // 稍微规范化错误消息或保持原样
    throw new Error(`获取仿真命令失败 ${(e as Error).message}`);
  }
}

/**
 * 生成上板命令
 *
 * @param config_id 配置ID
 * @param example_config_id 示例配置ID
 * @returns 完整的shell执行命令字符串
 */
export function getOnBoardCommand(
  config_id: number,
  example_config_id: number,
) {
  try {
    const {
      config, project, operator, sourceCannCmd, cdCmd,
    } =
      getCommandContext(config_id);

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
        op_type: 'ascend', // 默认假设为 ascend 类型
        op_path: project.project_path,
      } as OpRecord;
    }

    const exConfig = getConfigById(example_config_id) as unknown as ConfigRecord;

    const opprofCmd = ProfilerFactory.getStrategy('onboard')
      .generate(
        config,
        effectiveOperator,
        exConfig?.target_file || '',
      );

    return joinCommands(sourceCannCmd, cdCmd, opprofCmd);
  }
  catch (e: unknown) {
    throw new Error(`获取上板命令失败 ${(e as Error).message}`);
  }
}

/**
 * 生成Sanitizer(异常检测)命令
 *
 * @param sanitizerConfigId Sanitizer配置ID
 * @param example_config_id 示例配置ID
 * @returns 完整的shell执行命令字符串
 */
export function getSanitizerCommand(
  sanitizerConfigId: number,
  example_config_id: number,
) {
  try {
    // 使用 getCommandContext 获取上下文，保持一致性
    const {
      config: sanitizerConfig, operator, sourceCannCmd, cdCmd,
    } =
      getCommandContext(sanitizerConfigId);
    const exConfig = getConfigById(example_config_id) as unknown as ConfigRecord;

    // Sanitizer 需要算子信息来确定算子类型
    // 如果找不到算子记录，getCommandContext 会尝试使用项目路径（如果有脚本）
    // 对于 sanitizer，如果没有算子记录，我们假设它是非 ascend 类型
    // 因为 ascend 类型的算子通常需要算子记录才能正确执行
    const opType = operator ? operator.op_type : 'custom';

    if (opType !== 'ascend') {
      const mssanitizer = new Command('mssanitizer');

      // 添加目标文件
      if (exConfig?.target_file) {
        mssanitizer.addArgument(exConfig.target_file);
      }

      // 处理配置选项
      const options = (sanitizerConfig.user_options as Record<string, unknown> | null | undefined) || {};
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
        `./.vscode/mindstudio_sanitizer_log/mssanitizer_${new Date()
          .valueOf()}.log`,
      );

      return joinCommands(sourceCannCmd, cdCmd, mssanitizer.toString());
    }

    return '';
  }
  catch (e: unknown) {
    throw new Error(`生成异常检测命令失败: ${(e as Error).message}`);
  }
}
