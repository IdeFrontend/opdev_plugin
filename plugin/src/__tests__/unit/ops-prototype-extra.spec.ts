/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
/**
 * Remaining branches of generateOpsPrototype: missing project dir, name
 * collision suffixing, missing template, object-shaped templates, and the
 * read/write failure path. The happy paths live in
 * generate-ops-prototype-output-path.spec.ts.
 */
jest.mock('@plugin/domain/models/project-model', () => ({ getProjectByPath: jest.fn() }));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getProjectByPath } from '@plugin/domain/models/project-model';
import { generateOpsPrototype } from '@plugin/domain/services/ops-prototype';

function mkTmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function seedTemplate(extensionPath: string, name: string, content: string): void {
  const tplDir = path.join(extensionPath, 'out/templates/ops_prototype');

  fs.mkdirSync(tplDir, { recursive: true });
  fs.writeFileSync(path.join(tplDir, `${name}.json`), content);
}

describe('generateOpsPrototype edge branches', () => {
  it('uses the default op_name when none is provided', async () => {
    const projectPath = mkTmp('proj-');
    const extensionPath = mkTmp('ext-');

    try {
      seedTemplate(extensionPath, 'add_custom', JSON.stringify([{ op: 'placeholder' }]));
      (getProjectByPath as jest.Mock).mockReturnValue({ project_path: projectPath });

      const written = await generateOpsPrototype(projectPath, undefined, 'add_custom', extensionPath);

      expect(written)
        .toBe(path.join(projectPath, 'default_op.json'));
      expect(fs.existsSync(path.join(projectPath, 'default_op.json')))
        .toBe(true);
    }
    finally {
      fs.rmSync(projectPath, {
        recursive: true,
        force: true,
      });
      fs.rmSync(extensionPath, {
        recursive: true,
        force: true,
      });
    }
  });

  it('throws InvalidRequest when the project directory does not exist', async () => {
    const missingDir = path.join(mkTmp('proj-'), 'never-created');
    const extensionPath = mkTmp('ext-');

    try {
      (getProjectByPath as jest.Mock).mockReturnValue({ project_path: missingDir });

      await expect(generateOpsPrototype(missingDir, 'my_op', 'add_custom', extensionPath))
        .rejects
        .toMatchObject({ name: 'InvalidRequest' });
    }
    finally {
      fs.rmSync(missingDir, {
        recursive: true,
        force: true,
      });
      fs.rmSync(extensionPath, {
        recursive: true,
        force: true,
      });
    }
  });

  it('suffixes the file name when <opName>.json already exists', async () => {
    const projectPath = mkTmp('proj-');
    const extensionPath = mkTmp('ext-');

    try {
      seedTemplate(extensionPath, 'add_custom', JSON.stringify([{ op: 'placeholder' }]));
      fs.writeFileSync(path.join(projectPath, 'my_op.json'), 'existing');
      (getProjectByPath as jest.Mock).mockReturnValue({ project_path: projectPath });

      const written = await generateOpsPrototype(projectPath, 'my_op', 'add_custom', extensionPath);

      expect(written)
        .toBe(path.join(projectPath, 'my_op_1.json'));
      expect(fs.existsSync(path.join(projectPath, 'my_op.json')))
        .toBe(true);
      expect(fs.existsSync(path.join(projectPath, 'my_op_1.json')))
        .toBe(true);
    }
    finally {
      fs.rmSync(projectPath, {
        recursive: true,
        force: true,
      });
      fs.rmSync(extensionPath, {
        recursive: true,
        force: true,
      });
    }
  });

  it('throws InvalidRequest when the ops_prototype template is missing', async () => {
    const projectPath = mkTmp('proj-');
    const extensionPath = mkTmp('ext-');

    try {
      (getProjectByPath as jest.Mock).mockReturnValue({ project_path: projectPath });

      await expect(generateOpsPrototype(projectPath, 'my_op', 'missing_template', extensionPath))
        .rejects
        .toMatchObject({ name: 'InvalidRequest' });
    }
    finally {
      fs.rmSync(projectPath, {
        recursive: true,
        force: true,
      });
      fs.rmSync(extensionPath, {
        recursive: true,
        force: true,
      });
    }
  });

  it('stamps op into an object-shaped template', async () => {
    const projectPath = mkTmp('proj-');
    const extensionPath = mkTmp('ext-');

    try {
      seedTemplate(extensionPath, 'obj_tpl', JSON.stringify({
        op: 'placeholder',
        tier: 'base',
      }));
      (getProjectByPath as jest.Mock).mockReturnValue({ project_path: projectPath });

      const written = await generateOpsPrototype(projectPath, 'my_op', 'obj_tpl', extensionPath);

      expect(written)
        .toBe(path.join(projectPath, 'my_op.json'));

      const parsed = JSON.parse(fs.readFileSync(written, 'utf8')) as Record<string, unknown>;

      expect(parsed.op)
        .toBe('my_op');
      expect(parsed.tier)
        .toBe('base');
    }
    finally {
      fs.rmSync(projectPath, {
        recursive: true,
        force: true,
      });
      fs.rmSync(extensionPath, {
        recursive: true,
        force: true,
      });
    }
  });

  it('falls through to the object branch for an empty-array template (op stamp is a JSON no-op)', async () => {
    // An empty array is `typeof 'object'`, so the stamping assigns `op` onto the
    // ARRAY instance — JSON.stringify drops non-index properties, leaving the
    // written file an empty array. The branch executes; the stamp is inert.
    const projectPath = mkTmp('proj-');
    const extensionPath = mkTmp('ext-');

    try {
      seedTemplate(extensionPath, 'empty_tpl', '[]');
      (getProjectByPath as jest.Mock).mockReturnValue({ project_path: projectPath });

      const written = await generateOpsPrototype(projectPath, 'my_op', 'empty_tpl', extensionPath);

      expect(written)
        .toBe(path.join(projectPath, 'my_op.json'));

      const parsed = JSON.parse(fs.readFileSync(written, 'utf8')) as unknown;

      expect(parsed)
        .toEqual([]);
    }
    finally {
      fs.rmSync(projectPath, {
        recursive: true,
        force: true,
      });
      fs.rmSync(extensionPath, {
        recursive: true,
        force: true,
      });
    }
  });

  it('rethrows a failed template read (invalid JSON)', async () => {
    const projectPath = mkTmp('proj-');
    const extensionPath = mkTmp('ext-');

    try {
      seedTemplate(extensionPath, 'bad_tpl', '{not json');
      (getProjectByPath as jest.Mock).mockReturnValue({ project_path: projectPath });

      await expect(generateOpsPrototype(projectPath, 'my_op', 'bad_tpl', extensionPath))
        .rejects
        .toThrow(SyntaxError);
      expect(fs.existsSync(path.join(projectPath, 'my_op.json')))
        .toBe(false);
    }
    finally {
      fs.rmSync(projectPath, {
        recursive: true,
        force: true,
      });
      fs.rmSync(extensionPath, {
        recursive: true,
        force: true,
      });
    }
  });
});
