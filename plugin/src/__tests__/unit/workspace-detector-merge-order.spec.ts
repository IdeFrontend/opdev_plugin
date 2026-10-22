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
 * GC-86 (rapid-click popup, part 1): the merged operator lists persisted by
 * the workspace detector feed the positional operator ids of the tree.
 * readdir order is not deterministic, so the merge must canonicalize the
 * order by normalized path — otherwise a rescan re-indexes operators,
 * churns tree row identities and re-targets clicks.
 */
import { WorkspaceDetectorService } from '@plugin/service/workspace-detector-service';

type SubOperatorInfo = {
  name: string;
  path: string;
  isCompiled?: boolean;
};

const merge = (WorkspaceDetectorService as unknown as {
  mergeOperators(
    existingOperators: SubOperatorInfo[],
    scannedOperators: SubOperatorInfo[],
  ): SubOperatorInfo[];
}).mergeOperators;

describe('WorkspaceDetectorService.mergeOperators order', () => {
  it('sorts a scanned list by normalized path regardless of the scan order', () => {
    const merged = merge.call(WorkspaceDetectorService, [], [
      {
        name: 'z_op',
        path: '/c/root/z_op',
      },
      {
        name: 'a_op',
        path: '/c/root/a_op',
      },
      {
        name: 'm_op',
        path: '/c/root/m_op',
      },
    ]);

    expect(merged.map((op) => op.name))
      .toEqual([
        'a_op',
        'm_op',
        'z_op',
      ]);
  });

  it('re-sorts the existing entries instead of keeping the stale order', () => {
    const merged = merge.call(WorkspaceDetectorService, [
      {
        name: 'z_op',
        path: '/c/root/z_op',
        isCompiled: true,
      },
      {
        name: 'a_op',
        path: '/c/root/a_op',
      },
    ], []);

    expect(merged.map((op) => op.name))
      .toEqual([
        'a_op',
        'z_op',
      ]);
    expect(merged[1].isCompiled)
      .toBe(true);
  });

  it('merges duplicates by path and keeps a single sorted entry', () => {
    const merged = merge.call(WorkspaceDetectorService, [
      {
        name: 'a_op',
        path: '/c/root/a_op',
        isCompiled: true,
      },
    ], [
      {
        name: 'a_op',
        path: '/c/root/a_op',
        isCompiled: false,
      },
      {
        name: 'b_op',
        path: '/c/root/b_op',
      },
    ]);

    expect(merged)
      .toHaveLength(2);
    expect(merged.map((op) => op.name))
      .toEqual([
        'a_op',
        'b_op',
      ]);
    // The existing compiled flag survives the merge of the duplicate.
    expect(merged[0].isCompiled)
      .toBe(true);
  });
});
