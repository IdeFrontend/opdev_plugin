/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { PermanentStorage } from '@plugin/class/permanent-storage';

type ExtensionContextLike = ConstructorParameters<typeof PermanentStorage>[0];

interface MockGlobalState {
  update: jest.Mock;
  get: jest.Mock;
  keys: jest.Mock;
}

function createContext(initial: Record<string, unknown> = {}) {
  const map = new Map<string, unknown>(Object.entries(initial));

  const globalState: MockGlobalState = {
    update: jest.fn(async (key: string, value: unknown) => {
      if (value === undefined) {
        map.delete(key);
      }
      else {
        map.set(key, value);
      }
    }),
    get: jest.fn((key: string, defaultValue?: unknown) => (map.has(key) ? map.get(key) : defaultValue)),
    keys: jest.fn(() => [...map.keys()]),
  };

  return {
    context: { globalState } as unknown as ExtensionContextLike,
    globalState,
  };
}

describe('PermanentStorage', () => {
  it('getInstance returns undefined before setInstance', () => {
    expect(PermanentStorage.getInstance())
      .toBeUndefined();
  });

  it('setInstance stores the singleton that getInstance returns', () => {
    const { context } = createContext();

    PermanentStorage.setInstance(context);

    expect(PermanentStorage.getInstance())
      .toBeDefined();
  });

  it('set stores a value and get returns it', async () => {
    const { context } = createContext();
    const storage = new PermanentStorage(context);

    await storage.set('soc', 'ascend910b');
    await storage.set('count', 3);

    expect(storage.get('soc'))
      .toBe('ascend910b');
    expect(storage.get('count'))
      .toBe(3);
  });

  it('get falls back to the default value when the key is missing', () => {
    const { context } = createContext();
    const storage = new PermanentStorage(context);

    expect(storage.get('missing', 'fallback'))
      .toBe('fallback');
    expect(storage.get('missing'))
      .toBeUndefined();
  });

  it('get returns the stored value instead of the default', async () => {
    const { context } = createContext({ cached: 'value' });
    const storage = new PermanentStorage(context);

    expect(storage.get('cached', 'default'))
      .toBe('value');
  });

  it('has reports whether a key exists', async () => {
    const { context } = createContext({ present: 1 });
    const storage = new PermanentStorage(context);

    expect(storage.has('present'))
      .toBe(true);
    expect(storage.has('absent'))
      .toBe(false);
  });

  it('delete removes the key', async () => {
    const { context } = createContext({ toRemove: 'x' });
    const storage = new PermanentStorage(context);

    await storage.delete('toRemove');

    expect(storage.has('toRemove'))
      .toBe(false);
    expect(storage.get('toRemove', 'gone'))
      .toBe('gone');
  });

  it('keys lists every stored key', async () => {
    const { context } = createContext({
      a: 1,
      b: 2,
    });
    const storage = new PermanentStorage(context);

    await storage.set('c', 3);

    expect([...storage.keys()].sort())
      .toEqual([
        'a',
        'b',
        'c',
      ]);
  });

  it('clear deletes every stored key', async () => {
    const { context } = createContext({
      a: 1,
      b: 2,
    });
    const storage = new PermanentStorage(context);

    await storage.clear();

    expect(storage.keys())
      .toHaveLength(0);
  });

  it('getAll returns an object with all key-value pairs', async () => {
    const { context } = createContext({
      a: 1,
      b: 'two',
    });
    const storage = new PermanentStorage(context);

    await storage.set('c', true);

    expect(storage.getAll())
      .toEqual({
        a: 1,
        b: 'two',
        c: true,
      });
  });

  it('setMultiple stores every entry', async () => {
    const { context } = createContext();
    const storage = new PermanentStorage(context);

    await storage.setMultiple({
      x: '1',
      y: '2',
    });

    expect(storage.getAll())
      .toEqual({
        x: '1',
        y: '2',
      });
  });

  it('getMultiple returns values for the requested keys only', async () => {
    const { context } = createContext({
      a: 1,
      b: 2,
      c: 3,
    });
    const storage = new PermanentStorage(context);

    expect(storage.getMultiple([
      'a',
      'c',
      'nope',
    ]))
      .toEqual({
        a: 1,
        c: 3,
        nope: undefined,
      });
  });
});
