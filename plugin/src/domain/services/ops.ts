import * as model from '@plugin/domain/models/model';

export function getOpByProjectIdAndOpName(project_id: number, op_name: string) {
  return model.getOpByProjectIdAndOpName(project_id, op_name);
}

interface GenerateStructureParams {
  task_id?: number;
  project_id: number;
  op_class?: string;
  op_name?: string;
  op_type?: string;
  op_path?: string;
  ascend_env_script?: string;
  examples?: string;
  create_by?: string;
  /** 暂未启用 */
  ops_prototype_file?: string;
  template_name?: string;
}

export async function generateStructure(
  data: GenerateStructureParams,
  extensionPath: string,
): Promise<number> {
  return await model.generateStructure(data, extensionPath);
}
