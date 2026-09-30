/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
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

  it('matches via the sibling build.sh fallback when the folder itself has no genop help', async () => {
    const root = mkTmp();
    const op = path.join(root, 'regular_op');

    fs.mkdirSync(op);
    fs.writeFileSync(path.join(op, 'CMakeLists.txt'), '');
    // The sibling build.sh advertises no --genop; the layout heuristic still matches.
    fs.writeFileSync(path.join(root, 'build.sh'), '#!/bin/bash\necho no-genop\n');

    const result = await new StandardCustomDetector(async () => false)
      .detectProject(op);

    expect(result)
      .toEqual({
        isMatch: true,
        confidence: 'heuristic',
      });
  });

  it('does not match a folder without CMakeLists.txt', async () => {
    const root = mkTmp();
    const bare = path.join(root, 'bare');

    fs.mkdirSync(bare);

    const result = await new StandardCustomDetector(async () => false)
      .detectProject(bare);

    expect(result.isMatch)
      .toBe(false);
  });

  it('does not apply the layout heuristic to a CMake project with root Python entries', async () => {
    const root = mkTmp();
    const pyOp = path.join(root, 'py_op');

    fs.mkdirSync(pyOp);
    fs.writeFileSync(path.join(pyOp, 'CMakeLists.txt'), '');
    fs.writeFileSync(path.join(pyOp, 'main.py'), '');

    const result = await new StandardCustomDetector(async () => false)
      .detectProject(pyOp);

    expect(result)
      .toEqual({
        isMatch: false,
        confidence: 'heuristic',
      });
  });

  it('returns no match when none of the layout signals apply', async () => {
    const root = mkTmp();
    const plain = path.join(root, 'plain');

    fs.mkdirSync(plain);
    fs.writeFileSync(path.join(plain, 'CMakeLists.txt'), '');

    const result = await new StandardCustomDetector(async () => false)
      .detectProject(plain);

    expect(result)
      .toEqual({
        isMatch: false,
        confidence: 'heuristic',
      });
  });

  it('re-checks ancestor genop support inside the layout heuristic when the first pass missed it', async () => {
    const root = mkTmp();
    const collection = path.join(root, 'collection');
    const op = path.join(collection, 'mid', 'sub_op');

    fs.mkdirSync(collection, { recursive: true });
    fs.mkdirSync(op, { recursive: true });
    fs.writeFileSync(path.join(op, 'CMakeLists.txt'), '');
    // The genop-capable build.sh sits two levels up, so the sibling build.sh
    // fallback cannot fire before the ancestor re-check.
    fs.writeFileSync(path.join(collection, 'build.sh'), '#!/bin/bash\n');

    // Stateful checker: the direct call and the first ancestor walk report no
    // genop support; the ancestor walk repeated inside the layout heuristic
    // finally sees it, so the collection match lands as 'heuristic'.
    let calls = 0;
    const statefulSupportsGenop = async (): Promise<boolean> => {
      calls += 1;

      return calls === 3;
    };

    const result = await new StandardCustomDetector(statefulSupportsGenop)
      .detectProject(op);

    expect(result)
      .toEqual({
        isMatch: true,
        confidence: 'heuristic',
      });
  });
});
