import {
  enqueueCompileRun,
  registerPreemptOperatorActionQueue,
} from '@plugin/helpers/operator-flow-coordinator';

describe('enqueueCompileRun operator preempt timing', () => {
  it('preempts the operator queue when the gated task actually starts, not at enqueue', async () => {
    const preempt = jest.fn(async () => undefined);

    registerPreemptOperatorActionQueue(preempt);

    let releaseBuild!: ()=> void;
    const buildBarrier = new Promise<void>((resolve) => {
      releaseBuild = resolve;
    });

    const build = enqueueCompileRun('build', async () => {
      await buildBarrier;
    });

    const preemptCallsBeforeRunEnqueue = preempt.mock.calls.length;

    const run = enqueueCompileRun('run', async () => {
      return 'ran';
    });

    expect(preempt.mock.calls.length)
      .toBe(preemptCallsBeforeRunEnqueue);

    releaseBuild();
    await build;
    await run;

    expect(preempt.mock.calls.length)
      .toBeGreaterThan(preemptCallsBeforeRunEnqueue);
  });
});
