import * as vscode from 'vscode';
import path from 'path';
import fs from 'fs-extra';
import config from './config';
import * as projectModel from './project-model';
import * as configModel from './config-model';
import { filterOutProjectId } from '@plugin/domain/utils/filter-by-project-id';
import { OpGeneratorFactory } from '@plugin/domain/services/op-generator-factory';
import { getDefaultPath } from '@plugin/domain/utils/op-util';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import {
  isAscendA5ProfilerCannSoc,
  resolveAscendEnv,
  resolveSimulatorDir,
} from '@plugin/domain/utils/ascend-util';
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

  if (!fs.existsSync(buildShPath)) {
    return false;
  }

  try {
    const content = fs.readFileSync(buildShPath, 'utf-8');

    return content.includes('--bisheng_flags');
  }
  catch {
    return false;
  }
}

function getNpuDebugScript(type: string, scriptPath: string): string {
  if (type === 'ascend') {
    if (checkBuildShHasBishengConfig()) {
      return `bash ${scriptPath} --pkg --soc={soc_version} --vendor_name=custom --bisheng_flags=ccec_O0,ccec_g`;
    }

    return `bash ${scriptPath} --pkg --soc={soc_version} --vendor_name=custom --debug`;
  }

  return `bash ${scriptPath} --debug`;
}

function getCpuDebugScript(type: string, scriptPath: string): string {
  if (type === 'ascend') {
    if (checkBuildShHasBishengConfig()) {
      return `bash ${scriptPath} --pkg --soc={soc_version} --vendor_name=custom --bisheng_flags=ccec_g`;
    }

    return `bash ${scriptPath} --pkg --soc={soc_version} --vendor_name=custom --simulator {simulator_type}`;
  }

  return `bash ${scriptPath} --simulator {simulator_type}`;
}

function getSimulateScript(type: string, scriptPath: string): string {
  if (type === 'ascend') {
    if (checkBuildShHasBishengConfig()) {
      return `bash ${scriptPath} --pkg --soc={soc_version} --vendor_name=custom --bisheng_flags=ccec_g`;
    }

    return `bash ${scriptPath} --pkg --soc={soc_version} --vendor_name=custom --simulator {simulator_type}`;
  }

  return `bash ${scriptPath} --simulator {simulator_type}`;
}

function getOnBoardScript(type: string, scriptPath: string): string {
  if (type === 'ascend') {
    if (checkBuildShHasBishengConfig()) {
      return `bash ${scriptPath} --pkg --soc={soc_version} --vendor_name=custom --bisheng_flags=ccec_g`;
    }

    return `bash ${scriptPath} --pkg --soc={soc_version} --vendor_name=custom --onboard`;
  }

  return `bash ${scriptPath} --onboard`;
}

