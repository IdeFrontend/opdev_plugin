import * as vscode from 'vscode';
import path from 'path';
import fs from 'fs-extra';
import config from './config';
import * as projectModel from './project-model';
import * as configModel from './config-model';
import { OpGeneratorFactory } from '@plugin/domain/services/op-generator-factory';
import { getDefaultPath } from '@plugin/domain/utils/op-util';
import { soc_version } from '@plugin/domain/utils/ascend-util';
import {
  getDefaultDirectory,
  ensureLaunchJsonExists,
} from '@plugin/domain/utils/project-utils';

const getDataDir = () => {
  return path.join(config.user_data_dir, 'data');
};
const getOpsFile = () => path.join(getDataDir(), 'ops.json');

export type OpRecord = {
  id: number;
  task_id?: number | null;
  project_id: number;
  op_class?: string | null;
  op_name: string;
  op_type: string;
  op_path: string;
  ascend_env_script?: string | null;
  examples?: string | null;
  create_by?: string | null;
  create_time?: string;
  update_by?: string | null;
  update_time?: string;
  template_name?: string | null;
};

type OpsStore = {
  lastId: number;
  ops: OpRecord[];
};

/**
 * 检查根目录 build.sh 是否包含 --bisheng_flags
 * 用于修改标准自定义算子
 */
function checkBuildShHasBishengConfig(): boolean {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders || workspaceFolders.length === 0) {
    return false;
  }
  
  const workspacePath = workspaceFolders[0].uri.fsPath;
  const buildShPath = path.join(workspacePath, 'build.sh');
  if (!fs.existsSync(buildShPath)) return false;
  try {
    const content = fs.readFileSync(buildShPath, 'utf-8');
    return content.includes('--bisheng_flags');
  } catch {
    return false;
  }
}

function getNpuDebugScript(type: string, scriptPath: string): string {
  if (type === 'ascend') {
    if (checkBuildShHasBishengConfig()) {
      return `bash ${scriptPath} --pkg --soc={soc_version} --vendor_name=custom --bisheng_flags=ccec_O0,ccec_g`
    }
    return `bash ${scriptPath} --pkg --soc={soc_version} --vendor_name=custom --debug`
  }
  return `bash ${scriptPath} --debug`
}

function getCpuDebugScript(type: string, scriptPath: string): string {
  if (type === 'ascend') {
    if (checkBuildShHasBishengConfig()) {
      return `bash ${scriptPath} --pkg --soc={soc_version} --vendor_name=custom --bisheng_flags=ccec_g`
    }
    return `bash ${scriptPath} --pkg --soc={soc_version} --vendor_name=custom --simulator`
  }
  return `bash ${scriptPath} --simulator`
}

function getSimulateScript(type: string, scriptPath: string): string {
 if (type === 'ascend') {
    if (checkBuildShHasBishengConfig()) {
      return `bash ${scriptPath} --pkg --soc={soc_version} --vendor_name=custom --bisheng_flags=ccec_g`
    }
    return `bash ${scriptPath} --pkg --soc={soc_version} --vendor_name=custom --simulator Ascend910B3`
  }
  return `bash ${scriptPath} --simulator Ascend910B3`
}

function getOnBoardScript(type: string, scriptPath: string): string {
   if (type === 'ascend') {
    if (checkBuildShHasBishengConfig()) {
      return `bash ${scriptPath} --pkg --soc={soc_version} --vendor_name=custom --bisheng_flags=ccec_g`
    }
    return `bash ${scriptPath} --pkg --soc={soc_version} --vendor_name=custom --onboard`
  }
  return `bash ${scriptPath} --onboard`
}

function getExampleScript(type: string, scriptPath: string): string {
  if (type === 'ascend') {
    if (checkBuildShHasBishengConfig()) {
      return `bash ${scriptPath} --vendor_name=custom --run_example`
    }
    return `bash ${scriptPath} --vendor_name=custom --run_example`
  }
  return `bash ${scriptPath}`
}

