import { OperatorActionQueueManager } from '@plugin/helpers/operator-action-queue';

describe('OperatorActionQueueManager', () => {
  it('stopAllAndClearQueue removes running items, stops shell, and waits for the runner', async () => {
    const stopCurrentTask = jest.fn(async () => undefined);
    const queue = new OperatorActionQueueManager(stopCurrentTask);

    let releaseRunner!: ()=> void;
    const runnerBarrier = new Promise<void>((resolve) => {
      releaseRunner = resolve;
    });

    let runnerFinished = false;
    const scopeKey = 'project::1';

    await queue.enqueue(scopeKey, 'sanitizer', {}, async () => {
      await runnerBarrier;
      runnerFinished = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const stopPromise = queue.stopAllAndClearQueue(scopeKey);

    expect(queue.getActions(scopeKey)[0]?.internalState)
      .toBe('running');
    expect(stopCurrentTask)
      .toHaveBeenCalledTimes(1);

    releaseRunner();
    await stopPromise;

    expect(runnerFinished)
      .toBe(true);
    expect(queue.getActions(scopeKey))
      .toEqual([]);
  });

  it('stopAllScopes clears every scope', async () => {
    const stopCurrentTask = jest.fn(async () => undefined);
    const queue = new OperatorActionQueueManager(stopCurrentTask);

    await queue.enqueue('scope-a::1', 'sanitizer', {}, async () => undefined);
    await queue.enqueue('scope-b::2', 'simulation', {}, async () => undefined);

    await queue.stopAllScopes();

    expect(queue.getActions('scope-a::1'))
      .toEqual([]);
    expect(queue.getActions('scope-b::2'))
      .toEqual([]);
    expect(queue.hasAnyItems())
      .toBe(false);
  });

  it('skips a cancelled runner without executing it', async () => {
    const stopCurrentTask = jest.fn(async () => undefined);
    const queue = new OperatorActionQueueManager(stopCurrentTask);
    const scopeKey = 'project::default';

    let firstStarted = false;
    let releaseFirst!: ()=> void;
    const firstBarrier = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    await queue.enqueue(scopeKey, 'sanitizer', {}, async () => {
      firstStarted = true;
      await firstBarrier;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    let secondStarted = false;

    await queue.enqueue(scopeKey, 'simulation', {}, async () => {
      secondStarted = true;
    });

    const stopPromise = queue.stopAllAndClearQueue(scopeKey);

    releaseFirst();
    await stopPromise;

    expect(firstStarted)
      .toBe(true);
    expect(secondStarted)
      .toBe(false);
    expect(queue.getActions(scopeKey))
      .toEqual([]);
  });
});
