import * as configModel from '../models/configModel';

export function getConfig(project_id: number, config_type: string, op: string | null = null) {
  return configModel.getConfig(project_id, config_type, op);
}

export async function postConfig(config_type: string, dataList: any[]) {
  return configModel.postConfig(config_type, dataList);
}

export function getConfigById(config_id: number) {
  return configModel.getConfigById(config_id as any);
}