function getExampleScript(type: string, scriptPath: string): string {
  if (type === 'ascend') {
    if (checkBuildShHasBishengConfig()) {
      return `bash ${scriptPath} --vendor_name=custom --run_example`;
    }

    return `bash ${scriptPath} --vendor_name=custom --run_example`;
  }

  return `bash ${scriptPath}`;
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
 * Get all operators under the project
 * @param project_id project ID
 * @returns operator list
 */
export function getOpsByProjectId(project_id: number): OpRecord[] {
  const store = ensureStore();

  return store.ops.filter((o) => o.project_id === project_id);
}

export function deleteOpsByProjectId(projectId: number): void {
  const store = ensureStore();
  const { changed, rows } = filterOutProjectId(store.ops, projectId);

  if (!changed) {
    return;
  }

  store.ops = rows;
  writeStore(store);
}

export async function generateStructure(
  data: Partial<OpRecord>,
  extensionPath: string,
  isSkipUnZip: boolean = false,
  skipVscodeFiles: boolean = false,
): Promise<number> {
  // 1) basic checks
  const project = projectModel.getProjectById(data.project_id as number);

  if (!project) {
    console.error('Project not found, project_id:', data.project_id);
    throw Object.assign(new Error('project not found'), { name: 'InvalidRequest' });
  }

  console.log('generateStructure: project info', {
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

  // Make sure to create devtool_config.json in the operator project directory
  // project.project_path is the full path of the operator project (such as /path/to/project/operator_name)
  // op_path is also the operator project path, the .vscode directory should be created here
  const opPath = (params as { op_path: string }).op_path ?? project.project_path;

  console.log('generateStructure: preparing to create config files');
  console.log('generateStructure: operator project path (op_path):', opPath);
  console.log('generateStructure: project.project_path:', project.project_path);
  console.log('generateStructure: create_by:', data.create_by);
  console.log('generateStructure: skipVscodeFiles:', skipVscodeFiles);

  // If skipVscodeFiles is true, skip creating .vscode and .arts files
  if (!skipVscodeFiles) {
    try {
      await ensureLaunchJsonExists(
        opPath,
        data.create_by,
      );
      console.log('generateStructure: config files created');
    }
    catch (error) {
      console.error('generateStructure: failed to create config files:', error);
      // Configuration file creation failure should not prevent operator creation, only log errors
    }
  }
  else {
    console.log('generateStructure: skipped creating .vscode and .arts files');
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
  const index = existingOp ? store.ops.findIndex((op) => op.id === existingOp.id) : -1;

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
  }
  else {
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
      console.log('generateStructure: starting to get default path, record:', {
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

      console.log('generateStructure: default path obtained successfully:', {
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

      // Build: Create two configurations build_op and build_example
      // If it is torch_library_template type, set target_file to python ../run.py
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

      // UT test: create a basic ut_test config
      const utTestCfg = {
        project_id: project.id,
        user_options: {
          op: record.op_name,
          script: scripts.utTestScript,
          config_name: record.op_name,
          target_dir: targetDir,
          target_file: targetExampleFile,
        },
      };

      console.log('generateStructure: start creating build_op config');
      console.log('generateStructure: build_op config data:', JSON.stringify(buildOp, null, 2));
      const buildOpResult = await configModel.postConfig('build_op', [buildOp]);

      console.log('generateStructure: build_op config creation result:', JSON.stringify(buildOpResult, null, 2));

      console.log('generateStructure: start creating build_example config');
      console.log('generateStructure: build_example config data:', JSON.stringify(buildExample, null, 2));
      const buildExampleResult = await configModel.postConfig('build_example', [buildExample]);

      console.log('generateStructure: build_example config creation result:', JSON.stringify(buildExampleResult, null, 2));

      console.log('generateStructure: start creating ut_test config');
      console.log('generateStructure: ut_test config data:', JSON.stringify(utTestCfg, null, 2));
      const utTestResult = await configModel.postConfig('ut_test', [utTestCfg]);

      console.log('generateStructure: ut_test config creation result:', JSON.stringify(utTestResult, null, 2));

      // Sanitizer: Create a basic sanitizer configuration
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

      console.log('generateStructure: start creating sanitizer config');
      console.log('generateStructure: sanitizer config data:', JSON.stringify(sanitizerCfg, null, 2));
      const sanitizerResult = await configModel.postConfig('sanitizer', [sanitizerCfg]);

      console.log('generateStructure: sanitizer config creation result:', JSON.stringify(sanitizerResult, null, 2));

      // Opprof: Create two configurations: on_board and simulate
      const cannSocForProfiler = resolveAscendEnv({ isSimulator: false }).socVersion;
      const a5Prof = isAscendA5ProfilerCannSoc(cannSocForProfiler);
      const onBoard = {
        project_id: project.id,
        user_options: {
          op:          record.op_name,
          script:      scripts.onBoardScript,
          config_name: record.op_name,
          // Memory Analysis Chart Related
          // Inter-core load analysis chart
          Occupancy: true,
          // Roofline bottleneck analysis
          Roofline: true,

          // Operator code heat map
          Source: true,
          // Cache heat map (A3); PC sampling (A5 / ascend950) — see msprof aic-metrics matrix
          MemoryDetail: !a5Prof,
          PCSampling: a5Prof,

          // Operator performance data file related
          // Time consumption and proportion of Cube and Vector type instructions
          ArithmeticUtilization: true,
          // L2 Cache hit rate
          L2Cache: true,
          // Memory read and write bandwidth rate
          Memory: true,
          // L0 read and write bandwidth rate
          MemoryL0: true,
          // UB read and write bandwidth rate
          MemoryUB: true,
          // Basic information about operators
          // BasicInfo: false,
          // The proportion of time spent in computing units and handling units
          PipeUtilization: true,
          // Proportion of resource conflicts
          ResourceConflictRatio: true,

          // Enable code segment performance collection on the Kernel side
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
          ResourceConflictRatio: true,
          PMSampling: true,
          downloadToLocal: true,
          renderInPlatform: false,
          // Data storage location default value
          dataStoragePath: getDefaultDirectory(),
          enableDump: false,
          advance_param: [],
          fileMapList: [],
        },
      };

      console.log('generateStructure: start creating on_board config');
      console.log('generateStructure: on_board config data:', JSON.stringify(onBoard, null, 2));
      const onBoardResult = await configModel.postConfig('on_board', [onBoard]);

      console.log('generateStructure: on_board config creation result:', JSON.stringify(onBoardResult, null, 2));

      console.log('generateStructure: start creating simulate config');
      console.log('generateStructure: simulate config data:', JSON.stringify(simulate, null, 2));
      const simulateResult = await configModel.postConfig('simulate', [simulate]);

      console.log('generateStructure: simulate config creation result:', JSON.stringify(simulateResult, null, 2));
    }
  }
  catch (e) {
    // Ignore configuration creation errors but print logs for debugging
    console.error('generateStructure: failed to create default configs', e);

    if (e instanceof Error) {
      console.error('generateStructure: error details:', e.message);
      console.error('generateStructure: error stack:', e.stack);
    }
    // Do not throw an error and allow the operator record to be created successfully.
  }

  return nextId;
}

function getInitialConfigScripts(
  record: OpRecord,
  opScriptPath: string,
) {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? path.dirname(opScriptPath);

  return OperatorPluginRegistry.getOpPlugin(record.op_type)
    .getInitialConfigScripts(record, workspaceRoot);
}

function getConfigPayload(
  config_type: string,
  project_id: number,
  record: OpRecord,
  opScriptPath: string,
  exampleScriptPath: string,
  targetDir: string,
  targetFile: string,
  targetExampleFile: string,
): { project_id: number;
  user_options: Record<string, unknown> } {
  const scripts = getInitialConfigScripts(record, opScriptPath);

  switch (config_type) {
    case 'build_op':
      return {
        project_id,
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
    case 'build_example':
      return {
        project_id,
        user_options: {
          op: record.op_name,
          script: scripts.exampleScript,
          config_name: record.op_name,
          target_dir: targetDir,
          target_file: targetExampleFile,
          execution_mode: 'eager',
        },
      };
    case 'ut_test':
      return {
        project_id,
        user_options: {
          op: record.op_name,
          script: scripts.utTestScript,
          config_name: record.op_name,
          target_dir: targetDir,
          target_file: targetExampleFile,
        },
      };
    case 'sanitizer':
      return {
        project_id,
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
    case 'on_board': {
      const cannSocForProfiler = resolveAscendEnv({ isSimulator: false }).socVersion;
      const a5Prof = isAscendA5ProfilerCannSoc(cannSocForProfiler);

      return {
        project_id,
        user_options: {
          op: record.op_name,
          script: scripts.onBoardScript,
          config_name: record.op_name,
          Occupancy: true,
          Roofline: true,
          Source: true,
          MemoryDetail: !a5Prof,
          PCSampling: a5Prof,
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
    }
    case 'simulate':
      return {
        project_id,
        user_options: {
          op: record.op_name,
          script: scripts.simulateScript,
          config_name: record.op_name,
          ResourceConflictRatio: true,
          PMSampling: true,
          downloadToLocal: true,
          renderInPlatform: false,
          dataStoragePath: getDefaultDirectory(),
          simulatorType: resolveSimulatorDir(),
          enableDump: false,
          advance_param: [],
          fileMapList: [],
        },
      };
    default:
      throw new Error(`unknown config type: ${config_type}`);
  }
}

/**
 * Ensure one config exists for an operator; create it when missing.
 */
export async function ensureConfigExists(
  project_id: number,
  config_type: string,
  record: OpRecord,
  opScriptPath: string,
  exampleScriptPath: string,
  targetDir: string,
  targetFile: string,
  targetExampleFile: string,
): Promise<void> {
  const existingConfigs = configModel.getConfig(project_id, config_type, record.op_name);

  if (existingConfigs.length > 0) {
    return;
  }

  const payload = getConfigPayload(
    config_type,
    project_id,
    record,
    opScriptPath,
    exampleScriptPath,
    targetDir,
    targetFile,
    targetExampleFile,
  );

  await configModel.postConfig(config_type, [payload]);
}

/**
 * Fill in all missing default configs for each operator under a project.
 */
export async function completeProjectConfigs(project_id: number): Promise<void> {
  try {
    const ops = getOpsByProjectId(project_id);

    for (const op of ops) {
      const {
        opScriptPath,
        exampleScriptPath,
        targetDir,
        targetOpFile,
        targetExampleFile,
      } = getDefaultPath(op);
      const targetFile = op.template_name === 'torch_library_template'
        ? 'python ../run.py'
        : targetOpFile;

      await ensureConfigExists(project_id, 'build_op', op, opScriptPath, exampleScriptPath, targetDir, targetFile, targetExampleFile);
      await ensureConfigExists(project_id, 'build_example', op, opScriptPath, exampleScriptPath, targetDir, targetFile, targetExampleFile);
      await ensureConfigExists(project_id, 'ut_test', op, opScriptPath, exampleScriptPath, targetDir, targetFile, targetExampleFile);
      await ensureConfigExists(project_id, 'sanitizer', op, opScriptPath, exampleScriptPath, targetDir, targetFile, targetExampleFile);
      await ensureConfigExists(project_id, 'on_board', op, opScriptPath, exampleScriptPath, targetDir, targetFile, targetExampleFile);
      await ensureConfigExists(project_id, 'simulate', op, opScriptPath, exampleScriptPath, targetDir, targetFile, targetExampleFile);
    }
  }
  catch (error) {
    console.warn(`completeProjectConfigs failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function _resetOpsForTest(): void {
  // helper for tests/dev: remove store
  fs.removeSync(getOpsFile());
}
