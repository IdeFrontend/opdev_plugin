/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import path from 'path';
import fs from 'fs-extra';
import { t } from 'i18next';
import { getProjectByPath } from '@plugin/domain/models/project-model';

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

/**
 * Generate an ops prototype JSON for the operator project at `projectPath`
 * (path-keyed — no numeric project id is used). The target
 * directory is validated by the synthesized project record marker; the write
 * itself is FS-existence based, so a freshly created project works without a
 * registry entry.
 */
export async function generateOpsPrototype(
  projectPath: string,
  op_name = 'default_op',
  prototype_name = 'add_custom',
  extensionPath: string,
  outputPath?: string,
): Promise<string> {
  const project = getProjectByPath(projectPath);

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
