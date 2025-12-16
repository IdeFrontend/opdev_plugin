import { getOpByProjectIdAndOpName } from './ops';
import { get_project_by_id } from './project';
import { getConfigById } from './configuration';
import { ascend_env_script, soc_version } from '../utils/ascend_util';
import { get_op_run_path } from '../utils/op_util';
import { parse_cmd_options } from '../utils/aicore_utils';

export function getBuildOpCommand(config_id: number) {
  const config = getConfigById(config_id as any) as any;
  if (!config) {
    throw new Error('配置不存在');
  }
  const project = get_project_by_id(config.project_id as number) as any;
  const operator = getOpByProjectIdAndOpName(config.project_id as number, config.op as string);
  const source_cann = project && project.ascend_env_script ? `. ${project.ascend_env_script}` : `. ${ascend_env_script}`;
  const deploy_cmd = `chmod +x ${config.target_file || ''} && ${config.target_file || ''}`;
  const run_path = operator ? get_op_run_path(operator).absolute() : process.cwd();
  const cd_cmd = `cd ${run_path}`;

  if (!operator || operator.op_type !== 'ascend') {
    const build_cmd = `${config.script || ''} ${config.custom_options || ''}`.trim();
    return [source_cann, cd_cmd, build_cmd, deploy_cmd].filter(Boolean).join(' && ');
  }

  try {
    let soc = soc_version;
    let vendor_name = 'custom';
    const op = config.op;
    const args = parse_cmd_options(config.custom_options || null);
    if (args && args.vendor_name) vendor_name = args.vendor_name;
    if (args && args.soc) soc = args.soc;
    const cmd = `${config.script || ''} --pkg --soc=${soc} --vendor_name=${vendor_name} --ops=${op}`.trim();
    return [source_cann, cd_cmd, cmd, deploy_cmd].filter(Boolean).join(' && ');
  } catch (e: any) {
    throw new Error(`生成编译命令失败:${e.message}`);
  }
}

export function getBuildExampleCommand(config_id: number) {
  const config = getConfigById(config_id as any) as any;
  if (!config) {
    throw new Error('配置不存在');
  }
  const project = get_project_by_id(config.project_id as number) as any;
  const operator = getOpByProjectIdAndOpName(config.project_id as number, config.op as string);
  const source_cann = project && project.ascend_env_script ? `. ${project.ascend_env_script}` : `. ${ascend_env_script}`;
  const run_path = operator ? get_op_run_path(operator).absolute() : process.cwd();
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
