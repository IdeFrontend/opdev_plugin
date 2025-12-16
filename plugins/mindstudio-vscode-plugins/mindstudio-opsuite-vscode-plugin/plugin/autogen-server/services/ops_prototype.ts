import path from 'path';
import fs from 'fs-extra';
import { get_project_by_id } from './project';

async function generateOpsPrototypeJson(projectPath: string, opName: string, prototypeName: string, extensionPath: string): Promise<string> {
  const projectDir = path.resolve(projectPath);
  const projectExists = await fs.pathExists(projectDir);
  if (!projectExists) {
    throw Object.assign(new Error('project dir does not exist'), { name: 'InvalidRequest' });
  }

  let opsPath = path.join(projectDir, `${opName}.json`);
  let t = 1;
  while (await fs.pathExists(opsPath)) {
    opsPath = path.join(projectDir, `${opName}_${t}.json`);
    t += 1;
  }

  const opsPrototypeJsonPath = path.resolve(extensionPath, `out/templates/ops_prototype/${prototypeName}.json`);
  if (!(await fs.pathExists(opsPrototypeJsonPath))) {
    console.error('✗ 不存在的 ops_prototype模板');
    throw Object.assign(new Error('✗ 不存在的 ops_prototype模板'), { name: 'InvalidRequest' });
  }

  try {
    const prototypeJson = await fs.readJson(opsPrototypeJsonPath);
    if (Array.isArray(prototypeJson) && prototypeJson.length > 0) {
      (prototypeJson as any)[0]['op'] = opName;
    } else if (typeof prototypeJson === 'object') {
      (prototypeJson as any)['op'] = opName;
    }

    await fs.writeJson(opsPath, prototypeJson, { spaces: 4, encoding: 'utf8' });

    console.info(`✓ 成功创建 json: ${path.basename(opsPath)}`);
    return opsPath;
  } catch (e: any) {
    console.error(`✗ 处理ops_prototype.json失败: ${e}`);
    throw e;
  }
}

export async function generateOpsPrototype(project_id: number, op_name = 'default_op', prototype_name = 'add_custom', extensionPath: string): Promise<string> {
  const project = get_project_by_id(project_id as any);
  if (!project) throw Object.assign(new Error('project not found'), { name: 'InvalidRequest' });
  return generateOpsPrototypeJson(project.project_path, op_name, prototype_name, extensionPath);
}
