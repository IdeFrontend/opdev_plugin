import { OperatorCompileRunGate } from '@plugin/helpers/operator-compile-run-gate';

describe('OperatorCompileRunGate', () => {
  it('runs tasks one at a time in enqueue order', async () => {
    const gate = new OperatorCompileRunGate();
    const order: string[] = [];

    const first = gate.enqueue('build', async () => {
      order.push('first-start');
      await new Promise((resolve) => setTimeout(resolve, 30));
      order.push('first-end');
    });

    const second = gate.enqueue('run', async () => {
      order.push('second-start');
      order.push('second-end');
    });

    await Promise.all([
      first,
      second,
    ]);

    expect(order)
      .toEqual([
        'first-start',
        'first-end',
        'second-start',
        'second-end',
      ]);
  });

  it('continues the queue after a task throws', async () => {
    const gate = new OperatorCompileRunGate();
    const order: string[] = [];

    const failing = gate.enqueue('build', async () => {
      order.push('fail');
      throw new Error('compile failed');
    });

    const next = gate.enqueue('run', async () => {
      order.push('next');
    });

    await expect(failing).rejects.toThrow('compile failed');
    await next;

    expect(order)
      .toEqual([
        'fail',
        'next',
      ]);
  });

  it('shows build running and run queued while compile is in flight', async () => {
    const gate = new OperatorCompileRunGate();
    const states: Array<ReturnType<OperatorCompileRunGate['getUiState']>> = [];

    gate.subscribe((state) => {
      states.push({ ...state });
    });

    let releaseBuild!: ()=> void;
    const buildBarrier = new Promise<void>((resolve) => {
      releaseBuild = resolve;
    });

    const build = gate.enqueue('build', async () => {
      await buildBarrier;
    });

    expect(gate.getUiState())
      .toEqual({ build: 'running' });
    expect(gate.shouldShowStopAll())
      .toBe(false);

    const run = gate.enqueue('run', async () => undefined);

    expect(gate.getUiState())
      .toEqual({
        build: 'running',
        run: 'queued',
      });
    expect(gate.shouldShowStopAll())
      .toBe(true);
    expect(states)
      .toContainEqual({
        build: 'running',
        run: 'queued',
      });

    releaseBuild();
    await build;
    await run;

    expect(gate.getUiState())
      .toEqual({});
    expect(gate.shouldShowStopAll())
      .toBe(false);
  });

  it('skips duplicate actions for the same running node', async () => {
    const gate = new OperatorCompileRunGate();

    let releaseFirstBuild!: ()=> void;
    const firstBuildBarrier = new Promise<void>((resolve) => {
      releaseFirstBuild = resolve;
    });

    let secondBuildStarted = false;
    const firstBuild = gate.enqueue('build', async () => {
      await firstBuildBarrier;
    });
    const secondBuild = gate.enqueue('build', async () => {
      secondBuildStarted = true;
    });

    expect(gate.getUiState())
      .toEqual({ build: 'running' });

    releaseFirstBuild();
    await firstBuild;
    await secondBuild;

    expect(secondBuildStarted)
      .toBe(false);
    expect(gate.getUiState())
      .toEqual({});
  });

  it('allows run to queue behind build but skips duplicate queued run', async () => {
    const gate = new OperatorCompileRunGate();

    let releaseBuild!: ()=> void;
    const buildBarrier = new Promise<void>((resolve) => {
      releaseBuild = resolve;
    });

    let runStarts = 0;
    const build = gate.enqueue('build', async () => {
      await buildBarrier;
    });
    const firstRun = gate.enqueue('run', async () => {
      runStarts += 1;
    });
    const duplicateRun = gate.enqueue('run', async () => {
      runStarts += 1;
    });

    expect(gate.getUiState())
      .toEqual({
        build: 'running',
        run: 'queued',
      });

    releaseBuild();
    await build;
    await firstRun;
    await duplicateRun;

    expect(runStarts)
      .toBe(1);
    expect(gate.getUiState())
      .toEqual({});
  });

  it('stopAll cancels the active task and drops queued run', async () => {
    const gate = new OperatorCompileRunGate();
    const stopShell = jest.fn(async () => undefined);

    gate.setStopShellProcess(stopShell);

    let releaseBuild!: ()=> void;
    const buildBarrier = new Promise<void>((resolve) => {
      releaseBuild = resolve;
    });

    let runStarted = false;
    const build = gate.enqueue('build', async () => {
      await buildBarrier;
    });
    const run = gate.enqueue('run', async () => {
      runStarted = true;
    });

    await gate.stopAll(false);

    expect(stopShell)
      .toHaveBeenCalledWith(false);
    expect(gate.getUiState())
      .toEqual({});
    expect(gate.isActive())
      .toBe(false);

    releaseBuild();
    await build;
    await run;

    expect(runStarted)
      .toBe(false);
  });

  it('cancelQueued drops only the queued run while build keeps running', async () => {
    const gate = new OperatorCompileRunGate();

    let releaseBuild!: ()=> void;
    const buildBarrier = new Promise<void>((resolve) => {
      releaseBuild = resolve;
    });

    let runStarted = false;
    const build = gate.enqueue('build', async () => {
      await buildBarrier;
    });
    const run = gate.enqueue('run', async () => {
      runStarted = true;
    });

    expect(gate.getUiState())
      .toEqual({
        build: 'running',
        run: 'queued',
      });
    expect(gate.cancelQueued('run'))
      .toBe(true);
    expect(gate.isNodeQueued('run'))
      .toBe(false);
    expect(gate.getUiState())
      .toEqual({ build: 'running' });

    releaseBuild();
    await build;
    await run;

    expect(runStarted)
      .toBe(false);
    expect(gate.getUiState())
      .toEqual({});
  });
});
