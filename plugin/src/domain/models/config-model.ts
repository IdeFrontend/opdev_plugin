import path from 'path';
import config from './config';
import { JsonStorage } from '../../core/storage/json-storage';

const getDataDir = () =>
  path.join(
    (config as unknown as { workspace_data_dir: string }).workspace_data_dir,
    'data',
  );
const getConfigsFile = () => path.join(getDataDir(), 'configs.json');

function getStorage() {
  return new JsonStorage(getConfigsFile());
}

export type ConfigRecord = {
  id: number;
  config_name: string;
  config_type: string;
  script: string;
  target_dir?: string | null;
  target_file?: string | null;
  custom_options?: string | null;
  user_options?: unknown | null;
  project_id: number;
  op: string;
  create_by?: string | null;
  create_time?: string;
  update_by?: string | null;
  update_time?: string;
};

type ConfigsStore = {
  lastId: number;
  configs: ConfigRecord[];
};

function ensureStore(): ConfigsStore {
  const init: ConfigsStore = { lastId: 0, configs: [] };
  const data = getStorage().read<ConfigsStore>(init);

  if (!data || !Array.isArray(data.configs)) {
    return init;
  }

  return data;
}

function writeStore(store: ConfigsStore) {
  getStorage().write(store);
}

function mapRecordToConfig(row: ConfigRecord) {
  return {
    config_id: row.id,
    config_name: row.config_name,
    op: row.op,
    script: row.script,
    config_type: row.config_type,
    user_options: row.user_options || null,
    custom_options: row.custom_options,
    target_file: row.target_file,
    target_dir: row.target_dir,
    project_id: row.project_id,
  };
}

export function getConfig(
  project_id: number,
  config_type: string,
  op: string | null = null,
) {
  const store = ensureStore();
  const filtered = store.configs.filter(
    (c) =>
      c.project_id === project_id &&
      c.config_type === config_type &&
      (op ? c.op === op : true),
  );

  return filtered.map(mapRecordToConfig);
}

export async function postConfig(config_type: string, dataList: unknown[]) {
  const results: unknown[] = [];
  const store = ensureStore();
  const now = new Date().toISOString();

  for (const item of dataList as any[]) {
    const opVal = item.user_options.op || null;
    const user_options = item.user_options ? item.user_options : null;

    if (item.config_id) {
      const idx = store.configs.findIndex((c) => c.id === item.config_id);

      if (idx === -1) {
        results.push({
          config_id: item.config_id,
          operation: 'update',
          status: 'failed',
          error: 'not_found',
        });
        continue;
      }
      store.configs[idx] = Object.assign({}, store.configs[idx], {
        config_name: user_options.config_name,
        script: user_options.script,
        target_dir: user_options.target_dir || null,
        target_file: user_options.target_file || null,
        custom_options: item.custom_options || null,
        user_options: user_options,
        op: opVal,
        update_by: item.update_by || null,
        update_time: now,
      });
      results.push({
        config_id: item.config_id,
        operation: 'update',
        status: 'success',
      });
    } else {
      const nextId = store.lastId + 1;
      const record: ConfigRecord = {
        id: nextId,
        config_name: user_options.config_name || null,
        config_type: config_type,
        script: user_options.script || '',
        target_dir: user_options.target_dir || null,
        target_file: user_options.target_file || null,
        custom_options: item.custom_options || null,
        user_options: user_options,
        project_id: item.project_id,
        op: opVal,
        create_by: item.create_by || null,
        create_time: now,
        update_by: null,
        update_time: now,
      };

      store.configs.push(record);
      store.lastId = nextId;
      results.push({
        config_id: nextId,
        operation: 'create',
        status: 'success',
      });
    }
  }

  try {
    writeStore(store);

    return results;
  } catch (e: unknown) {
    for (const r of results) {
      (r as { status: string; error: string }).status = 'failed';
      (r as { status: string; error: string }).error = (e as Error).message;
    }

    return results;
  }
}

export function getConfigById(config_id: number) {
  const store = ensureStore();
  const row = store.configs.find((c) => c.id === config_id);

  if (!row) return null;

  return {
    id: row.id,
    config_name: row.config_name,
    config_type: row.config_type,
    script: row.script,
    target_dir: row.target_dir,
    target_file: row.target_file,
    custom_options: row.custom_options,
    user_options: row.user_options || null,
    project_id: row.project_id,
    op: row.op,
  };
}

export function _resetConfigsForTest(): void {
  getStorage().delete();
}
