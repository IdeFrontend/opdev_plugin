import { getOpByProjectIdAndOpName } from './ops';
import { getProjectById } from 'plugin:/domain';
import { getConfigById } from './configuration';
import { soc_version } from '../utils/ascend_util';
import { parse_cmd_options } from '../utils/aicore_utils';
import { getOpRunPath } from '../utils/opUtil';
import { objectToCommandString } from 'plugin:/domain';

/**
 * 上下文接口，包含生成命令所需的基础信息
 */
interface CommandContext {
  config: any;
  project: any;
  operator: any;
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
  const config = getConfigById(configId as any) as any;

  if (!config) {
    throw new Error('配置不存在');
  }

  const project = getProjectById(config.project_id as number) as any;
  // 注意：原始代码中使用了 '!' 断言，暗示 operator 应该存在。
  // 理想情况下应该优雅地处理 operator 为 null 的情况，但为了保持逻辑一致性，这里保留原样。
  const operator = getOpByProjectIdAndOpName(
    config.project_id as number,
    config.op as string,
  )!;

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
    const advance_cmd = getAdvanceCmd(config.user_options.advance_param);

    if (!operator || operator.op_type !== 'ascend') {
      const build_cmd = [
        config.script || '',
        config.custom_options || '',
        compileOption || '',
        advance_cmd,
      ]
        .filter(Boolean)
        .join(' ');

      return [sourceCannCmd, cdCmd, build_cmd].filter(Boolean).join(' && ');
    }

    let soc = soc_version;
    let vendor_name = 'custom';
    const op = config.op;
    const args = parse_cmd_options(config.custom_options || null);

    if (args && args.vendor_name) vendor_name = args.vendor_name;
    if (args && args.soc) soc = args.soc;

    const cmdArgs = objectToCommandString({
      pkg: true,
      soc,
      vendor_name,
      ops: op,
    });

    const cmd = [config.script || '', cmdArgs, compileOption || '', advance_cmd]
      .filter(Boolean)
      .join(' ');

    const deploy_cmd = `chmod +x ${config.target_file || ''} && ${config.target_file || ''}`;

    return [sourceCannCmd, cdCmd, cmd, deploy_cmd].filter(Boolean).join(' && ');
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
    const { config, operator, sourceCannCmd, cdCmd } =
      getCommandContext(config_id);
    const run_cmd = `chmod +x ${config.target_file || ''} && ${config.target_file || ''}`;

    // 注意：原始代码中两个分支的返回值相同，这里保持简化的逻辑。
    // 'ascend' 类型的参数解析逻辑虽然存在，但在结果生成中未使用。
    // 为了保持简单，我们保留原有的返回值。

    return [sourceCannCmd, cdCmd, run_cmd].filter(Boolean).join(' && ');
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
    const advance_cmd = getAdvanceCmd(config.user_options.advance_param);

    if (!operator || operator.op_type !== 'ascend') {
      const cmd = [
        config.script || '',
        config.custom_options || '',
        compileOption || '',
        advance_cmd,
      ]
        .filter(Boolean)
        .join(' ');

      return [sourceCannCmd, cdCmd, cmd].filter(Boolean).join(' && ');
    }

    let vendor_name = 'custom';
    let pkg_mode = 'cust';
    let mode = 'eager';
    const op = config.op;
    const args = parse_cmd_options(config.custom_options || null);

    if (args && args.vendor_name) vendor_name = args.vendor_name;
    if (args && args.pkg_mode) pkg_mode = args.pkg_mode;
    if (args && args.mode) mode = args.mode;

    const cmdArgs = objectToCommandString({
      run_example: true,
    });

    const cmd = [
      config.script || '',
      cmdArgs,
      op,
      mode,
      pkg_mode,
      vendor_name,
      compileOption || '',
      advance_cmd,
    ]
      .filter(Boolean)
      .join(' ');

    return [sourceCannCmd, cdCmd, cmd].filter(Boolean).join(' && ');
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
    const exConfig = getConfigById(example_config_id as any) as any;

