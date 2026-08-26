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
