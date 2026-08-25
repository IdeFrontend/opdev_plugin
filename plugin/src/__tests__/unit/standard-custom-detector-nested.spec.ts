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

    const result = await new StandardCustomDetector(async (dirPath) => dirPath === root)
      .detectProject(subOp);

    expect(result)
      .toEqual({
        isMatch: true,
        confidence: 'definitive',
      });
  });

  it('does not match an unrelated folder when build.sh help has no --genop option', async () => {
    const root = mkTmp();
    const lone = path.join(root, 'lone_op');

    fs.mkdirSync(lone);
    fs.writeFileSync(path.join(lone, 'CMakeLists.txt'), '');
    fs.writeFileSync(path.join(lone, 'lone.asc'), '');

    const result = await new StandardCustomDetector(async () => false)
      .detectProject(lone);

    expect(result.isMatch)
      .toBe(false);
  });

  it('uses the build.sh help capability for the collection root, not its source text', async () => {
    const root = mkTmp();

    fs.writeFileSync(path.join(root, 'build.sh'), '# --genop in a comment must not decide the type\n');

    const result = await new StandardCustomDetector(async (dirPath) => dirPath === root)
      .detectProject(root);

    expect(result)
      .toEqual({
        isMatch: true,
        confidence: 'definitive',
      });
  });

  it('keeps the structural heuristic when help does not expose --genop', async () => {
    const root = mkTmp();
    const experimental = path.join(root, 'experimental');

    fs.mkdirSync(experimental);
    fs.writeFileSync(path.join(experimental, 'CMakeLists.txt'), '');

    const result = await new StandardCustomDetector(async () => false)
      .detectProject(experimental);

    expect(result)
      .toEqual({
        isMatch: true,
        confidence: 'heuristic',
      });
  });

  it('exposes STANDARD_CUSTOM as its projectType', () => {
    expect(new StandardCustomDetector().projectType)
      .toBe(OperatorProjectType.STANDARD_CUSTOM);
  });
});