async function createBuildOpConfig(
  project_id: number,
  record: OpRecord,
  opScriptPath: string,
  targetDir: string,
  targetFile: string
): Promise<void> {
  const buildOp = {
    project_id,
    user_options: {
      op: record.op_name,
      script: record.op_type === 'ascend' ? `bash ${opScriptPath} --pkg --soc={soc_version} --vendor_name=custom` : `bash ${opScriptPath}`,
      config_name: record.op_name,
      target_dir: targetDir,
      target_file: targetFile,
      cpu_debug_script: getCpuDebugScript(record.op_type, opScriptPath),
      npu_debug_script: getNpuDebugScript(record.op_type, opScriptPath)
    },
  };

  console.log('generateStructure: 开始创建 build_op 配置');
  console.log('generateStructure: build_op 配置数据:', JSON.stringify(buildOp, null, 2));
  const buildOpResult = await configModel.postConfig('build_op', [buildOp]);
  console.log('generateStructure: build_op 配置创建结果:', JSON.stringify(buildOpResult, null, 2));
}

async function createBuildExampleConfig(
  project_id: number,
  record: OpRecord,
  exampleScriptPath: string,
  targetDir: string,
  targetExampleFile: string
): Promise<void> {
  const buildExample = {
    project_id,
    user_options: {
      op: record.op_name,
      script: getExampleScript(record.op_type, exampleScriptPath),
      config_name: record.op_name,
      target_dir: targetDir,
      target_file: targetExampleFile,
      execution_mode: 'eager'
    },
  };

  console.log('generateStructure: 开始创建 build_example 配置');
  console.log('generateStructure: build_example 配置数据:', JSON.stringify(buildExample, null, 2));
  const buildExampleResult = await configModel.postConfig('build_example', [buildExample]);
  console.log('generateStructure: build_example 配置创建结果:', JSON.stringify(buildExampleResult, null, 2));
}

async function createUtTestConfig(
  project_id: number,
  record: OpRecord,
  opScriptPath: string,
  targetDir: string,
  targetExampleFile: string
): Promise<void> {
  const utTestCfg = {
    project_id,
    user_options: {
      op: record.op_name,
      script: record.op_type === 'ascend' ? `bash ${opScriptPath} --soc={soc_version} --ops={operatorNames} -u` : `bash ${opScriptPath} -u`,
      config_name: record.op_name,
      target_dir: targetDir,
      target_file: targetExampleFile
    },
  };

  console.log('generateStructure: 开始创建 ut_test 配置');
  console.log('generateStructure: ut_test 配置数据:', JSON.stringify(utTestCfg, null, 2));
  const utTestResult = await configModel.postConfig('ut_test', [utTestCfg]);
  console.log('generateStructure: ut_test 配置创建结果:', JSON.stringify(utTestResult, null, 2));
}

async function createSanitizerConfig(
  project_id: number,
  record: OpRecord,
  opScriptPath: string,
  targetFile: string
): Promise<void> {
  const sanitizerCfg = {
    project_id,
    user_options: {
      op: record.op_name,
      script: record.op_type === 'ascend' ? `bash ${opScriptPath} --pkg --soc={soc_version} --vendor_name=custom --mssanitizer` : `bash ${opScriptPath} --mssanitizer`,
       target_file: targetFile,
      config_name: record.op_name,
      tool: {
        memcheck: true,
        racecheck: false,
        initcheck: false,
        synccheck: false,
      },
      memcheckOption: {
        'check-unused-memory': false,
        'leak-check': false,
        'check-device-heap': false,
        'check-cann-heap': false,
      },
      logLevel: 'warn',
      maxDebuglogSize: 1024,
      useBlock: false,
      blockId: null,
      fileMapList: [],
    },
  };

  console.log('generateStructure: 开始创建 sanitizer 配置');
  console.log('generateStructure: sanitizer 配置数据:', JSON.stringify(sanitizerCfg, null, 2));
  const sanitizerResult = await configModel.postConfig('sanitizer', [sanitizerCfg]);
  console.log('generateStructure: sanitizer 配置创建结果:', JSON.stringify(sanitizerResult, null, 2));
}

async function createOnBoardConfig(
  project_id: number,
  record: OpRecord,
  opScriptPath: string
): Promise<void> {
  const onBoard = {
    project_id,
    user_options: {
      op: record.op_name,
      script: getOnBoardScript(record.op_type, opScriptPath),
      config_name: record.op_name,
      Occupancy: true,
      Roofline: true,
      Source: true,
      MemoryDetail: true,
      ArithmeticUtilization: true,
      L2Cache: true,
      Memory: true,
      MemoryL0: true,
      MemoryUB: true,
      PipeUtilization: true,
      ResourceConflictRatio: true,
      KernelScale: false,
      downloadToLocal: true,
      renderInPlatform: false,
      dataStoragePath: getDefaultDirectory(),
      advance_param: [],
      fileMapList: [],
    },
  };

  console.log('generateStructure: 开始创建 on_board 配置');
  console.log('generateStructure: on_board 配置数据:', JSON.stringify(onBoard, null, 2));
  const onBoardResult = await configModel.postConfig('on_board', [onBoard]);
  console.log('generateStructure: on_board 配置创建结果:', JSON.stringify(onBoardResult, null, 2));
}

