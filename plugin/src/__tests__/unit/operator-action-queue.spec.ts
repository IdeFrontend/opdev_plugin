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
});
