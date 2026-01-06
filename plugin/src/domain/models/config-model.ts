import path from 'path';
import * as fs from 'fs-extra';
import config from './config';
import { JsonStorage } from '../../core/storage/json-storage';

// 使用 user_data_dir 而不是 workspace_data_dir，确保配置在新窗口打开时也能找到
// 因为 workspace_data_dir 依赖于工作区路径，在新窗口打开时可能会不同
const getDataDir = () => {
  const userDataDir = config.user_data_dir;
  const dataDir = path.join(userDataDir, 'data');
  console.log('getDataDir: user_data_dir:', userDataDir);
  console.log('getDataDir: dataDir:', dataDir);
  return dataDir;
};
const getConfigsFile = () => {
  const configsFile = path.join(getDataDir(), 'configs.json');
  console.log('getConfigsFile: configs.json path:', configsFile);
  return configsFile;
};

// 获取旧的配置文件路径（workspace_data_dir）
const getOldConfigsFile = () => {
  try {
    const workspaceDataDir = (config as unknown as { workspace_data_dir: string }).workspace_data_dir;
    const oldDataDir = path.join(workspaceDataDir, 'data');
    return path.join(oldDataDir, 'configs.json');
  } catch {
    return null;
  }
};

function getStorage() {
  return new JsonStorage(getConfigsFile());
}

// 迁移旧配置（如果存在）
function migrateOldConfigsIfNeeded(): void {
  const oldConfigsFile = getOldConfigsFile();
  const newConfigsFile = getConfigsFile();
  
  if (!oldConfigsFile || !fs.existsSync(oldConfigsFile)) {
    return; // 没有旧配置需要迁移
  }
  
  try {
    console.log('getConfig: 发现旧配置文件，开始迁移:', oldConfigsFile, '->', newConfigsFile);
    const oldStorage = new JsonStorage(oldConfigsFile);
    const oldStore = oldStorage.read<ConfigsStore>({ lastId: 0, configs: [] });
    
    if (oldStore.configs.length === 0) {
      return; // 旧配置为空，无需迁移
    }
    
    const newStorage = new JsonStorage(newConfigsFile);
    const newStore = newStorage.read<ConfigsStore>({ lastId: 0, configs: [] });
    
    // 合并配置：将旧配置中不存在于新配置的配置项添加进去
    const existingIds = new Set(newStore.configs.map(c => c.id));
    let migratedCount = 0;
    let maxId = newStore.lastId;
    
    for (const oldConfig of oldStore.configs) {
      if (!existingIds.has(oldConfig.id)) {
        // 如果ID冲突，分配新的ID
        if (oldConfig.id <= maxId) {
          maxId = Math.max(maxId, oldConfig.id);
        }
        newStore.configs.push(oldConfig);
        migratedCount++;
      }
    }
    
    // 更新 lastId 为两个存储中的最大值
    newStore.lastId = Math.max(newStore.lastId, oldStore.lastId, maxId);
    
    if (migratedCount > 0) {
      newStorage.write(newStore);
      console.log('getConfig: 配置迁移成功，迁移了', migratedCount, '个配置');
    } else {
      console.log('getConfig: 所有旧配置已存在于新配置中，无需迁移');
    }
  } catch (error) {
    console.error('getConfig: 配置迁移失败:', error);
  }
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
  // 尝试迁移旧配置（如果存在）
  migrateOldConfigsIfNeeded();
  
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
  const configsFile = getConfigsFile();
  console.log('getConfig: 查询配置，project_id:', project_id, 'config_type:', config_type, 'op:', op, 'configsFile:', configsFile);
  const store = ensureStore();
  console.log('getConfig: store.configs.length:', store.configs.length);
  console.log('getConfig: store.configs:', store.configs.map(c => ({
    id: c.id,
    project_id: c.project_id,
    config_type: c.config_type,
    op: c.op,
  })));
  const filtered = store.configs.filter(
    (c) =>
      c.project_id === project_id &&
      c.config_type === config_type &&
      (op ? c.op === op : true),
  );
  console.log('getConfig: 过滤后的配置数量:', filtered.length);

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
