/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import {
  enqueueCompileRun,
  registerPreemptOperatorActionQueue,
} from '@plugin/helpers/operator-flow-coordinator';

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Load a fresh copy of the coordinator so the module-level gate, preempt
 * listeners and stop-shell registration never leak between tests.
 */
function loadCoordinator(): typeof import('@plugin/helpers/operator-flow-coordinator') {
  let module: typeof import('@plugin/helpers/operator-flow-coordinator') | undefined;

  jest.isolateModules(() => {
    module = jest.requireActual('@plugin/helpers/operator-flow-coordinator');
  });

  return module!;
}

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

describe('operator-flow-coordinator gate accessors', () => {
  it('runs gated tasks without a registered preempt hook', async () => {
    const mod = loadCoordinator();

    await expect(mod.enqueueCompileRun('build', async () => 'built'))
      .resolves
      .toBe('built');
  });

  it('reports gate activity, node queue state and running shells', async () => {
    const mod = loadCoordinator();
    let releaseBuild!: ()=> void;
    const buildBarrier = new Promise<void>((resolve) => {
      releaseBuild = resolve;
    });

    expect(mod.isCompileRunQueueActive())
      .toBe(false);
    expect(mod.isCompileRunNodeQueued('run'))
      .toBe(false);
    expect(mod.hasRunningCompileRunShell())
      .toBe(false);
    expect(mod.shouldShowCompileRunStopAll())
      .toBe(false);
    expect(mod.cancelQueuedCompileRunNode('build'))
      .toBe(false);

    const build = mod.enqueueCompileRun('build', async () => buildBarrier);
    const run = mod.enqueueCompileRun('run', async () => undefined);

    expect(mod.isCompileRunQueueActive())
      .toBe(true);
    expect(mod.isCompileRunNodeQueued('run'))
      .toBe(true);
    expect(mod.hasRunningCompileRunShell())
      .toBe(true);
    expect(mod.shouldShowCompileRunStopAll())
      .toBe(true);
    expect(mod.cancelQueuedCompileRunNode('run'))
      .toBe(true);
    expect(mod.isCompileRunNodeQueued('run'))
      .toBe(false);

    releaseBuild();
    await build;
    await expect(run)
      .resolves
      .toBeUndefined();
  });

  it('reports a running run shell through hasRunningCompileRunShell', async () => {
    const mod = loadCoordinator();
    let releaseRun!: ()=> void;
    const runBarrier = new Promise<void>((resolve) => {
      releaseRun = resolve;
    });

    const run = mod.enqueueCompileRun('run', async () => runBarrier);

    expect(mod.hasRunningCompileRunShell())
      .toBe(true);

    releaseRun();
    await run;
  });

  it('streams ui state to subscribers and stops after unsubscribing', async () => {
    const mod = loadCoordinator();
    const listener = jest.fn();
    let releaseBuild!: ()=> void;
    const buildBarrier = new Promise<void>((resolve) => {
      releaseBuild = resolve;
    });

    const unsubscribe = mod.subscribeCompileRunGateUiState(listener);

    expect(listener)
      .toHaveBeenCalledWith({});

    const build = mod.enqueueCompileRun('build', async () => buildBarrier);

    expect(listener)
      .toHaveBeenLastCalledWith({ build: 'running' });

    unsubscribe();
    listener.mockClear();

    const run = mod.enqueueCompileRun('run', async () => undefined);

    expect(listener)
      .not
      .toHaveBeenCalled();

    releaseBuild();
    await build;
    await run;
  });
});

describe('stopCompileRunQueueAll', () => {
  it('stops the gate without a registered shell callback using silent notify', async () => {
    const mod = loadCoordinator();

    await expect(mod.stopCompileRunQueueAll())
      .resolves
      .toBe(false);

    let releaseBuild!: ()=> void;
    const buildBarrier = new Promise<void>((resolve) => {
      releaseBuild = resolve;
    });

    const build = mod.enqueueCompileRun('build', async () => buildBarrier);

    await expect(mod.stopCompileRunQueueAll({ notify: false }))
      .resolves
      .toBe(true);

    releaseBuild();
    await build;
  });

  it('forwards the notify flag to the registered stop-shell callback', async () => {
    const mod = loadCoordinator();
    const stopShell = jest.fn(async () => undefined);

    mod.registerCompileRunStopShellProcess(stopShell);

    let releaseBuild!: ()=> void;
    const buildBarrier = new Promise<void>((resolve) => {
      releaseBuild = resolve;
    });

    const build = mod.enqueueCompileRun('build', async () => buildBarrier);

    await mod.stopCompileRunQueueAll({ notify: false });
    expect(stopShell)
      .toHaveBeenCalledWith({ notify: false });

    // Re-arm the gate with a second build so the default notify flag applies.
    let releaseSecond!: ()=> void;
    const secondBarrier = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });

    const secondBuild = mod.enqueueCompileRun('build', async () => secondBarrier);

    await mod.stopCompileRunQueueAll();
    expect(stopShell)
      .toHaveBeenLastCalledWith({ notify: true });

    releaseBuild();
    releaseSecond();
    await build;
    await secondBuild;
  });
});

describe('preemptCompileRunQueue', () => {
  it('reports no queued run and notifies no listeners when the gate is idle', async () => {
    const mod = loadCoordinator();

    await expect(mod.preemptCompileRunQueue())
      .resolves
      .toEqual({ hadQueuedRun: false });
  });

  it('preempts the gate and reports a queued run, notifying preempt listeners', async () => {
    const mod = loadCoordinator();
    const listener = jest.fn();
    let releaseBuild!: ()=> void;
    const buildBarrier = new Promise<void>((resolve) => {
      releaseBuild = resolve;
    });

    mod.registerFlowPreemptListener(listener);
    const build = mod.enqueueCompileRun('build', async () => buildBarrier);
    const run = mod.enqueueCompileRun('run', async () => undefined);

    await expect(mod.preemptCompileRunQueue())
      .resolves
      .toEqual({ hadQueuedRun: true });
    expect(listener)
      .toHaveBeenCalledTimes(1);

    releaseBuild();
    await build;
    await expect(run)
      .resolves
      .toBeUndefined();
  });

  it('preempts a running build and reports no queued run', async () => {
    const mod = loadCoordinator();
    let releaseBuild!: ()=> void;
    const buildBarrier = new Promise<void>((resolve) => {
      releaseBuild = resolve;
    });

    const build = mod.enqueueCompileRun('build', async () => buildBarrier);

    await expect(mod.preemptCompileRunQueue())
      .resolves
      .toEqual({ hadQueuedRun: false });

    releaseBuild();
    await build;
  });

  it('stops notifying listeners after their unregister callback runs', async () => {
    const mod = loadCoordinator();
    const listener = jest.fn();
    let releaseBuild!: ()=> void;
    const buildBarrier = new Promise<void>((resolve) => {
      releaseBuild = resolve;
    });

    const unregister = mod.registerFlowPreemptListener(listener);

    unregister();

    const build = mod.enqueueCompileRun('build', async () => buildBarrier);

    await mod.preemptCompileRunQueue();
    expect(listener)
      .not
      .toHaveBeenCalled();

    releaseBuild();
    await build;
  });
});