async function createSimulateConfig(
  project_id: number,
  record: OpRecord,
  opScriptPath: string
): Promise<void> {
  const simulate = {
    project_id,
    user_options: {
      op: record.op_name,
      script: getSimulateScript(record.op_type, opScriptPath),
      config_name: record.op_name,
      soc_version: soc_version,
      ResourceConflictRatio: true,
      PMSampling: true,
      downloadToLocal: true,
      renderInPlatform: false,
      dataStoragePath: getDefaultDirectory(),
      simulatorType: 'Ascend910B3',
      enableDump: false,
      advance_param: [],
      fileMapList: [],
    },
  };

  console.log('generateStructure: 开始创建 simulate 配置');
  console.log('generateStructure: simulate 配置数据:', JSON.stringify(simulate, null, 2));
  const simulateResult = await configModel.postConfig('simulate', [simulate]);
  console.log('generateStructure: simulate 配置创建结果:', JSON.stringify(simulateResult, null, 2));
}

function ensureStore(): OpsStore {
  const dataDir = getDataDir();
  const opsFile = getOpsFile();

  fs.ensureDirSync(dataDir);

  if (!fs.existsSync(opsFile)) {
    const init: OpsStore = {
      lastId: 0,
      ops: [],
    };

    fs.writeFileSync(opsFile, JSON.stringify(init, null, 2), 'utf-8');

    return init;
  }

  try {
    const raw = fs.readFileSync(opsFile, 'utf-8');
    const parsed = JSON.parse(raw) as OpsStore;

    if (
      !parsed
      || typeof parsed.lastId !== 'number'
      || !Array.isArray(parsed.ops)
    ) {
      throw new Error('invalid ops store');
    }

    return parsed;
  }
  catch {
    const init: OpsStore = {
      lastId: 0,
      ops: [],
    };

    fs.writeFileSync(opsFile, JSON.stringify(init, null, 2), 'utf-8');

    return init;
  }
}

function writeStore(store: OpsStore) {
  fs.writeFileSync(getOpsFile(), JSON.stringify(store, null, 2), 'utf-8');
}

export function getOpByProjectIdAndOpName(
  project_id: number,
  op_name: string,
): OpRecord | null {
  const store = ensureStore();
  const found = store.ops.find((o) => o.project_id === project_id && o.op_name === op_name);

  return found || null;
}

/**
 * 获取项目下的所有算子
 * @param project_id 项目ID
 * @returns 算子列表
 */
export function getOpsByProjectId(project_id: number): OpRecord[] {
  const store = ensureStore();
  return store.ops.filter((o) => o.project_id === project_id);
}

