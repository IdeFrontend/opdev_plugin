import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { StandardCustomDetector } from '@plugin/domain/plugins/standard-custom.detector';
import { OperatorProjectType } from '@plugin/domain/models/operator-project-type';

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sc-detect-'));
}

describe('StandardCustomDetector — nested-in-collection hardening', () => {
  it('types a sub-operator folder (even with .asc files) inside a --genop collection as definitive', async () => {
    const root = mkTmp();

    fs.writeFileSync(path.join(root, 'build.sh'), '#!/bin/bash\n./cmake.sh --genop\n');
    const subOp = path.join(root, 'add_custom');

    fs.mkdirSync(subOp);
    fs.writeFileSync(path.join(subOp, 'CMakeLists.txt'), '');
    fs.writeFileSync(path.join(subOp, 'add_custom.asc'), ''); // .asc would otherwise route to AscendPlugin

    const result = await new StandardCustomDetector()
      .detectProject(subOp);

    expect(result)
      .toEqual({
        isMatch: true,
        confidence: 'definitive',
      });
  });

  it('does not match an unrelated folder with no --genop ancestor', async () => {
    const root = mkTmp();
    const lone = path.join(root, 'lone_op');

    fs.mkdirSync(lone);
    fs.writeFileSync(path.join(lone, 'CMakeLists.txt'), '');
    fs.writeFileSync(path.join(lone, 'lone.asc'), '');

    const result = await new StandardCustomDetector()
      .detectProject(lone);

    expect(result.isMatch)
      .toBe(false);
  });

  it('keeps the collection root definitive', async () => {
    const root = mkTmp();

    fs.writeFileSync(path.join(root, 'build.sh'), '#!/bin/bash\n./cmake.sh --genop\n');

    const result = await new StandardCustomDetector()
      .detectProject(root);

    expect(result)
      .toEqual({
        isMatch: true,
        confidence: 'definitive',
      });
  });

  it('exposes STANDARD_CUSTOM as its projectType', () => {
    expect(new StandardCustomDetector().projectType)
      .toBe(OperatorProjectType.STANDARD_CUSTOM);
  });
});
