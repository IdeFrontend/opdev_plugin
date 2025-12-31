import path from 'path';
import fs from 'fs-extra';
import config from './config';
import * as projectModel from './projectModel';
import * as configModel from './configModel';
import { OpGeneratorFactory } from '../services/opGeneratorFactory';
import { getDefaultPath } from '../utils/opUtil';
import { soc_version } from '../utils/ascend_util';
import {getDefaultDirectory, ensureLaunchJsonExists} from '../utils/projectUtils'

const getDataDir = () => path.join((config as any).workspace_data_dir, 'data');
const getOpsFile = () => path.join(getDataDir(), 'ops.json');

type OpRecord = {
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
    const init: OpsStore = { lastId: 0, ops: [] };
    fs.writeFileSync(opsFile, JSON.stringify(init, null, 2), 'utf-8');
    return init;
  }

  try {
    const raw = fs.readFileSync(opsFile, 'utf-8');
    const parsed = JSON.parse(raw) as OpsStore;
    if (!parsed || typeof parsed.lastId !== 'number' || !Array.isArray(parsed.ops)) {
      throw new Error('invalid ops store');
    }
    return parsed;
  } catch (e) {
    const init: OpsStore = { lastId: 0, ops: [] };
    fs.writeFileSync(opsFile, JSON.stringify(init, null, 2), 'utf-8');
    return init;
  }
}

function writeStore(store: OpsStore) {
  fs.writeFileSync(getOpsFile(), JSON.stringify(store, null, 2), 'utf-8');
}

export function getOpByProjectIdAndOpName(project_id: number, op_name: string): OpRecord | null {
  const store = ensureStore();
  const found = store.ops.find((o) => o.project_id === project_id && o.op_name === op_name);
  return found || null;
}

export function generateStructure(data: Partial<OpRecord>, extensionPath: string): number {
  // 1) basic checks
  const project = projectModel.get_project_by_id(data.project_id as any);
  if (!project) throw Object.assign(new Error('project not found'), { name: 'InvalidRequest' });

  // 2) prepare params for generator
  const params = {
    project_id: data.project_id,
    op_type: data.op_type,
    ops_prototype_file: (data as any).ops_prototype_file ?? null,
    op_name: data.op_name ?? null,
    template_name: (data as any).template_name ?? null,
    soc_version: (data as any).soc_version ?? null,
    op_path: data.op_path ?? project.project_path,
  } as any;
  ensureLaunchJsonExists(params.op_path, data.create_by);

  // 3) get generator and parse meta
  const generator = OpGeneratorFactory.getGenerator(params, project, extensionPath);
  const opName = generator.parseMeta();

  // 4) check duplicate
  if (getOpByProjectIdAndOpName(project.id as number, opName)) {
    throw Object.assign(new Error('op name exists'), { name: 'InvalidRequest' });
  }

  // 5) execute generation (filesystem work)
  generator.executeGeneration();

  // 6) persist store entry
  const store = ensureStore();
  const now = new Date().toISOString();
  const nextId = store.lastId + 1;
  const record: OpRecord = {
    id: nextId,
    task_id: data.task_id ?? null,
    project_id: data.project_id as number,
    op_class: data.op_class ?? null,
    op_name: opName,
    op_type: data.op_type ?? 'ascend',
    op_path: params.op_path ?? project.project_path,
    ascend_env_script: data.ascend_env_script ?? null,
    examples: data.examples ?? null,
    create_by: data.create_by ?? null,
    create_time: now,
    update_by: null,
    update_time: now,
  };
  store.ops.push(record);
  store.lastId = nextId;
  writeStore(store);

  try {
    if (project) {
      const { opScriptPath, exampleScriptPath, targetDir, targetOpFile, targetExampleFile } = getDefaultPath(record);
      // Build: 创建 build_op 和 build_example 两种配置
      const buildOp = {
        project_id: project.id,
        user_options: {
          op: record.op_name,
          script: `bash ${opScriptPath}`,
          config_name: record.op_name,
          target_dir: targetDir,
          target_file: targetOpFile,
        },
      };
      const buildExample = {
        project_id: project.id,
        user_options: {
          op: record.op_name,
          script: `bash ${exampleScriptPath}`,
          config_name: record.op_name,
          target_dir: targetDir,
          target_file: targetExampleFile,
        },
      };
      // 调用 postConfig，不 await（保持同步签名兼容），若需确保完成可改为 async/await
      void configModel.postConfig('build_op', [buildOp]);
      void configModel.postConfig('build_example', [buildExample]);

      // Sanitizer: 创建一个基础 sanitizer 配置
      const sanitizerCfg = {
        project_id: project.id,
        user_options: {
          op: record.op_name,
          script: `bash ${record.op_name}.sh`,
          config_name: record.op_name,
          tool: { memcheck: true, racecheck: false, initcheck: false, synccheck: false }, // 检测内容
          memcheckOption: { 'check-unused-memory': false, 'leak-check': false, 'check-device-heap': false, 'check-cann-heap': false }, // 内存检测可选项
          logLevel: 'warn', // 报告输出等级
          maxDebuglogSize: 1024, // 输入日志单个文件大小上限 1 - 10240
          useBlock: false,
          blockId: null, // 单block检测的blockId，0 - 200
        }
      };
      void configModel.postConfig('sanitizer', [sanitizerCfg]);

      // Opprof: 创建 on_board 和 simulate 两种配置
      const onBoard = {
        project_id: project.id,
        user_options: {
          op: record.op_name,
          script: 'msprof op',
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
          advance_param: []
        },
      };
      const simulate = {
        project_id: project.id,
        user_options: {
          op: record.op_name,
          script: 'msprof op simulator',
          config_name: record.op_name,
          soc_version: soc_version,
          ResourceConflictRatio: true,
          PMSampling: true,
          downloadToLocal: true,
          renderInPlatform: false,
          // 数据存放位置默认值
          dataStoragePath: getDefaultDirectory(),
          simulatorType: 'Ascend910B1',
          enableDump: false,
          advance_param: []
        },
      };
      void configModel.postConfig('on_board', [onBoard]);
      void configModel.postConfig('simulate', [simulate]);
    }
  } catch (e) {
    // 忽略配置创建错误，但打印日志以便调试
    // eslint-disable-next-line no-console
    console.error('generateStructure: failed to create default configs', e);
  }

  return nextId;
}

export function _resetOpsForTest(): void {
  // helper for tests/dev: remove store
  fs.removeSync(getOpsFile());
}