export async function generateStructure(
  data: Partial<OpRecord>,
  extensionPath: string,
  isSkipUnZip: boolean = false,
  skipVscodeFiles: boolean = false
): Promise<number> {
  // 1) basic checks
  const project = projectModel.getProjectById(data.project_id as number);

  if (!project) {
    console.error('项目未找到，project_id:', data.project_id);
    throw Object.assign(new Error('project not found'), { name: 'InvalidRequest' });
  }

  console.log('generateStructure: 项目信息', {
    project_id: project.id,
    project_name: project.project_name,
    project_path: project.project_path,
  });

  // 2) prepare params for generator
  const params = {
    project_id: data.project_id,
    op_type: data.op_type,
    ops_prototype_file:
      (data as { ops_prototype_file?: string }).ops_prototype_file ?? null,
    op_name: data.op_name ?? null,
    template_name: (data as { template_name?: string }).template_name ?? null,
    soc_version: (data as { soc_version?: string }).soc_version ?? null,
    op_path: data.op_path ?? project.project_path,
    skipExisting: (data as { skipExisting?: boolean }).skipExisting ?? false,
  } as unknown;

  // 确保在算子工程目录创建 devtool_config.json
  // project.project_path 是算子工程完整路径（如 /path/to/project/operator_name）
  // op_path 也是算子工程路径，应该在这里创建 .vscode 目录
  const opPath = (params as { op_path: string }).op_path ?? project.project_path;

  console.log('generateStructure: 准备创建配置文件');
  console.log('generateStructure: 算子工程路径 (op_path):', opPath);
  console.log('generateStructure: project.project_path:', project.project_path);
  console.log('generateStructure: create_by:', data.create_by);
  console.log('generateStructure: skipVscodeFiles:', skipVscodeFiles);

  // 如果 skipVscodeFiles 为 true，跳过创建 .vscode 和 .arts 文件
  if (!skipVscodeFiles) {
    try {
      await ensureLaunchJsonExists(
        opPath,
        data.create_by,
      );
      console.log('generateStructure: 配置文件创建完成');
    }
    catch (error) {
      console.error('generateStructure: 配置文件创建失败:', error);
      // 配置文件创建失败不应该阻止算子创建，只记录错误
    }
  } else {
    console.log('generateStructure: 跳过创建 .vscode 和 .arts 文件');
  }

  // 3) get generator and parse meta
  const generator = OpGeneratorFactory.getGenerator(
    params as {
      project_id: number;
      op_type: string;
      ops_prototype_file: string;
      op_name: string;
      template_name: string;
      soc_version: string;
      op_path: string;
    },
    project,
    extensionPath,
  );
  const opName = generator.parseMeta();

  // 4) execute generation (filesystem work)
  if (!isSkipUnZip) {
    generator.executeGeneration();
  }

  // 5) persist store entry (update if exists, create if new)
  const store = ensureStore();
  const now = new Date()
    .toISOString();
  let record: OpRecord;
  let nextId: number;

  const existingOp = getOpByProjectIdAndOpName(project.id as number, opName);
  const index = existingOp ? store.ops.findIndex(op => op.id === existingOp.id) : -1;

  const templateName = (params as { template_name?: string }).template_name ?? null;

  if (existingOp && index !== -1) {
    // Update existing record
    store.ops[index] = {
      ...store.ops[index],
      task_id: data.task_id ?? store.ops[index].task_id,
      op_class: data.op_class ?? store.ops[index].op_class,
      op_type: data.op_type ?? store.ops[index].op_type,
      op_path: (params as { op_path: string }).op_path ?? store.ops[index].op_path,
      ascend_env_script: data.ascend_env_script ?? store.ops[index].ascend_env_script,
      examples: data.examples ?? store.ops[index].examples,
      template_name: templateName ?? store.ops[index].template_name,
      update_by: data.create_by ?? store.ops[index].update_by,
      update_time: now,
    };
    // Update the record variable to reference the updated record
    record = store.ops[index];
    nextId = record.id; // Use the existing record's ID
    writeStore(store);
  } else {
    // Create new record (both when existingOp is null and when index is -1)
    nextId = store.lastId + 1;
    record = {
      id: nextId,
      task_id: data.task_id ?? null,
      project_id: data.project_id as number,
      op_class: data.op_class ?? null,
      op_name: opName,
      op_type: data.op_type ?? 'ascend',
      op_path: (params as { op_path: string }).op_path ?? project.project_path,
      ascend_env_script: data.ascend_env_script ?? null,
      examples: data.examples ?? null,
      template_name: templateName,
      create_by: data.create_by ?? null,
      create_time: now,
      update_by: null,
      update_time: now,
    };

    store.ops.push(record);
    store.lastId = nextId;
    writeStore(store);
  }

  try {
    if (project) {
      console.log('generateStructure: 开始获取默认路径, record:', {
        op_name: record.op_name,
        op_type: record.op_type,
        op_path: record.op_path,
      });
      const {
        opScriptPath,
        exampleScriptPath,
        targetDir,
        targetOpFile,
        targetExampleFile,
      } = getDefaultPath(record);
      console.log('generateStructure: 默认路径获取成功:', {
        opScriptPath,
        exampleScriptPath,
        targetDir,
        targetOpFile,
        targetExampleFile,
      });
      // Build: 创建 build_op 和 build_example 两种配置
      // 如果是 torch_library_template 类型，设置 target_file 为 python ../run.py
      const targetFile = record.template_name === 'torch_library_template' 
        ? 'python ../run.py' 
        : targetOpFile;

      // 调用抽取的配置创建方法
      await createBuildOpConfig(project.id, record, opScriptPath, targetDir, targetFile);
      await createBuildExampleConfig(project.id, record, exampleScriptPath, targetDir, targetExampleFile);
      await createUtTestConfig(project.id, record, opScriptPath, targetDir, targetExampleFile);
      await createSanitizerConfig(project.id, record, opScriptPath, targetFile);
      await createOnBoardConfig(project.id, record, opScriptPath);
      await createSimulateConfig(project.id, record, opScriptPath);
    }
  }
  catch (e) {
    // 忽略配置创建错误，但打印日志以便调试
    console.error('generateStructure: failed to create default configs', e);
    if (e instanceof Error) {
      console.error('generateStructure: 错误详情:', e.message);
      console.error('generateStructure: 错误堆栈:', e.stack);
    }
    // 不抛出错误，让算子记录能够创建成功
  }

  return nextId;
}

