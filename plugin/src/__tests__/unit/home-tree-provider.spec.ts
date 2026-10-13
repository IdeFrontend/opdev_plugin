/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
jest.mock('vscode', () => {
  class EventEmitter<T> {
    private listeners: Array<(value: T)=> void> = [];

    event = (listener: (value: T)=> void): { dispose: ()=> void } => {
      this.listeners.push(listener);

      return { dispose: () => undefined };
    };

    fire(value: T): void {
      this.listeners.forEach((listener) => listener(value));
    }
  }

  return { EventEmitter };
});

import { HomeTreeProvider } from '@plugin/class/home-tree-provider';

describe('HomeTreeProvider', () => {
  let provider: HomeTreeProvider;

  beforeEach(() => {
    provider = new HomeTreeProvider();
  });

  it('fires onDidChangeTreeData from refresh()', () => {
    const listener = jest.fn();

    provider.onDidChangeTreeData(listener);
    provider.refresh();

    expect(listener)
      .toHaveBeenCalledTimes(1);
  });

  it('returns the element unchanged from getTreeItem()', () => {
    const element = {} as never;

    expect(provider.getTreeItem(element))
      .toBe(element);
  });

  it('returns an empty children list so the viewsWelcome empty state renders', () => {
    expect(provider.getChildren())
      .toEqual([]);
  });
});
