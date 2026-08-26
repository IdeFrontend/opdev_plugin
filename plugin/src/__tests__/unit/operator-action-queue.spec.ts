import {
  GLOBAL_ST_TEST_QUEUE_SCOPE,
  mergeVisibleOperatorActionQueues,
  OperatorActionQueueManager,
  resolveOperatorActionQueueScope,
  type QueueActionView,
  type QueueableActionType,
} from '@plugin/helpers/operator-action-queue';

function queueAction(
  id: string,
  actionType: QueueableActionType,
  createdAt: number,
): QueueActionView {
  return {
    id,
    actionType,
    internalState: 'queued',
    displayStatus: 'currently executed',
    isProcessAlive: false,
    createdAt,
    position: 99,
  };
}

describe('OperatorActionQueueManager', () => {
  it('resolves ST actions to the global scope and keeps other actions local', () => {
    const localScope = 'project::operator-1';

    expect(resolveOperatorActionQueueScope('stTest', localScope))
      .toBe(GLOBAL_ST_TEST_QUEUE_SCOPE);
    expect(resolveOperatorActionQueueScope('utTest', localScope))
      .toBe(localScope);
  });

  it('merges local non-ST actions with global ST actions in visible queue order', () => {
    const visible = mergeVisibleOperatorActionQueues(
      [
        queueAction('stale-local-st', 'stTest', 10),
        queueAction('local-sanitizer', 'sanitizer', 30),
      ],
      [
        queueAction('global-st', 'stTest', 20),
        queueAction('foreign-global-action', 'dumpTensor', 5),
      ],
    );

    expect(visible.map((item) => item.id))
      .toEqual([
        'global-st',
        'local-sanitizer',
      ]);
    expect(visible.map((item) => item.position))
      .toEqual([
        1,
        2,
      ]);
  });

  it('prevents overlapping ST runs after the local operator scope changes', async () => {
    const stopCurrentTask = jest.fn(async () => undefined);
    const queue = new OperatorActionQueueManager(stopCurrentTask);
    const firstScope = resolveOperatorActionQueueScope('stTest', 'project::operator-1');
    const changedScope = resolveOperatorActionQueueScope('stTest', 'project::operator-2');
    let releaseFirst!: ()=> void;
    const firstBarrier = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstRunner = jest.fn(async () => firstBarrier);
    const overlappingRunner = jest.fn(async () => undefined);

    const firstResult = await queue.enqueue(firstScope, 'stTest', {}, firstRunner);
    const overlappingResult = await queue.enqueue(changedScope, 'stTest', {}, overlappingRunner);

    expect(firstScope)
      .toBe(GLOBAL_ST_TEST_QUEUE_SCOPE);
    expect(changedScope)
      .toBe(firstScope);
    expect(firstResult)
      .toEqual({ accepted: true });
    expect(overlappingResult)
      .toEqual({
        accepted: false,
        reason: 'Action "stTest" is already queued or running',
      });
    expect(firstRunner)
      .toHaveBeenCalledTimes(1);
    expect(overlappingRunner).not.toHaveBeenCalled();

    releaseFirst();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const laterRunner = jest.fn(async () => undefined);
    const laterResult = await queue.enqueue(changedScope, 'stTest', {}, laterRunner);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(laterResult)
      .toEqual({ accepted: true });
    expect(laterRunner)
      .toHaveBeenCalledTimes(1);
  });

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

  it('stops a running ST action and does not launch the next queued action', async () => {
    const stopCurrentTask = jest.fn(async () => undefined);
    const queue = new OperatorActionQueueManager(stopCurrentTask);
    const scopeKey = 'project::operator-1';
    let releaseStTest!: ()=> void;
    const stTestBarrier = new Promise<void>((resolve) => {
      releaseStTest = resolve;
    });
    const nextRunner = jest.fn(async () => undefined);

    await queue.enqueue(scopeKey, 'stTest', {}, async () => stTestBarrier);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await queue.enqueue(scopeKey, 'dumpTensor', {}, nextRunner);

    const stopPromise = queue.stopAllAndClearQueue(scopeKey);

    releaseStTest();
    await stopPromise;

    expect(stopCurrentTask)
      .toHaveBeenCalledTimes(1);
    expect(nextRunner).not.toHaveBeenCalled();
    expect(queue.getActions(scopeKey))
      .toEqual([]);
  });

  it('reports queued items through hasAnyItems while a scope is populated', async () => {
    const queue = new OperatorActionQueueManager(jest.fn(async () => undefined));
    const scopeKey = 'project::populated';
    let releaseRunner!: ()=> void;
    const barrier = new Promise<void>((resolve) => {
      releaseRunner = resolve;
    });

    await queue.enqueue(scopeKey, 'sanitizer', {}, async () => barrier);

    expect(queue.hasAnyItems())
      .toBe(true);

    releaseRunner();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(queue.hasAnyItems())
      .toBe(false);
  });

  it('tracks the cancel generation per scope', async () => {
    const stopCurrentTask = jest.fn(async () => undefined);
    const queue = new OperatorActionQueueManager(stopCurrentTask);
    const scopeKey = 'project::generation';

    expect(queue.getScopeCancelGeneration(scopeKey))
      .toBe(0);
    expect(queue.isScopeCancelled('never-created-scope', 0))
      .toBe(true);
    expect(queue.isScopeCancelled(scopeKey, 0))
      .toBe(false);
    expect(queue.isScopeCancelled(scopeKey, 1))
      .toBe(true);

    let releaseRunner!: ()=> void;
    const barrier = new Promise<void>((resolve) => {
      releaseRunner = resolve;
    });

    await queue.enqueue(scopeKey, 'simulation', {}, async () => barrier);
    const stopPromise = queue.stopAllAndClearQueue(scopeKey);

    expect(queue.getScopeCancelGeneration(scopeKey))
      .toBe(1);
    expect(queue.isScopeCancelled(scopeKey, 0))
      .toBe(true);
    expect(queue.isScopeCancelled(scopeKey, 1))
      .toBe(false);

    releaseRunner();
    await stopPromise;
  });

  it('is a no-op for unknown or empty scopes', async () => {
    const stopCurrentTask = jest.fn(async () => undefined);
    const queue = new OperatorActionQueueManager(stopCurrentTask);

    await queue.stopAllAndClearQueue('never-created-scope');

    const scopeKey = 'project::empty';

    queue.getActions(scopeKey);
    await queue.stopAllAndClearQueue(scopeKey);

    expect(stopCurrentTask).not.toHaveBeenCalled();
  });

  it('returns false when stopping an action that is not in the scope', async () => {
    const queue = new OperatorActionQueueManager(jest.fn(async () => undefined));

    await expect(queue.stopByActionType('project::none', 'sanitizer'))
      .resolves
      .toBe(false);
  });

  it('removes a queued action via stopByActionType without touching the runner', async () => {
    const queue = new OperatorActionQueueManager(jest.fn(async () => undefined));
    const scopeKey = 'project::queued-stop';
    let releaseFirst!: ()=> void;
    const barrier = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    await queue.enqueue(scopeKey, 'sanitizer', {}, async () => barrier);
    await queue.enqueue(scopeKey, 'dumpTensor', {}, jest.fn(async () => undefined));

    await expect(queue.stopByActionType(scopeKey, 'dumpTensor'))
      .resolves
      .toBe(true);
    expect(queue.getActions(scopeKey)
      .map((action) => action.actionType))
      .toEqual(['sanitizer']);

    releaseFirst();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('cancels a running action via stopByActionType and tolerates repeat calls', async () => {
    jest.useFakeTimers();
    const stopCurrentTask = jest.fn(async () => undefined);
    const queue = new OperatorActionQueueManager(stopCurrentTask);
    const scopeKey = 'project::running-stop';
    let releaseRunner!: ()=> void;
    const barrier = new Promise<void>((resolve) => {
      releaseRunner = resolve;
    });

    await queue.enqueue(scopeKey, 'sanitizer', {}, async () => barrier);

    await expect(queue.stopByActionType(scopeKey, 'sanitizer'))
      .resolves
      .toBe(true);
    expect(stopCurrentTask)
      .toHaveBeenCalledTimes(1);
    expect(queue.getActions(scopeKey)[0]?.internalState)
      .toBe('running');

    // A second call keeps the existing cancel request and stop timer.
    await expect(queue.stopByActionType(scopeKey, 'sanitizer'))
      .resolves
      .toBe(true);
    expect(stopCurrentTask)
      .toHaveBeenCalledTimes(2);

    // The stop timeout turns the stuck item into cancel_failed.
    jest.advanceTimersByTime(10000);
    expect(queue.getActions(scopeKey)[0]?.internalState)
      .toBe('cancel_failed');

    // cancel_failed items are still stopped through the shell stop callback.
    await expect(queue.stopByActionType(scopeKey, 'sanitizer'))
      .resolves
      .toBe(true);
    expect(stopCurrentTask)
      .toHaveBeenCalledTimes(3);

    releaseRunner();
    await jest.advanceTimersByTimeAsync(1);

    expect(queue.getActions(scopeKey))
      .toEqual([]);
    jest.useRealTimers();
  });

  it('does not re-request cancellation for a running item that is already cancelled', async () => {
    jest.useFakeTimers();
    const stopCurrentTask = jest.fn(async () => undefined);
    const queue = new OperatorActionQueueManager(stopCurrentTask);
    const scopeKey = 'project::already-cancelled';
    let releaseRunner!: ()=> void;
    const barrier = new Promise<void>((resolve) => {
      releaseRunner = resolve;
    });

    await queue.enqueue(scopeKey, 'sanitizer', {}, async () => barrier);

    const firstStop = queue.stopAllAndClearQueue(scopeKey);

    expect(stopCurrentTask)
      .toHaveBeenCalledTimes(1);

    // The first stop request marks the item cancelled and arms a stop timer.
    jest.advanceTimersByTime(10000);
    expect(queue.getActions(scopeKey)[0]?.internalState)
      .toBe('cancel_failed');

    // A concurrent second stop request must not re-request cancellation.
    const secondStop = queue.stopAllAndClearQueue(scopeKey);

    expect(stopCurrentTask)
      .toHaveBeenCalledTimes(2);

    releaseRunner();
    await firstStop;
    await secondStop;

    expect(queue.getActions(scopeKey))
      .toEqual([]);
    jest.useRealTimers();
  });

  it('does not start a second drain loop while one is already processing', async () => {
    const queue = new OperatorActionQueueManager(jest.fn(async () => undefined));
    const scopeKey = 'project::drain-guard';
    let releaseFirst!: ()=> void;
    const barrier = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const secondRunner = jest.fn(async () => undefined);

    await queue.enqueue(scopeKey, 'sanitizer', {}, async () => barrier);
    await queue.enqueue(scopeKey, 'simulation', {}, secondRunner);

    expect(secondRunner).not.toHaveBeenCalled();

    releaseFirst();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(secondRunner)
      .toHaveBeenCalledTimes(1);
    expect(queue.getActions(scopeKey))
      .toEqual([]);
  });
});
