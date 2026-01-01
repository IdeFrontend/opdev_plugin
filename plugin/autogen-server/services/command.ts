import { getOpByProjectIdAndOpName } from './ops';
import { get_project_by_id } from './project';
import { getConfigById } from './configuration';
import { ascend_env_script, soc_version } from '../utils/ascend_util';
import { parse_cmd_options } from '../utils/aicore_utils';
import { getOpRunPath } from '../utils/opUtil';

/**
 *
 * @param config_id
 * @param compileOption 编译参数 --debug: debug模式 ；  --mssanitizer: 异常检测模式
 * @returns any
 */
export function getBuildOpCommand(config_id: number, compileOption?: string) {
  const config = getConfigById(config_id as any) as any;

  if (!config) {
    throw new Error('配置不存在');
  }
  const project = get_project_by_id(config.project_id as number) as any;
  const operator = getOpByProjectIdAndOpName(
    config.project_id as number,
    config.op as string,
  )!;
  const source_cann =
    project && project.ascend_env_script
      ? `. ${project.ascend_env_script}`
      : ``;

  const run_path = getOpRunPath(operator);
  const cd_cmd = `cd ${run_path}`;

  const advance_cmd = getAdvanceCmd(config.user_options.advance_param);

  if (!operator || operator.op_type !== 'ascend') {
    const build_cmd =
      `${config.script || ''} ${config.custom_options || ''} ${compileOption ? compileOption : ''} ${advance_cmd}`.trim();

    return [source_cann, cd_cmd, build_cmd].filter(Boolean).join(' && ');
  }

  try {
    let soc = soc_version;
    let vendor_name = 'custom';
    const op = config.op;
    const args = parse_cmd_options(config.custom_options || null);

    if (args && args.vendor_name) vendor_name = args.vendor_name;
    if (args && args.soc) soc = args.soc;
    const cmd =
      `${config.script || ''} --pkg --soc=${soc} --vendor_name=${vendor_name} --ops=${op} ${compileOption ? compileOption : ''} ${advance_cmd}`.trim();
    const deploy_cmd = `chmod +x ${config.target_file || ''} && ${config.target_file || ''}`;

    return [source_cann, cd_cmd, cmd, deploy_cmd].filter(Boolean).join(' && ');
  } catch (e: any) {
    throw new Error(`生成编译命令失败:${e.message}`);
  }
}

export function getRunCommand(config_id: number) {
  const config = getConfigById(config_id as any) as any;

  if (!config) {
    throw new Error('配置不存在');
  }
  const project = get_project_by_id(config.project_id as number) as any;
  const operator = getOpByProjectIdAndOpName(
    config.project_id as number,
    config.op as string,
  )!;
  const source_cann =
    project && project.ascend_env_script
      ? `. ${project.ascend_env_script}`
      : ``;
  const run_cmd = `chmod +x ${config.target_file || ''} && ${config.target_file || ''}`;
  const run_path = getOpRunPath(operator);
  const cd_cmd = `cd ${run_path}`;

  if (!operator || operator.op_type !== 'ascend') {
    return [source_cann, cd_cmd, run_cmd].filter(Boolean).join(' && ');
  }

  try {
    let soc = soc_version;
    let vendor_name = 'custom';
    const op = config.op;
    const args = parse_cmd_options(config.custom_options || null);

    if (args && args.vendor_name) vendor_name = args.vendor_name;
    if (args && args.soc) soc = args.soc;

    return [source_cann, cd_cmd, run_cmd].filter(Boolean).join(' && ');
  } catch (e: any) {
    throw new Error(`生成运行命令失败:${e.message}`);
  }
}

