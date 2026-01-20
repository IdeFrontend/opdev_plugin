import path from 'path';
import config from './config';
import { JsonStorage } from '@plugin/core/storage/json-storage';

const dataDir = path.join(config.user_data_dir, 'data');
const projectsFile = path.join(dataDir, 'projects.json');
const storage = new JsonStorage(projectsFile);

export type ProjectRecord = {
  id: number;
  project_name: string;
  project_path: string;
  project_type?: string | null; // 算子工程类型：standard-custom, ascend-c, torch-library, pyasc, multi-project
  ascend_env_script?: string | null;
  create_by?: string | null;
  create_time?: string;
  update_by?: string | null;
  update_time?: string;
  // 多算子工程集合的子项目ID列表
  sub_project_ids?: number[] | null;
  // 是否为experimental算子（仅在experimental目录下的算子）
  is_experimental?: boolean | null;
};

type ProjectsStore = {
  lastId: number;
  projects: ProjectRecord[];
};

function ensureStore(): ProjectsStore {
  const init: ProjectsStore = {
    lastId: 0,
    projects: [],
  };
  const data = storage.read<ProjectsStore>(init);

  // 简单的校验
  if (!Array.isArray(data.projects)) {
    return init;
  }

  return data;
}

function writeStore(store: ProjectsStore) {
  storage.write(store);
}

export interface CreateProjectParams {
  project_name: string;
  project_path: string;
  project_type?: string; // 算子工程类型
  ascend_env_script?: string;
  create_by?: string;
  sub_project_ids?: number[]; // 多算子工程集合的子项目ID列表
  is_experimental?: boolean; // 是否为experimental算子
}

export async function updateShScript(data: CreateProjectParams) {
  // 数据库 操作
  const store = ensureStore();
  const existing = store.projects.find((p) => p.project_path === data.project_path);

  if (existing) {
    existing.ascend_env_script = data.ascend_env_script;
    existing.update_time = new Date()
      .toISOString();
    writeStore(store);

    return existing.id;
  }
}

export async function createProject(data: CreateProjectParams) {
  // 数据库 操作
  const store = ensureStore();
  const existing = store.projects.find((p) => p.project_path === data.project_path);

  if (existing) {
    // 更新现有项目
    if (data.ascend_env_script) {
      existing.ascend_env_script = data.ascend_env_script;
    }
    if (data.project_type) {
      existing.project_type = data.project_type;
    }
    if (data.sub_project_ids) {
      existing.sub_project_ids = data.sub_project_ids;
    }
    if (data.is_experimental !== undefined) {
      existing.is_experimental = data.is_experimental;
    }
    existing.update_time = new Date()
      .toISOString();
    writeStore(store);

    return existing.id;
  }

  const nextId = store.lastId + 1;
  const now = new Date()
    .toISOString();
  const record: ProjectRecord = {
    id: nextId,
    project_name: data.project_name,
    project_path: data.project_path,
    project_type: data.project_type || null,
    ascend_env_script: data.ascend_env_script || null,
    create_by: data.create_by || null,
    create_time: now,
    update_by: null,
    update_time: now,
    sub_project_ids: data.sub_project_ids || null,
    is_experimental: data.is_experimental || null,
  };

  store.projects.push(record);
  store.lastId = nextId;
  writeStore(store);

  return nextId;
}

export function getProjectByPath(projectPath: string): ProjectRecord | undefined {
  if (!projectPath || typeof projectPath !== 'string') {
    console.warn('[getProjectByPath] 项目路径为空或无效:', projectPath);
    return undefined;
  }

  const store = ensureStore();
  
  // 规范化路径比较（Windows 上路径大小写不敏感）
  const normalizedPath = path.normalize(projectPath).replace(/\\/g, '/').toLowerCase();

  return store.projects.find((p) => {
    if (!p.project_path) {
      return false;
    }
    const normalizedProjectPath = path.normalize(p.project_path).replace(/\\/g, '/').toLowerCase();
    return normalizedProjectPath === normalizedPath;
  });
}

export function getProjectById(project_id: number) {
  const store = ensureStore();
  const found = store.projects.find((p) => p.id === project_id);

  return found || null;
}

export function deleteProject(projectPath: string): boolean {
  if (!projectPath || typeof projectPath !== 'string') {
    console.warn('[deleteProject] 项目路径为空或无效:', projectPath);
    return false;
  }

  const store = ensureStore();
  
  // 规范化路径比较（Windows 上路径大小写不敏感）
  const normalizedPath = path.normalize(projectPath).replace(/\\/g, '/').toLowerCase();
  
  const index = store.projects.findIndex((p) => {
    if (!p.project_path) {
      return false;
    }
    const normalizedProjectPath = path.normalize(p.project_path).replace(/\\/g, '/').toLowerCase();
    return normalizedProjectPath === normalizedPath;
  });
  
  if (index === -1) {
    return false;
  }
  
  store.projects.splice(index, 1);
  writeStore(store);
  
  return true;
}

export function getAllProjects(): ProjectRecord[] {
  const store = ensureStore();
  return store.projects;
}

export function _resetProjectsForTest(): void {
  storage.delete();
}
