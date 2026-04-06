import path from 'path';
import config from './config';
import { JsonStorage } from '@plugin/core/storage/json-storage';
import { OperatorProjectType } from '@plugin/domain/services/operator-project-detector';

const dataDir = path.join(config.user_data_dir, 'data');
const projectsFile = path.join(dataDir, 'projects.json');
const storage = new JsonStorage(projectsFile);

// Sub-operator information
export type SubOperatorInfo = {
  name: string; // Operator name
  path: string; // operator path
  isCompiled?: boolean; // Has it been compiled?
};

// Operator collection information
export type OperatorCollectionInfo = {
  name: string; // Operator collection name
  path: string; // Operator collection path
};

export type ProjectRecord = {
  id: number;
  project_name: string;
  project_path: string;
  template_name?: string | null; // Template name: helloworld addn torch_library
  project_type?: string | null; // Operator project type: cann ascend pyasc
  ascend_env_script?: string | null;
  soc_version?: string | null; // SOC版本
  create_by?: string | null;
  create_time?: string;
  update_by?: string | null;
  update_time?: string;
  // List of subproject IDs of multi-operator project collections
  sub_project_ids?: number[] | null;
  // Whether it is an experimental operator (only operators in the experimental directory)
  is_experimental?: boolean | null;
  // Operator collection list of standard custom operator project
  ops_meet?: OperatorCollectionInfo[] | null;
  // Sub-operator list of standard custom operator project (non-experimental)
  ops_list?: SubOperatorInfo[] | null;
  // Experimental sub-operator list of standard custom operator project
  experimental_ops_list?: SubOperatorInfo[] | null;
  // List of selected operator IDs (for standard custom operator scenarios)
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

  // Simple verification
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
  project_type?: string; // Operator project type
  /** Set to `null` to clear stored env script (e.g. when workspace setting is empty). */
  ascend_env_script?: string | null;
  soc_version?: string;
  create_by?: string;
  sub_project_ids?: number[]; // List of subproject IDs of multi-operator project collections
  is_experimental?: boolean; // Whether it is an experimental operator
  ops_meet?: OperatorCollectionInfo[]; // Operator collection list of standard custom operator project
  ops_list?: SubOperatorInfo[]; // Sub-operator list of standard custom operator project (non-experimental)
  experimental_ops_list?: SubOperatorInfo[]; // Experimental sub-operator list of standard custom operator project
  selected_operator_ids?: number[]; // List of selected operator IDs (for standard custom operator scenarios)
}

export async function updateShScript(data: CreateProjectParams) {
  // Database operations
  const store = ensureStore();
  const existing = store.projects.find((p) => p.project_path === data.project_path);

  if (existing) {
    if (data.ascend_env_script !== undefined) {
      existing.ascend_env_script = data.ascend_env_script ?? null;
    }
    if (data.soc_version !== undefined) {
      existing.soc_version = data.soc_version;
    }
    existing.update_time = new Date()
      .toISOString();
    writeStore(store);

    return existing.id;
  }
}

