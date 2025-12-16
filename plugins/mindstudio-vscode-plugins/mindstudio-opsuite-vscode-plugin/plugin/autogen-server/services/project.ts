import * as projectModel from '../models/projectModel';
import { CreateProjectParams } from '../models/projectModel';

export async function createProject(data: CreateProjectParams) {
  return projectModel.createProject(data);
}

export function get_project_by_id(project_id: number) {
  return projectModel.get_project_by_id(project_id as number);
}