export function getBuildExampleCommand(
  config_id: number,
  compileOption?: string,
) {
  const config = getConfigById(config_id as any) as any;

  if (!config) {
    throw new Error('配置不存在');
  }
  const project = get_project_by_id(config.project_id as number) as any;
  const operator = getOpByProjectIdAndOpName(
    config.project_id as number,
    config.op as string,
  )!;
  const source_cann =
    project && project.ascend_env_script
      ? `. ${project.ascend_env_script}`
      : ``;
  const run_path = getOpRunPath(operator);
  const cd_cmd = `cd ${run_path}`;

  const advance_cmd = getAdvanceCmd(config.user_options.advance_param);

  if (!operator || operator.op_type !== 'ascend') {
    const cmd =
      `${config.script || ''} ${config.custom_options || ''} ${compileOption ? compileOption : ''} ${advance_cmd}`.trim();

    return [source_cann, cd_cmd, cmd].filter(Boolean).join(' && ');
  }

  try {
    let vendor_name = 'custom';
    let pkg_mode = 'cust';
    let mode = 'eager';
    const op = config.op;
    const args = parse_cmd_options(config.custom_options || null);

    if (args && args.vendor_name) vendor_name = args.vendor_name;
    if (args && args.pkg_mode) pkg_mode = args.pkg_mode;
    if (args && args.mode) mode = args.mode;
    const cmd =
      `${config.script || ''} --run_example ${op} ${mode} ${pkg_mode} ${vendor_name} ${compileOption ? compileOption : ''} ${advance_cmd}`.trim();

    return [source_cann, cd_cmd, cmd].filter(Boolean).join(' && ');
  } catch (e: any) {
    throw new Error(`生成编译命令失败:${e.message}`);
  }
}

// 生成仿真命令
// msprof op --output=$home/projects/output $home/projects/MyApp/out/main blockdim 1 // --output为可选参数，$home/projects/MyApp/out/main为使用的app，blockdim 1为用户app的可选参数
// msprof op simulator --soc-version=Ascendxxxyy --output=/home/projects/output /home/projects/MyApp/out/main blockdim 1   // --output为可选参数,/home/projects/MyApp/out/main为使用的app,blockdim 1为用户app的可选参数，xxxyy为用户实际使用的具体芯片类型
export function getSimulateCommand(
  config_id: number,
  example_config_id: number,
) {
  const config = getConfigById(config_id as any) as any;
  const exConfig = getConfigById(example_config_id as any) as any;

  console.log('命令函数', config, exConfig);
  if (!config) {
    throw new Error('配置不存在');
  }

  const operator = getOpByProjectIdAndOpName(
    config.project_id as number,
    config.op as string,
  )!;
  const project = get_project_by_id(config.project_id as number) as any;
  const source_cann =
    project && project.ascend_env_script
      ? `. ${project.ascend_env_script}`
      : ``;
  const run_path = getOpRunPath(operator);
  const cd_cmd = `cd ${run_path}`;

  const aic = `--aic-metrics=PipeUtilization${config.user_options.ResourceConflictRatio ? ',ResourceConflictRatio' : ''}${config.user_options.PMSampling ? ',PMSampling' : ''}`;
  const advance_cmd = getAdvanceCmd(config.user_options.advance_param);
  const simulatorCmd = `msprof op simulator --soc-version=${config.user_options.simulatorType} --output=${operator.op_path}/.vscode/opprof ${aic} ${advance_cmd} ${exConfig.target_file}`;

  return [source_cann, cd_cmd, simulatorCmd].filter(Boolean).join(' && ');
}

// 生成上板命令
export function getOnBoardCommand(
  config_id: number,
  example_config_id: number,
) {
  const config = getConfigById(config_id as any) as any;
  const exConfig = getConfigById(example_config_id as any) as any;

  console.log('命令函数', config, exConfig);
  if (!config) {
    throw new Error('配置不存在');
  }

  const operator = getOpByProjectIdAndOpName(
    config.project_id as number,
    config.op as string,
  )!;
  const project = get_project_by_id(config.project_id as number) as any;
  const source_cann =
    project && project.ascend_env_script
      ? `. ${project.ascend_env_script}`
      : ``;
  const run_path = getOpRunPath(operator);
  const cd_cmd = `cd ${run_path}`;

  const aic = getOnBoardAic(config.user_options);
  const advance_cmd = getAdvanceCmd(config.user_options.advance_param);
  const opprofCmd = `msprof op --output=${operator.op_path}/.vscode/opprof ${aic} ${advance_cmd} ${exConfig.target_file}`;

  return [source_cann, cd_cmd, opprofCmd].filter(Boolean).join(' && ');
}

