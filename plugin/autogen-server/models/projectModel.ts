import path from 'path';
import fs from 'fs-extra';
import config from './config';
import { ensureLaunchJsonExists } from '../utils/projectUtils';

const dataDir = path.join(config.user_data_dir, 'data');
const projectsFile = path.join(dataDir, 'projects.json');

export type ProjectRecord = {
  id: number;
  project_name: string;
  project_path: string;
  ascend_env_script?: string | null;
  create_by?: string | null;
  create_time?: string;
  update_by?: string | null;
  update_time?: string;
};

type ProjectsStore = {
  lastId: number;
  projects: ProjectRecord[];
};

function ensureStore(): ProjectsStore {
  fs.ensureDirSync(dataDir);
  if (!fs.existsSync(projectsFile)) {
    const init: ProjectsStore = { lastId: 0, projects: [] };
    fs.writeFileSync(projectsFile, JSON.stringify(init, null, 2), 'utf-8');
    return init;
  }

  try {
    const raw = fs.readFileSync(projectsFile, 'utf-8');
    const parsed = JSON.parse(raw) as ProjectsStore;
    if (!parsed || typeof parsed.lastId !== 'number' || !Array.isArray(parsed.projects)) {
      throw new Error('invalid projects store');
    }
    return parsed;
  } catch {
    const init: ProjectsStore = { lastId: 0, projects: [] };
    fs.writeFileSync(projectsFile, JSON.stringify(init, null, 2), 'utf-8');
    return init;
  }
}

function writeStore(store: ProjectsStore) {
  fs.writeFileSync(projectsFile, JSON.stringify(store, null, 2), 'utf-8');
}

export interface CreateProjectParams {
  project_name: string;
  project_path: string;
  ascend_env_script?: string;
  create_by?: string;
}

export async function updataShScript(data: CreateProjectParams) {
  // 数据库 操作
  const store = ensureStore();
  const existing = store.projects.find((p) => p.project_path === data.project_path);
  if (existing) {
    existing.ascend_env_script = data.ascend_env_script;
    existing.update_time = new Date().toISOString();
    writeStore(store);
    return existing.id;
  }
}

export async function createProject(data: CreateProjectParams) {
  // 数据库 操作
  const store = ensureStore();
  const existing = store.projects.find((p) => p.project_path === data.project_path);
  if (existing) {
    if (!data.ascend_env_script) return existing.id;
    existing.ascend_env_script = data.ascend_env_script;
    existing.update_time = new Date().toISOString();
    writeStore(store);
    return existing.id;
  }

  await ensureLaunchJsonExists(data.project_path, data.create_by);
  const nextId = store.lastId + 1;
  const now = new Date().toISOString();
  const record: ProjectRecord = {
    id: nextId,
    project_name: data.project_name,
    project_path: data.project_path,
    ascend_env_script: data.ascend_env_script || null,
    create_by: data.create_by || null,
    create_time: now,
    update_by: null,
    update_time: now,
  };
  store.projects.push(record);
  store.lastId = nextId;
  writeStore(store);
  return nextId;
}

export function getProjectByPath(projectPath: string): ProjectRecord | undefined {
  const store = ensureStore();
  return store.projects.find((p) => p.project_path === projectPath);
}

export function get_project_by_id(project_id: number) {
  const store = ensureStore();
  const found = store.projects.find((p) => p.id === project_id);
  return found || null;
}

export function _resetProjectsForTest(): void {
  fs.removeSync(projectsFile);
}
