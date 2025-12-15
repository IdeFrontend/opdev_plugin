import path from 'path';
import fs from 'fs-extra';
import config from './config';

const dataDir = path.join((config as any).user_data_dir, 'data');
const opsFile = path.join(dataDir, 'ops.json');

type OpRecord = {
  id: number;
  task_id?: number | null;
  project_id: number;
  op_class?: string | null;
  op_name: string;
  op_type?: string;
  op_path?: string | null;
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
  fs.writeFileSync(opsFile, JSON.stringify(store, null, 2), 'utf-8');
}

export function getOpByProjectIdAndOpName(project_id: number, op_name: string): OpRecord | null {
  const store = ensureStore();
  const found = store.ops.find(o => o.project_id === project_id && o.op_name === op_name);
  return found || null;
}

export function generateStructure(data: Partial<OpRecord>): number {
  const store = ensureStore();
  const now = new Date().toISOString();
  const nextId = store.lastId + 1;
  const record: OpRecord = {
    id: nextId,
    task_id: data.task_id ?? null,
    project_id: data.project_id as number,
    op_class: data.op_class ?? null,
    op_name: data.op_name as string,
    op_type: data.op_type ?? 'ascend',
    op_path: data.op_path ?? null,
    ascend_env_script: data.ascend_env_script ?? null,
    examples: data.examples ?? null,
    create_by: data.create_by ?? null,
    create_time: now,
    update_by: null,
    update_time: now
  };
  store.ops.push(record);
  store.lastId = nextId;
  writeStore(store);
  return nextId;
}

export function _resetOpsForTest(): void {
  // helper for tests/dev: remove store
  fs.removeSync(opsFile);
}
