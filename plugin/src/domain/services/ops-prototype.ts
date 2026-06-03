import path from 'path';
import fs from 'fs-extra';
import { t } from 'i18next';
import { getProjectById } from '@plugin/domain/models/project-model';

async function generateOpsPrototypeJson(
  projectPath: string,
  opName: string,
  prototypeName: string,
  extensionPath: string,
): Promise<string> {
  const projectDir = path.resolve(projectPath);
  const projectExists = await fs.pathExists(projectDir);

  if (!projectExists) {
    throw Object.assign(new Error(t('project.projectDirNotExist')), { name: 'InvalidRequest' });
  }

  let opsPath = path.join(projectDir, `${opName}.json`);
  let suffix = 1;

  while (await fs.pathExists(opsPath)) {
    opsPath = path.join(projectDir, `${opName}_${suffix}.json`);
    suffix += 1;
  }

  const opsPrototypeJsonPath = path.resolve(
    extensionPath,
    `out/templates/ops_prototype/${prototypeName}.json`,
  );

  if (!(await fs.pathExists(opsPrototypeJsonPath))) {
    console.error('✗ Non-existent ops_prototype template');
    throw Object.assign(
      new Error(t('project.opsPrototypeTemplateMissing', { path: opsPrototypeJsonPath })),
      { name: 'InvalidRequest' },
    );
  }

  try {
    const prototypeJson = await fs.readJson(opsPrototypeJsonPath);

    if (Array.isArray(prototypeJson) && prototypeJson.length > 0) {
      (prototypeJson as Record<string, unknown>[])[0]['op'] = opName;
    }
    else if (typeof prototypeJson === 'object') {
      (prototypeJson as Record<string, unknown>)['op'] = opName;
    }

    await fs.writeJson(opsPath, prototypeJson, {
      spaces: 4,
      encoding: 'utf8',
    });

    console.info(`✓ Successfully created json: ${path.basename(opsPath)}`);

    return opsPath;
  }
  catch (e: unknown) {
    console.error(`✗ Failed to process ops_prototype.json: ${e}`);
    throw e;
  }
}

export async function generateOpsPrototype(
  project_id: number,
  op_name = 'default_op',
  prototype_name = 'add_custom',
  extensionPath: string,
  outputPath?: string,
): Promise<string> {
  const project = getProjectById(project_id);

  if (!project) {
    throw Object.assign(new Error('project not found'), { name: 'InvalidRequest' });
  }

  return generateOpsPrototypeJson(
    outputPath ?? project.project_path,
    op_name,
    prototype_name,
    extensionPath,
  );
}
