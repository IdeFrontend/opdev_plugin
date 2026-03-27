import * as vscode from 'vscode';
import path from 'path';
import fs from 'fs-extra';
import config from './config';
import * as projectModel from './project-model';
import * as configModel from './config-model';
import { OpGeneratorFactory } from '@plugin/domain/services/op-generator-factory';
import { getDefaultPath } from '@plugin/domain/utils/op-util';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
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

      // Resolve the workspace root for bisheng-flag detection (used by AscendPlugin).
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? opScriptPath;
      const scripts = OperatorPluginRegistry.getOpPlugin(record.op_type)
        .getInitialConfigScripts(record, workspaceRoot);

      // Build: 创建 build_op 和 build_example 两种配置
      // 如果是 torch_library_template 类型，设置 target_file 为 python ../run.py
      const targetFile = record.template_name === 'torch_library_template'
        ? 'python ../run.py'
        : targetOpFile;
      const buildOp = {
        project_id: project.id,
        user_options: {
          op: record.op_name,
          script: scripts.buildScript,
          config_name: record.op_name,
          target_dir: targetDir,
          target_file: targetFile,
          cpu_debug_script: scripts.cpuDebugScript,
          npu_debug_script: scripts.npuDebugScript,
        },
      };
      const buildExample = {
        project_id: project.id,
        user_options: {
          op:             record.op_name,
          script:         scripts.exampleScript,
          config_name:    record.op_name,
          target_dir:     targetDir,
          target_file:    targetExampleFile,
          execution_mode: 'eager',
        },
      };

      // UT测试: 创建一个基础 ut_test 配置
      const utTestCfg = {
        project_id: project.id,
        user_options: {
          op: record.op_name,
          script: record.op_type === 'ascend'
            ? `bash ${opScriptPath} --soc={soc_version} --ops={operatorNames} -u`
            : `bash ${opScriptPath} -u`,
          config_name: record.op_name,
          target_dir: targetDir,
          target_file: targetExampleFile,
        },
      };

      console.log('generateStructure: 开始创建 build_op 配置');
      console.log('generateStructure: build_op 配置数据:', JSON.stringify(buildOp, null, 2));
      const buildOpResult = await configModel.postConfig('build_op', [buildOp]);

      console.log('generateStructure: build_op 配置创建结果:', JSON.stringify(buildOpResult, null, 2));

      console.log('generateStructure: 开始创建 build_example 配置');
      console.log('generateStructure: build_example 配置数据:', JSON.stringify(buildExample, null, 2));
      const buildExampleResult = await configModel.postConfig('build_example', [buildExample]);

      console.log('generateStructure: build_example 配置创建结果:', JSON.stringify(buildExampleResult, null, 2));

      console.log('generateStructure: 开始创建 ut_test 配置');
      console.log('generateStructure: ut_test 配置数据:', JSON.stringify(utTestCfg, null, 2));
      const utTestResult = await configModel.postConfig('ut_test', [utTestCfg]);

      console.log('generateStructure: ut_test 配置创建结果:', JSON.stringify(utTestResult, null, 2));

      // Sanitizer: 创建一个基础 sanitizer 配置
      const sanitizerCfg = {
        project_id: project.id,
        user_options: {
          op: record.op_name,
          script: scripts.sanitizerScript,
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

      // Opprof: 创建 on_board 和 simulate 两种配置
      const onBoard = {
        project_id: project.id,
        user_options: {
          op:          record.op_name,
          script:      scripts.onBoardScript,
          config_name: record.op_name,
          // 内存分析图 相关
          // 核间负载分析图
          Occupancy: true,
          // Roofline瓶颈分析
          Roofline: true,

          // 算子代码热点图
          Source: true,
          // Cache热力图
          MemoryDetail: true,

          // 算子性能数据文件 相关
          // Cube及Vector类型指令耗时和占比
          ArithmeticUtilization: true,
          // L2 Cache命中率
          L2Cache: true,
          // 内存读写带宽速率
          Memory: true,
          // L0读写带宽速率
          MemoryL0: true,
          // UB读写带宽速率
          MemoryUB: true,
          // 算子基础信息
          // BasicInfo: false,
          // 计算单元和搬运单元耗时占比
          PipeUtilization: true,
          // 资源冲突占比
          ResourceConflictRatio: true,

          // 使能Kernel侧制定代码段性能采集
          KernelScale: false,
          downloadToLocal: true,
          renderInPlatform: false,
          dataStoragePath: getDefaultDirectory(),
          advance_param: [],
          fileMapList: [],
        },
      };
      const simulate = {
        project_id: project.id,
        user_options: {
          op:          record.op_name,
          script:      scripts.simulateScript,
          config_name: record.op_name,
          soc_version: soc_version,
          ResourceConflictRatio: true,
          PMSampling: true,
          downloadToLocal: true,
          renderInPlatform: false,
          // 数据存放位置默认值
          dataStoragePath: getDefaultDirectory(),
          simulatorType: 'Ascend910B3',
          enableDump: false,
          advance_param: [],
          fileMapList: [],
        },
      };

      console.log('generateStructure: 开始创建 on_board 配置');
      console.log('generateStructure: on_board 配置数据:', JSON.stringify(onBoard, null, 2));
      const onBoardResult = await configModel.postConfig('on_board', [onBoard]);

      console.log('generateStructure: on_board 配置创建结果:', JSON.stringify(onBoardResult, null, 2));

      console.log('generateStructure: 开始创建 simulate 配置');
      console.log('generateStructure: simulate 配置数据:', JSON.stringify(simulate, null, 2));
      const simulateResult = await configModel.postConfig('simulate', [simulate]);

      console.log('generateStructure: simulate 配置创建结果:', JSON.stringify(simulateResult, null, 2));
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