export async function createProject(data: CreateProjectParams) {
  // Database operations
  const store = ensureStore();
  const existing = store.projects.find((p) => p.project_path === data.project_path);

  if (existing) {
    // Update existing project
    if (data.ascend_env_script) {
      existing.ascend_env_script = data.ascend_env_script;
    }
    if (data.project_type) {
      existing.project_type = data.project_type;
    }
    if (data.template_name) {
      existing.template_name = data.template_name
    }
    if (data.soc_version) {
      existing.soc_version = data.soc_version;
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
    soc_version: data.soc_version || null,
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
    console.warn('[getProjectByPath] Project path is empty or invalid:', projectPath);
    return undefined;
  }

  const store = ensureStore();
  
  // Normalized path comparison (paths are not case sensitive on Windows)
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
 * Find standard custom operator projects (including multiple operator sets) containing the specified path
 * Used to right-click a subfolder to locate the root project when compiling.
 * @param folderPath Folder path (such as sub-operator directory)
 * @returns The STANDARD_CUSTOM item containing the path, with the longest path first; if not found, undefined is returned
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
    console.warn('[deleteProject] Project path is empty or invalid:', projectPath);
    return false;
  }

  const store = ensureStore();
  
  // Normalized path comparison (paths are not case sensitive on Windows)
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
 * Update the operator information of the standard custom operator project
 * @param projectPath project path
 * @param opsMeet operator collection list
 * @param opsList ordinary operator list
 * @param experimentalOpsList experimental operator list
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
    console.log(`[updateStandardCustomOperators] Updating project: ${projectPath}`);
    console.log(`[updateStandardCustomOperators] ops_meet: ${opsMeet.length} operator groups`, opsMeet.map(m => m.name));
    console.log(`[updateStandardCustomOperators] ops_list: ${opsList.length} operators`, opsList.map(o => o.name));
    console.log(`[updateStandardCustomOperators] experimental_ops_list: ${experimentalOpsList.length} operators`, experimentalOpsList.map(o => o.name));
    
    // Keep the isCompiled status of existing operators
    const existingOpsList = project.ops_list || [];
    const existingExperimentalOpsList = project.experimental_ops_list || [];
    
    // Create an isCompiled state map of an existing operator (using the operator name as the key)
    const existingOpsCompiledMap = new Map<string, boolean>();
    existingOpsList.forEach((op) => {
      if (op.isCompiled === true) {
        existingOpsCompiledMap.set(op.name, true);
      }
    });
    existingExperimentalOpsList.forEach((op) => {
      if (op.isCompiled === true) {
        existingOpsCompiledMap.set(op.name, true);
      }
    });
    
    // Update the operator list and retain the existing isCompiled: true state
    const updatedOpsList = opsList.map((op) => {
      const existingIsCompiled = existingOpsCompiledMap.get(op.name);
      // If isCompiled of an existing operator is true, keep it; otherwise, use the result of the scan
      return {
        ...op,
        isCompiled: existingIsCompiled === true ? true : op.isCompiled,
      };
    });
    
    const updatedExperimentalOpsList = experimentalOpsList.map((op) => {
      const existingIsCompiled = existingOpsCompiledMap.get(op.name);
      // If isCompiled of an existing operator is true, keep it; otherwise, use the result of the scan
      return {
        ...op,
        isCompiled: existingIsCompiled === true ? true : op.isCompiled,
      };
    });
    
    project.ops_meet = opsMeet;
    project.ops_list = updatedOpsList;
    project.experimental_ops_list = updatedExperimentalOpsList;
    project.update_time = new Date().toISOString();
    writeStore(store);
    
    console.log(`[updateStandardCustomOperators] Update completed, preserved compiled status for ${existingOpsCompiledMap.size} compiled operators`);
  } else {
    console.warn(`[updateStandardCustomOperators] Project not found: ${projectPath}`);
    console.warn(`[updateStandardCustomOperators] Existing project paths:`, store.projects.map(p => p.project_path));
  }
}

/**
 * Mark the sub-operators of the standard custom operator project as compiled
 * @param projectPath project path
 * @param operatorNames list of operator names (comma separated string or array)
 */
export async function markOperatorsAsCompiled(
  projectPath: string,
  operatorNames: string | string[],
): Promise<void> {
  console.log('[markOperatorsAsCompiled] Marking sub-operators in standard custom operator project as compiled', projectPath, operatorNames);
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
    console.warn(`[markOperatorsAsCompiled] Project not found: ${projectPath}`);
    return;
  }

  // Convert operatorNames to array
  const operatorNameArray = Array.isArray(operatorNames)
    ? operatorNames
    : operatorNames.split(',').map(name => name.trim()).filter(name => name.length > 0);

  if (operatorNameArray.length === 0) {
    console.warn(`[markOperatorsAsCompiled] Operator name list is empty`);
    return;
  }

  let updated = false;

  // Update common operator list
  if (project.ops_list && project.ops_list.length > 0) {
    for (const op of project.ops_list) {
      if (operatorNameArray.includes(op.name)) {
        op.isCompiled = true;
        updated = true;
      }
    }
  }

  // Update experimental operator list
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
    console.log(`[markOperatorsAsCompiled] Marked ${operatorNameArray.length} operators as compiled`);
  } else {
    console.warn(`[markOperatorsAsCompiled] Operators to mark were not found: ${operatorNameArray.join(', ')}`);
  }
}

export function _resetProjectsForTest(): void {
  storage.delete();
}