// 上板图形参数额外处理
function getOnBoardAic(obj: any) {
  const array = [
    'Occupancy',
    'Roofline',
    'Source',
    'MemoryDetail',
    'KernelScale',
  ];
  const result: string[] = [];

  array.forEach((k) => {
    if (obj[k]) {
      result.push(k);
    }
  });
  if (result.includes('Roofline') || result.includes('MemoryDetail')) {
    result.push('Default');
  } else {
    const list = [
      'ArithmeticUtilization',
      'L2Cache',
      'Memory',
      'MemoryL0',
      'MemoryUB',
      'PipeUtilization',
      'ResourceConflictRatio',
    ];

    list.forEach((k) => {
      if (obj[k]) {
        result.push(k);
      }
    });
  }

  return result.length ? `--aic-metrics=${result.join(',')}` : '';
}

export function getSanitizerCommand(
  sanitizerConfigId: number,
  example_config_id: number,
) {
  const sanitizerConfig = getConfigById(sanitizerConfigId as any) as any;
  const exConfig = getConfigById(example_config_id as any) as any;

  if (!sanitizerConfig) {
    throw new Error('配置不存在');
  }
  const project = get_project_by_id(
    sanitizerConfig.project_id as number,
  ) as any;
  const operator = getOpByProjectIdAndOpName(
    sanitizerConfig.project_id as number,
    sanitizerConfig.op as string,
  )!;
  const source_cann =
    project && project.ascend_env_script
      ? `. ${project.ascend_env_script}`
      : ``;

  const run_path = getOpRunPath(operator);
  const cd_cmd = `cd ${run_path}`;

  if (!operator || operator.op_type !== 'ascend') {
    const sanitizer_cmd =
      `mssanitizer ${exConfig.target_file} ${handleSanitizerConfigToCmd(sanitizerConfig?.user_options || {})}`.trim();

    return [source_cann, cd_cmd, sanitizer_cmd].filter(Boolean).join(' && ');
  }
}

function handleSanitizerConfigToCmd(sanitizerConfig: any) {
  return [
    Object.keys(sanitizerConfig.tool || {})
      .filter((key) => sanitizerConfig.tool[key])
      .map((key) => `--tool=${key}`)
      .join(' '), // 检测内容
    sanitizerConfig.tool?.memcheck
      ? Object.keys(sanitizerConfig.memcheckOption || {})
          .filter((key) => sanitizerConfig.memcheckOption[key])
          .map((key) => `--${key}=yes`)
          .join(' ')
      : '', // 内存检测可选项
    sanitizerConfig.logLevel ? `--log-level=${sanitizerConfig.logLevel}` : '', // 报告输出等级
    sanitizerConfig.maxDebuglogSize
      ? `--max-debuglog-size=${sanitizerConfig.maxDebuglogSize}`
      : '', // 输入日志单个文件大小上限 1 - 10240
    sanitizerConfig.blockId ? `--block-id=${sanitizerConfig.blockId}` : '', // 单block检测的blockId 0 - 200
    `--log-file=./.vscode/mindstudio_sanitizer_log/mssanitizer_${new Date().valueOf()}.log`,
  ]
    .filter((item) => item)
    .join(' ');
}

// 处理高级参数
function getAdvanceCmd(advance_param: any) {
  let advanceStr = '';

  if (Array.isArray(advance_param) && advance_param.length) {
    advanceStr = advance_param
      .filter((item: any) => item.name)
      .map((item: any) => `--${item.name}${item.value ? `=${item.value}` : ''}`)
      .join(' ');
  }

  return advanceStr;
}