export function _resetOpsForTest(): void {
  // helper for tests/dev: remove store
  fs.removeSync(getOpsFile());
}

/**
 * 检查指定config_type的配置是否存在，若不存在则初始化对应的配置
 * @param project_id 项目ID
 * @param config_type 配置类型
 * @param record 算子记录
 * @param opScriptPath 算子脚本路径
 * @param exampleScriptPath 示例脚本路径
 * @param targetDir 目标目录
 * @param targetFile 目标文件
 * @param targetExampleFile 目标示例文件
 */
export async function ensureConfigExists(
  project_id: number,
  config_type: string,
  record: OpRecord,
  opScriptPath: string,
  exampleScriptPath: string,
  targetDir: string,
  targetFile: string,
  targetExampleFile: string
): Promise<void> {
  // 检查配置是否存在
  const existingConfigs = configModel.getConfig(project_id, config_type, record.op_name);
  
  if (existingConfigs.length === 0) {
    console.log(`ensureConfigExists: 配置 ${config_type} 不存在，开始初始化`);
    
    // 根据不同的config_type初始化对应的配置
    switch (config_type) {
      case 'build_op':
        await createBuildOpConfig(project_id, record, opScriptPath, targetDir, targetFile);
        break;
      case 'build_example':
        await createBuildExampleConfig(project_id, record, exampleScriptPath, targetDir, targetExampleFile);
        break;
      case 'ut_test':
        await createUtTestConfig(project_id, record, opScriptPath, targetDir, targetExampleFile);
        break;
      case 'sanitizer':
        await createSanitizerConfig(project_id, record, opScriptPath, targetFile);
        break;
      case 'on_board':
        await createOnBoardConfig(project_id, record, opScriptPath);
        break;
      case 'simulate':
        await createSimulateConfig(project_id, record, opScriptPath);
        break;
      default:
        console.warn(`ensureConfigExists: 未知的配置类型 ${config_type}`);
        break;
    }
  } else {
    console.log(`ensureConfigExists: 配置 ${config_type} 已存在，跳过初始化`);
  }
}

/**
 * 补全项目的所有配置
 * @param project_id 项目ID
 */
export async function completeProjectConfigs(project_id: number): Promise<void> {
  try {
    console.log(`completeProjectConfigs: 开始补全项目 ${project_id} 的配置`);
    
    // 获取项目下的所有算子
    const ops = getOpsByProjectId(project_id);
    console.log(`completeProjectConfigs: 找到 ${ops.length} 个算子`);
    
    for (const op of ops) {
      console.log(`completeProjectConfigs: 为算子 ${op.op_name} 补全配置`);
      
      // 获取默认路径
      const {
        opScriptPath,
        exampleScriptPath,
        targetDir,
        targetOpFile,
        targetExampleFile,
      } = getDefaultPath(op);
      
      // 确定目标文件
      const targetFile = op.template_name === 'torch_library_template' 
        ? 'python ../run.py' 
        : targetOpFile;
      
      // 补全各种配置类型
      await ensureConfigExists(project_id, 'build_op', op, opScriptPath, exampleScriptPath, targetDir, targetFile, targetExampleFile);
      await ensureConfigExists(project_id, 'build_example', op, opScriptPath, exampleScriptPath, targetDir, targetFile, targetExampleFile);
      await ensureConfigExists(project_id, 'ut_test', op, opScriptPath, exampleScriptPath, targetDir, targetFile, targetExampleFile);
      await ensureConfigExists(project_id, 'sanitizer', op, opScriptPath, exampleScriptPath, targetDir, targetFile, targetExampleFile);
      await ensureConfigExists(project_id, 'on_board', op, opScriptPath, exampleScriptPath, targetDir, targetFile, targetExampleFile);
      await ensureConfigExists(project_id, 'simulate', op, opScriptPath, exampleScriptPath, targetDir, targetFile, targetExampleFile);
    }
    
    console.log(`completeProjectConfigs: 项目 ${project_id} 的配置补全完成`);
  } catch (error) {
    console.warn(`completeProjectConfigs: 补全配置失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}
