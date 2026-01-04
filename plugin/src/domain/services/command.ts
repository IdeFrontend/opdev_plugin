import { getOpByProjectIdAndOpName } from './ops';
import { getProjectById } from 'plugin:/domain';
import { getConfigById } from './configuration';
import { soc_version } from '../utils/ascend_util';
import { parse_cmd_options } from '../utils/aicore_utils';
import { getOpRunPath } from '../utils/opUtil';
import {
  objectToCommandString,
  joinCommands,
  getExecutableCommand,
  getAdvanceCmd,
} from '../utils/command-utils';
import { ConfigRecord } from '../models/configModel';
import { ProjectRecord } from '../models/projectModel';
import { OpRecord } from '../models/model';
import { ProfilerFactory } from './profiler-service';

/**
 * 上下文接口，包含生成命令所需的基础信息
 */
interface CommandContext {
  config: ConfigRecord;
  project: ProjectRecord | null;
  operator: OpRecord;
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

  if (!operator) {
    throw new Error(`Operator not found: ${config.op}`);
  }

  const sourceCannCmd =
    project && project.ascend_env_script
      ? `. ${project.ascend_env_script}`
      : ``;

  const runPath = getOpRunPath(operator);
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
    const { config, operator, sourceCannCmd, cdCmd } =
      getCommandContext(config_id);
    const advance_cmd = getAdvanceCmd(config.user_options?.advance_param);

    if (!operator || operator.op_type !== 'ascend') {
      const build_cmd = joinCommands(
        config.script || '',
        config.custom_options || '',
        compileOption || '',
        advance_cmd,
      );

      return joinCommands(sourceCannCmd, cdCmd, build_cmd);
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

    const cmdArgs = objectToCommandString({
      pkg: true,
      soc,
      vendor_name,
      ops: op,
    });

    const cmd = joinCommands(
      config.script || '',
      cmdArgs,
      compileOption || '',
      advance_cmd,
    );

    const deploy_cmd = getExecutableCommand(config.target_file || '');

    return joinCommands(sourceCannCmd, cdCmd, cmd, deploy_cmd);
  } catch (e: any) {
    throw new Error(`生成编译命令失败:${e.message}`);
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
    const { config, sourceCannCmd, cdCmd } = getCommandContext(config_id);
    const run_cmd = getExecutableCommand(config.target_file || '');

    // 注意：原始代码中两个分支的返回值相同，这里保持简化的逻辑。
    return joinCommands(sourceCannCmd, cdCmd, run_cmd);
  } catch (e: any) {
    throw new Error(`生成运行命令失败:${e.message}`);
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
    const { config, operator, sourceCannCmd, cdCmd } =
      getCommandContext(config_id);
    const advance_cmd = getAdvanceCmd(config.user_options?.advance_param);

    if (!operator || operator.op_type !== 'ascend') {
      const cmd = joinCommands(
        config.script || '',
        config.custom_options || '',
        compileOption || '',
        advance_cmd,
      );

      return joinCommands(sourceCannCmd, cdCmd, cmd);
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

    const cmdArgs = objectToCommandString({
      run_example: true,
    });

    const cmd = joinCommands(
      config.script || '',
      cmdArgs,
      op,
      mode,
      pkg_mode,
      vendor_name,
      compileOption || '',
      advance_cmd,
    );

    return joinCommands(sourceCannCmd, cdCmd, cmd);
  } catch (e: any) {
    throw new Error(`生成编译命令失败:${e.message}`);
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
    const { config, operator, sourceCannCmd, cdCmd } =
      getCommandContext(config_id);
    const exConfig = getConfigById(
      example_config_id,
    ) as unknown as ConfigRecord;

    const simulatorCmd = ProfilerFactory.getStrategy('simulator').generate(
      config,
      operator,
      exConfig?.target_file,
    );

    return joinCommands(sourceCannCmd, cdCmd, simulatorCmd);
  } catch (e: any) {
    // 稍微规范化错误消息或保持原样
    throw new Error(`获取仿真命令失败 ${e.message}`);
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
    const { config, operator, sourceCannCmd, cdCmd } =
      getCommandContext(config_id);
    const exConfig = getConfigById(
      example_config_id,
    ) as unknown as ConfigRecord;

    const opprofCmd = ProfilerFactory.getStrategy('onboard').generate(
      config,
      operator,
      exConfig?.target_file,
    );

    return joinCommands(sourceCannCmd, cdCmd, opprofCmd);
  } catch (e: any) {
    throw new Error(`获取上板命令失败 ${e.message}`);
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
  // 使用相同的上下文模式，虽然变量名不同
  const sanitizerConfig = getConfigById(
    sanitizerConfigId,
  ) as unknown as ConfigRecord;
  const exConfig = getConfigById(example_config_id) as unknown as ConfigRecord;

  if (!sanitizerConfig) {
    throw new Error('配置不存在');
  }

  const project = getProjectById(sanitizerConfig.project_id);
  const operator = getOpByProjectIdAndOpName(
    sanitizerConfig.project_id,
    sanitizerConfig.op,
  );

  if (!operator) {
    throw new Error(`Operator not found: ${sanitizerConfig.op}`);
  }

  const sourceCannCmd =
    project && project.ascend_env_script
      ? `. ${project.ascend_env_script}`
      : ``;

  const runPath = getOpRunPath(operator);

  const cdCmd = `cd ${runPath}`;

  if (operator.op_type !== 'ascend') {
    const sanitizer_cmd =
      `mssanitizer ${exConfig?.target_file} ${handleSanitizerConfigToCmd(sanitizerConfig.user_options || {})}`.trim();

    return joinCommands(sourceCannCmd, cdCmd, sanitizer_cmd);
  }
}

// --- 辅助函数 ---

/**
 * 处理Sanitizer配置转换为命令行参数
 */
function handleSanitizerConfigToCmd(sanitizerConfig: any) {
  const tools = Object.keys(sanitizerConfig.tool || {}).filter(
    (key) => sanitizerConfig.tool[key],
  );

  const memcheckOptions: Record<string, string> = {};

  if (sanitizerConfig.tool?.memcheck) {
    Object.keys(sanitizerConfig.memcheckOption || {}).forEach((key) => {
      if (sanitizerConfig.memcheckOption[key]) {
        memcheckOptions[key] = 'yes';
      }
    });
  }

  return objectToCommandString({
    tool: tools,
    ...memcheckOptions,
    'log-level': sanitizerConfig.logLevel,
    'max-debuglog-size': sanitizerConfig.maxDebuglogSize,
    'block-id': sanitizerConfig.blockId,
    'log-file': `./.vscode/mindstudio_sanitizer_log/mssanitizer_${new Date().valueOf()}.log`,
  });
}
