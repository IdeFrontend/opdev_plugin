import { getOpByProjectIdAndOpName } from './ops';
import { get_project_by_id } from './project';
import { getConfigById } from './configuration';
import { ascend_env_script, soc_version } from '../utils/ascend_util';
import { parse_cmd_options } from '../utils/aicore_utils';
import { getOpRunPath } from '../utils/opUtil';

export function getBuildOpCommand(config_id: number) {
  const config = getConfigById(config_id as any) as any;
  if (!config) {
    throw new Error('配置不存在');
  }
  const project = get_project_by_id(config.project_id as number) as any;
  const operator = getOpByProjectIdAndOpName(config.project_id as number, config.op as string)!;
  const source_cann = project && project.ascend_env_script ? `. ${project.ascend_env_script}` : `. ${ascend_env_script}`;

  const run_path = getOpRunPath(operator);
  const cd_cmd = `cd ${run_path}`;

  if (!operator || operator.op_type !== 'ascend') {
    const build_cmd = `${config.script || ''} ${config.custom_options || ''}`.trim();
    return [source_cann, cd_cmd, build_cmd].filter(Boolean).join(' && ');
  }

  try {
    let soc = soc_version;
    let vendor_name = 'custom';
    const op = config.op;
    const args = parse_cmd_options(config.custom_options || null);
    if (args && args.vendor_name) vendor_name = args.vendor_name;
    if (args && args.soc) soc = args.soc;
    const cmd = `${config.script || ''} --pkg --soc=${soc} --vendor_name=${vendor_name} --ops=${op}`.trim();
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
  const operator = getOpByProjectIdAndOpName(config.project_id as number, config.op as string)!;
  const source_cann = project && project.ascend_env_script ? `. ${project.ascend_env_script}` : `. ${ascend_env_script}`;
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

export function getBuildExampleCommand(config_id: number) {
  const config = getConfigById(config_id as any) as any;
  if (!config) {
    throw new Error('配置不存在');
  }
  const project = get_project_by_id(config.project_id as number) as any;
  const operator = getOpByProjectIdAndOpName(config.project_id as number, config.op as string)!;
  const source_cann = project && project.ascend_env_script ? `. ${project.ascend_env_script}` : `. ${ascend_env_script}`;
  const run_path = getOpRunPath(operator);
  const cd_cmd = `cd ${run_path}`;

  if (!operator || operator.op_type !== 'ascend') {
    const cmd = `${config.script || ''} ${config.custom_options || ''}`.trim();
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
    const cmd = `${config.script || ''} --run_example ${op} ${mode} ${pkg_mode} ${vendor_name}`.trim();
    return [source_cann, cd_cmd, cmd].filter(Boolean).join(' && ');
  } catch (e: any) {
    throw new Error(`生成编译命令失败:${e.message}`);
  }
}

// 生成仿真命令
// msprof op --output=$home/projects/output $home/projects/MyApp/out/main blockdim 1 // --output为可选参数，$home/projects/MyApp/out/main为使用的app，blockdim 1为用户app的可选参数 
// msprof op simulator --soc-version=Ascendxxxyy --output=/home/projects/output /home/projects/MyApp/out/main blockdim 1   // --output为可选参数,/home/projects/MyApp/out/main为使用的app,blockdim 1为用户app的可选参数，xxxyy为用户实际使用的具体芯片类型
export function getSimulateCommand(config_id: number, example_config_id: number) {
  const config = getConfigById(config_id as any) as any;
  const exConfig = getConfigById(example_config_id as any) as any;
  console.log('命令函数', config, exConfig)
  if (!config) {
    throw new Error('配置不存在');
  }
  const operator = getOpByProjectIdAndOpName(config.project_id as number, config.op as string)!;
  console.log('command operator', operator)

  const project = get_project_by_id(config.project_id as number) as any;
  const source_cann = project && project.ascend_env_script ? `. ${project.ascend_env_script}` : `. ${ascend_env_script}`;
  const run_path = getOpRunPath(operator);
  const cd_cmd = `cd ${run_path}`;

  const aic = `--aic-metrics=PipeUtilization,ResourceConflictRatio${config.user_options.PMSampling?',PMSampling':''}`
  const dump = config.user_options.enableDump ? '--dump' : ''
  const simulatorCmd =  `msopprof simulator --soc-version=${config.user_options.simulatorType} --output=${operator.op_path}/.vscode/opprof ${exConfig.target_file} ${aic} ${dump}`

  return [source_cann, cd_cmd, simulatorCmd].filter(Boolean).join(' && ')
}

// 生成上板命令
export function getOnBoardCommand(config_id: number, example_config_id: number) {
  const config = getConfigById(config_id as any) as any;
  const exConfig = getConfigById(example_config_id as any) as any;
  console.log('命令函数', config, exConfig)
  if (!config) {
    throw new Error('配置不存在');
  }

  const operator = getOpByProjectIdAndOpName(config.project_id as number, config.op as string)!;
  console.log('command operator', operator)

  const project = get_project_by_id(config.project_id as number) as any;
  const source_cann = project && project.ascend_env_script ? `. ${project.ascend_env_script}` : `. ${ascend_env_script}`;
  const run_path = getOpRunPath(operator);
  const cd_cmd = `cd ${run_path}`;

  const totalKeys = ['Occupancy', 'Roofline', 'Source', 'MemoryDetail', 'ArithmeticUtilization', 'L2Cache', 'Memory', 'MemoryL0', 'MemoryUB', 'OpBasicInfo', 'PipeUtilization', 'ResourceConflictRatio', 'KernelScale']
  let aic = '--aic-metrics='
  totalKeys.forEach(key => {
    if (config.user_options[key]) {
      aic += `${key},`
    }
  })
  aic = aic.slice(0, -1)
  const opprofCmd  = `msopprof --output=${operator.op_path}/.vscode/opprof ${exConfig.target_file} ${aic}`

  return [source_cann, cd_cmd, opprofCmd].filter(Boolean).join(' && ')
}
