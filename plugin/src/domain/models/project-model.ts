import path from 'path';
import config from './config';
import { JsonStorage } from '@plugin/core/storage/json-storage';
import { OperatorProjectType } from '@plugin/domain/services/operator-project-detector';

const dataDir = path.join(config.user_data_dir, 'data');
const projectsFile = path.join(dataDir, 'projects.json');
const storage = new JsonStorage(projectsFile);

// 子算子信息
export type SubOperatorInfo = {
  name: string; // 算子名称
  path: string; // 算子路径
  isCompiled?: boolean; // 是否已编译
};

// 算子合集信息
export type OperatorCollectionInfo = {
  name: string; // 算子合集名称
  path: string; // 算子合集路径
};

export type ProjectRecord = {
  id: number;
  project_name: string;
  project_path: string;
  template_name?: string | null; // 模板名称: helloworld addn torch_library
  project_type?: string | null; // 算子工程类型：cann ascend pyasc
  ascend_env_script?: string | null;
  create_by?: string | null;
  create_time?: string;
  update_by?: string | null;
  update_time?: string;
  // 多算子工程集合的子项目ID列表
  sub_project_ids?: number[] | null;
  // 是否为experimental算子（仅在experimental目录下的算子）
  is_experimental?: boolean | null;
  // 标准自定义算子工程的算子合集列表
  ops_meet?: OperatorCollectionInfo[] | null;
  // 标准自定义算子工程的子算子列表（非experimental）
  ops_list?: SubOperatorInfo[] | null;
  // 标准自定义算子工程的experimental子算子列表
  experimental_ops_list?: SubOperatorInfo[] | null;
  // 已选择的算子ID列表（用于标准自定义算子场景）
  selected_operator_ids?: number[] | null;
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
  template_name?: string,
  project_type?: string; // 算子工程类型
  ascend_env_script?: string;
  create_by?: string;
  sub_project_ids?: number[]; // 多算子工程集合的子项目ID列表
  is_experimental?: boolean; // 是否为experimental算子
  ops_meet?: OperatorCollectionInfo[]; // 标准自定义算子工程的算子合集列表
  ops_list?: SubOperatorInfo[]; // 标准自定义算子工程的子算子列表（非experimental）
  experimental_ops_list?: SubOperatorInfo[]; // 标准自定义算子工程的experimental子算子列表
  selected_operator_ids?: number[]; // 已选择的算子ID列表（用于标准自定义算子场景）
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
    if (data.template_name) {
      existing.template_name = data.template_name
    }
    if (data.sub_project_ids) {
      existing.sub_project_ids = data.sub_project_ids;
    }
    if (data.is_experimental !== undefined) {
      existing.is_experimental = data.is_experimental;
    }
    if (data.ops_list !== undefined) {
      existing.ops_list = data.ops_list;
    }
    if (data.experimental_ops_list !== undefined) {
      existing.experimental_ops_list = data.experimental_ops_list;
    }
    if (data.ops_meet !== undefined) {
      existing.ops_meet = data.ops_meet;
    }
    if (data.selected_operator_ids !== undefined) {
      existing.selected_operator_ids = data.selected_operator_ids;
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
    template_name: data.template_name || null,
    project_type: data.project_type || null,
    ascend_env_script: data.ascend_env_script || null,
    create_by: data.create_by || null,
    create_time: now,
    update_by: null,
    update_time: now,
    sub_project_ids: data.sub_project_ids || null,
    is_experimental: data.is_experimental || null,
    ops_meet: data.ops_meet || null,
    ops_list: data.ops_list || null,
    experimental_ops_list: data.experimental_ops_list || null,
    selected_operator_ids: data.selected_operator_ids || null,
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

/**
 * 查找包含指定路径的标准自定义算子工程（含多算子集合）
 * 用于右键子文件夹编译时，定位到根项目。
 * @param folderPath 文件夹路径（如子算子目录）
 * @returns 包含该路径的 STANDARD_CUSTOM 或 MULTI_PROJECT 项目，按路径最长优先；未找到返回 undefined
 */
export function getContainingStandardCustomProject(folderPath: string): ProjectRecord | undefined {
  if (!folderPath || typeof folderPath !== 'string') {
    return undefined;
  }

  const store = ensureStore();
  const normalizedFolder = path.normalize(folderPath).replace(/\\/g, '/').toLowerCase();

  const containing = store.projects.filter((p) => {
    if (!p.project_path || !p.project_type) {
      return false;
    }
    if (
      p.project_type !== OperatorProjectType.STANDARD_CUSTOM
      && p.project_type !== OperatorProjectType.MULTI_PROJECT
    ) {
      return false;
    }
    const normalizedProject = path.normalize(p.project_path).replace(/\\/g, '/').toLowerCase();
    if (normalizedFolder === normalizedProject) {
      return true;
    }
    const prefix = normalizedProject.endsWith('/') ? normalizedProject : `${normalizedProject}/`;
    return normalizedFolder.startsWith(prefix);
  });

  if (containing.length === 0) {
    return undefined;
  }

  containing.sort((a, b) => {
    const na = path.normalize(a.project_path || '').replace(/\\/g, '/').length;
    const nb = path.normalize(b.project_path || '').replace(/\\/g, '/').length;
    return nb - na;
  });

  return containing[0];
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

/**
 * 更新标准自定义算子工程的算子信息
 * @param projectPath 项目路径
 * @param opsMeet 算子合集列表
 * @param opsList 普通算子列表
 * @param experimentalOpsList experimental算子列表
 */
export async function updateStandardCustomOperators(
  projectPath: string,
  opsMeet: OperatorCollectionInfo[],
  opsList: SubOperatorInfo[],
  experimentalOpsList: SubOperatorInfo[],
): Promise<void> {
  const store = ensureStore();
  const normalizedPath = path.normalize(projectPath).replace(/\\/g, '/').toLowerCase();
  
  const project = store.projects.find((p) => {
    if (!p.project_path) {
      return false;
    }
    const normalizedProjectPath = path.normalize(p.project_path).replace(/\\/g, '/').toLowerCase();
    return normalizedProjectPath === normalizedPath;
  });

  if (project) {
    console.log(`[updateStandardCustomOperators] 更新项目: ${projectPath}`);
    console.log(`[updateStandardCustomOperators] ops_meet: ${opsMeet.length} 个算子合集`, opsMeet.map(m => m.name));
    console.log(`[updateStandardCustomOperators] ops_list: ${opsList.length} 个算子`, opsList.map(o => o.name));
    console.log(`[updateStandardCustomOperators] experimental_ops_list: ${experimentalOpsList.length} 个算子`, experimentalOpsList.map(o => o.name));
    
    project.ops_meet = opsMeet;
    project.ops_list = opsList;
    project.experimental_ops_list = experimentalOpsList;
    project.update_time = new Date().toISOString();
    writeStore(store);
    
    console.log(`[updateStandardCustomOperators] 更新完成`);
  } else {
    console.warn(`[updateStandardCustomOperators] 未找到项目: ${projectPath}`);
    console.warn(`[updateStandardCustomOperators] 现有项目路径:`, store.projects.map(p => p.project_path));
  }
}

/**
 * 标记标准自定义算子工程的子算子为已编译
 * @param projectPath 项目路径
 * @param operatorNames 算子名称列表（逗号分隔的字符串或数组）
 */
export async function markOperatorsAsCompiled(
  projectPath: string,
  operatorNames: string | string[],
): Promise<void> {
  const store = ensureStore();
  const normalizedPath = path.normalize(projectPath).replace(/\\/g, '/').toLowerCase();
  
  const project = store.projects.find((p) => {
    if (!p.project_path) {
      return false;
    }
    const normalizedProjectPath = path.normalize(p.project_path).replace(/\\/g, '/').toLowerCase();
    return normalizedProjectPath === normalizedPath;
  });

  if (!project) {
    console.warn(`[markOperatorsAsCompiled] 未找到项目: ${projectPath}`);
    return;
  }

  // 将 operatorNames 转换为数组
  const operatorNameArray = Array.isArray(operatorNames)
    ? operatorNames
    : operatorNames.split(',').map(name => name.trim()).filter(name => name.length > 0);

  if (operatorNameArray.length === 0) {
    console.warn(`[markOperatorsAsCompiled] 算子名称列表为空`);
    return;
  }

  let updated = false;

  // 更新普通算子列表
  if (project.ops_list && project.ops_list.length > 0) {
    for (const op of project.ops_list) {
      if (operatorNameArray.includes(op.name)) {
        op.isCompiled = true;
        updated = true;
      }
    }
  }

  // 更新experimental算子列表
  if (project.experimental_ops_list && project.experimental_ops_list.length > 0) {
    for (const op of project.experimental_ops_list) {
      if (operatorNameArray.includes(op.name)) {
        op.isCompiled = true;
        updated = true;
      }
    }
  }

  if (updated) {
    project.update_time = new Date().toISOString();
    writeStore(store);
    console.log(`[markOperatorsAsCompiled] 已标记 ${operatorNameArray.length} 个算子为已编译`);
  } else {
    console.warn(`[markOperatorsAsCompiled] 未找到要标记的算子: ${operatorNameArray.join(', ')}`);
  }
}

export function _resetProjectsForTest(): void {
  storage.delete();
}