    if (!exConfig) {
      // 虽然原始代码在使用 exConfig 前没有显式检查，但这样做更安全。
      // 这里主要遵循原始流程。
    }

    const aic = `--aic-metrics=PipeUtilization${config.user_options.ResourceConflictRatio ? ',ResourceConflictRatio' : ''}${config.user_options.PMSampling ? ',PMSampling' : ''}`;
    const advance_cmd = getAdvanceCmd(config.user_options.advance_param);

    const cmdArgs = objectToCommandString({
      'soc-version': config.user_options.simulatorType,
      output: `${operator.op_path}/.vscode/opprof`,
    });

    const simulatorCmd = `msprof op simulator ${cmdArgs} ${aic} ${advance_cmd} ${exConfig.target_file}`;

    return [sourceCannCmd, cdCmd, simulatorCmd].filter(Boolean).join(' && ');
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
    const exConfig = getConfigById(example_config_id as any) as any;

    const aic = getOnBoardAic(config.user_options);
    const advance_cmd = getAdvanceCmd(config.user_options.advance_param);

    const cmdArgs = objectToCommandString({
      output: `${operator.op_path}/.vscode/opprof`,
    });

    const opprofCmd = `msprof op ${cmdArgs} ${aic} ${advance_cmd} ${exConfig.target_file}`;

    return [sourceCannCmd, cdCmd, opprofCmd].filter(Boolean).join(' && ');
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
  const sanitizerConfig = getConfigById(sanitizerConfigId as any) as any;
  const exConfig = getConfigById(example_config_id as any) as any;

  if (!sanitizerConfig) {
    throw new Error('配置不存在');
  }

  const project = getProjectById(sanitizerConfig.project_id as number) as any;
  const operator = getOpByProjectIdAndOpName(
    sanitizerConfig.project_id as number,
    sanitizerConfig.op as string,
  )!;

  const sourceCannCmd =
    project && project.ascend_env_script
      ? `. ${project.ascend_env_script}`
      : ``;

  const runPath = getOpRunPath(operator);
  const cdCmd = `cd ${runPath}`;

  if (!operator || operator.op_type !== 'ascend') {
    const sanitizer_cmd =
      `mssanitizer ${exConfig.target_file} ${handleSanitizerConfigToCmd(sanitizerConfig?.user_options || {})}`.trim();

    return [sourceCannCmd, cdCmd, sanitizer_cmd].filter(Boolean).join(' && ');
  }
  // 原始代码如果 operator 是 'ascend' 则返回 undefined？
  // 原始代码第 297 行是 `if (!operator || operator.op_type !== 'ascend')`
  // 看起来 sanitizer 不适用于 'ascend' 类型，或者逻辑不完整。
  // 保留原始行为（如果不处理则隐含返回 void/undefined）。
}

// --- 辅助函数 ---

/**
 * 上板图形参数额外处理
 */
function getOnBoardAic(obj: any) {
  const basicMetrics = [
    'Occupancy',
    'Roofline',
    'Source',
    'MemoryDetail',
    'KernelScale',
  ];

  const result: string[] = basicMetrics.filter((k) => obj[k]);

  if (result.includes('Roofline') || result.includes('MemoryDetail')) {
    result.push('Default');
  } else {
    const extendedMetrics = [
      'ArithmeticUtilization',
      'L2Cache',
      'Memory',
      'MemoryL0',
      'MemoryUB',
      'PipeUtilization',
      'ResourceConflictRatio',
    ];

    extendedMetrics.forEach((k) => {
      if (obj[k]) result.push(k);
    });
  }

  return result.length ? `--aic-metrics=${result.join(',')}` : '';
}

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

/**
 * 处理高级参数
 */
function getAdvanceCmd(advance_param: any) {
  if (!Array.isArray(advance_param) || !advance_param.length) {
    return '';
  }

  return advance_param
    .filter((item: any) => item.name)
    .map((item: any) => `--${item.name}${item.value ? `=${item.value}` : ''}`)
    .join(' ');
}
