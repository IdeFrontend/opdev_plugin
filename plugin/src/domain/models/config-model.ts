import path from 'path';
import * as fs from 'fs-extra';
import config from './config';
import { JsonStorage } from '@plugin/core/storage/json-storage';
import { filterOutProjectId } from '@plugin/domain/utils/filter-by-project-id';
import { getLegacyWorkspaceConfigsFileFromOpDevtoolsDir, getLegacyWorkspaceConfigsFile } from '@plugin/helpers/ide-config-dir';

// Use user_data_dir instead of workspace_data_dir to ensure that the configuration is also found when a new window opens
// Because workspace_data_dir depends on the workspace path, it may be different when a new window is opened
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

// Get the old configuration file path (workspace_data_dir)
const getOldConfigsFile = () => {
  try {
    const workspaceDataDir = (config as unknown as { workspace_data_dir: string }).workspace_data_dir;
    return getLegacyWorkspaceConfigsFileFromOpDevtoolsDir(workspaceDataDir);
  }
  catch {
    return null;
  }
};

function getStorage() {
  return new JsonStorage(getConfigsFile());
}

// Migrate old configuration (if present)
function migrateOldConfigsIfNeeded(): void {
  const oldConfigsFile = getOldConfigsFile();
  const newConfigsFile = getConfigsFile();

  if (!oldConfigsFile || !fs.existsSync(oldConfigsFile)) {
    return; // No old configuration needs to be migrated
  }

  try {
    console.log('getConfig: old config file found, starting migration:', oldConfigsFile, '->', newConfigsFile);
    const oldStorage = new JsonStorage(oldConfigsFile);
    const oldStore = oldStorage.read<ConfigsStore>({
      lastId: 0,
      configs: [],
    });

    if (oldStore.configs.length === 0) {
      return; // The old configuration is empty and no migration is required
    }

    const newStorage = new JsonStorage(newConfigsFile);
    const newStore = newStorage.read<ConfigsStore>({
      lastId: 0,
      configs: [],
    });

    // Merge configuration: Add configuration items in the old configuration that do not exist in the new configuration
    const existingIds = new Set(newStore.configs.map((c) => c.id));
    let migratedCount = 0;
    let maxId = newStore.lastId;

    for (const oldConfig of oldStore.configs) {
      if (!existingIds.has(oldConfig.id)) {
        // If IDs conflict, assign new IDs
        if (oldConfig.id <= maxId) {
          maxId = Math.max(maxId, oldConfig.id);
        }

        newStore.configs.push(oldConfig);
        migratedCount++;
      }
    }

    // Update lastId to the maximum value in the two stores
    newStore.lastId = Math.max(newStore.lastId, oldStore.lastId, maxId);

    if (migratedCount > 0) {
      newStorage.write(newStore);
      console.log('getConfig: config migration succeeded, migrated', migratedCount, 'configs');
    }
    else {
      console.log('getConfig: all old configs already exist in new config, no migration needed');
    }
  }
  catch (error) {
    console.error('getConfig: config migration failed:', error);
  }
}

export type ConfigRecord = {
  id: number;
  config_name: string;
  config_type: string;
  script: string;
  target_dir?: string | null;
  target_file?: string | null;
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
  // Attempt to migrate old configuration if present
  migrateOldConfigsIfNeeded();

  const init: ConfigsStore = {
    lastId: 0,
    configs: [],
  };
  const data = getStorage()
    .read<ConfigsStore>(init);

  if (!data || !Array.isArray(data.configs)) {
    return init;
  }

  return data;
}

function writeStore(store: ConfigsStore) {
  getStorage()
    .write(store);
}

function mapRecordToConfig(row: ConfigRecord) {
  return {
    config_id: row.id,
    config_name: row.config_name,
    op: row.op,
    script: row.script,
    config_type: row.config_type,
    user_options: row.user_options || null,
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

  console.log('getConfig: querying config, project_id:', project_id, 'config_type:', config_type, 'op:', op, 'configsFile:', configsFile);
  const store = ensureStore();

  console.log('getConfig: store.configs.length:', store.configs.length);
  console.log('getConfig: store.configs:', store.configs.map((c) => ({
    id: c.id,
    project_id: c.project_id,
    config_type: c.config_type,
    op: c.op,
  })));
  const filtered = store.configs.filter((c) =>
    c.project_id === project_id
    && c.config_type === config_type
    && (op ? c.op === op : true));

  console.log('getConfig: filtered config count:', filtered.length);

  return filtered.map(mapRecordToConfig);
}

export async function postConfig(config_type: string, dataList: unknown[]) {
  const results: unknown[] = [];
  const store = ensureStore();
  const now = new Date()
    .toISOString();

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

      const existing = store.configs[idx];
      // Post-migration runtime reads scripts from workspace settings only; do not mirror
      // stale user_options.script / target_file into DB columns on update (e.g. fileMapList).
      store.configs[idx] = {
        ...existing,
        config_name: user_options?.config_name ?? existing.config_name,
        target_dir: user_options?.target_dir !== undefined
          ? user_options.target_dir
          : existing.target_dir,
        user_options,
        op: opVal ?? existing.op,
        update_by: item.update_by ?? null,
        update_time: now,
      };
      results.push({
        config_id: item.config_id,
        operation: 'update',
        status: 'success',
      });
    }
    else {
      const nextId = store.lastId + 1;
      const record: ConfigRecord = {
        id: nextId,
        config_name: user_options.config_name || null,
        config_type: config_type,
        script: user_options.script || '',
        target_dir: user_options.target_dir || null,
        target_file: user_options.target_file || null,
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
  }
  catch (e: unknown) {
    for (const r of results) {
      (r as { status: string;
        error: string }).status = 'failed';
      (r as { status: string;
        error: string }).error = (e as Error).message;
    }

    return results;
  }
}

export function getConfigById(config_id: number) {
  const store = ensureStore();

  console.log('getConfigById - store', store, config_id);
  const row = store.configs.find((c) => c.id === config_id);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    config_name: row.config_name,
    config_type: row.config_type,
    script: row.script,
    target_dir: row.target_dir,
    target_file: row.target_file,
    user_options: row.user_options || null,
    project_id: row.project_id,
    op: row.op,
  };
}

export function deleteConfigsByProjectId(projectId: number): void {
  const store = ensureStore();
  const { changed, rows } = filterOutProjectId(store.configs, projectId);

  if (!changed) {
    return;
  }

  store.configs = rows;
  writeStore(store);
}

export function deleteLegacyWorkspaceConfigsByProjectId(
  projectId: number,
  workspaceRoot: string,
): void {
  const oldConfigsFile = getLegacyWorkspaceConfigsFile(workspaceRoot);

  if (!fs.existsSync(oldConfigsFile)) {
    return;
  }

  const storage = new JsonStorage(oldConfigsFile);
  const store = storage.read<ConfigsStore>({
    lastId: 0,
    configs: [],
  });
  const { changed, rows } = filterOutProjectId(store.configs, projectId);

  if (!changed) {
    return;
  }

  if (rows.length === 0) {
    storage.delete();
    return;
  }

  store.configs = rows;
  storage.write(store);
}

export function _resetConfigsForTest(): void {
  getStorage()
    .delete();
}
