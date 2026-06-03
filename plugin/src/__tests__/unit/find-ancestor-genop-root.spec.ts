import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  findAncestorGenopCollectionRoot,
  hasAncestorBuildShWithGenop,
} from '@plugin/domain/plugins/detection-utils';

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'genop-root-'));
}

describe('findAncestorGenopCollectionRoot', () => {
  it('returns the collection root for a direct sub-operator', () => {
    const root = mkTmp();

    fs.writeFileSync(path.join(root, 'build.sh'), '#!/bin/bash\n./x.sh --genop\n');
    const sub = path.join(root, 'add');

    fs.mkdirSync(sub);
    expect(findAncestorGenopCollectionRoot(sub))
      .toBe(root);
  });

  it('returns the collection root for an experimental sub-operator (2 levels up)', () => {
    const root = mkTmp();

    fs.writeFileSync(path.join(root, 'build.sh'), '#!/bin/bash\n./x.sh --genop\n');
    const exp = path.join(root, 'experimental');

    fs.mkdirSync(exp);
    const sub = path.join(exp, 'add');

    fs.mkdirSync(sub);
    expect(findAncestorGenopCollectionRoot(sub))
      .toBe(root);
  });

  it('returns undefined when no ancestor has build.sh with --genop', () => {
    const root = mkTmp();
    const sub = path.join(root, 'add');

    fs.mkdirSync(sub);
    expect(findAncestorGenopCollectionRoot(sub))
      .toBeUndefined();
  });

  it('keeps hasAncestorBuildShWithGenop consistent (true when a root exists)', () => {
    const root = mkTmp();

    fs.writeFileSync(path.join(root, 'build.sh'), '--genop');
    const sub = path.join(root, 'add');

    fs.mkdirSync(sub);
    expect(hasAncestorBuildShWithGenop(sub))
      .toBe(true);
  });
});
