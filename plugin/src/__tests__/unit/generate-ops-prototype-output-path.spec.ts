jest.mock('@plugin/domain/models/project-model', () => ({ getProjectById: jest.fn() }));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getProjectById } from '@plugin/domain/models/project-model';
import { generateOpsPrototype } from '@plugin/domain/services/ops-prototype';

function mkTmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('generateOpsPrototype output-path override', () => {
  it('writes <opName>.json into the explicit outputPath, not the project path', async () => {
    const projectPath = mkTmp('proj-');
    const outputPath = mkTmp('subop-');
    const extensionPath = mkTmp('ext-');

    const tplDir = path.join(extensionPath, 'out/templates/ops_prototype');

    fs.mkdirSync(tplDir, { recursive: true });
    fs.writeFileSync(path.join(tplDir, 'add_custom.json'), JSON.stringify([{ op: 'placeholder' }]));

    (getProjectById as jest.Mock).mockReturnValue({
      id: 7,
      project_path: projectPath,
    });

    const written = await generateOpsPrototype(7, 'my_op', 'add_custom', extensionPath, outputPath);

    expect(written)
      .toBe(path.join(outputPath, 'my_op.json'));
    expect(fs.existsSync(path.join(outputPath, 'my_op.json')))
      .toBe(true);
    expect(fs.existsSync(path.join(projectPath, 'my_op.json')))
      .toBe(false);
  });

  it('falls back to the project path when no outputPath is given', async () => {
    const projectPath = mkTmp('proj-');
    const extensionPath = mkTmp('ext-');
    const tplDir = path.join(extensionPath, 'out/templates/ops_prototype');

    fs.mkdirSync(tplDir, { recursive: true });
    fs.writeFileSync(path.join(tplDir, 'add_custom.json'), JSON.stringify([{ op: 'placeholder' }]));

    (getProjectById as jest.Mock).mockReturnValue({
      id: 8,
      project_path: projectPath,
    });

    const written = await generateOpsPrototype(8, 'fallback_op', 'add_custom', extensionPath);

    expect(written)
      .toBe(path.join(projectPath, 'fallback_op.json'));
    expect(fs.existsSync(path.join(projectPath, 'fallback_op.json')))
      .toBe(true);
  });
});
