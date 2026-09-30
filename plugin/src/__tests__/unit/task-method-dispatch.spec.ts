/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
jest.mock('i18next', () => ({ t: (key: string) => key }));

let mockWorkspaceFolders: Array<{ uri: { fsPath: string } }> | undefined = [{ uri: { fsPath: 'C:\\Work\\Proj' } }];

jest.mock('vscode', () => ({
  window: {
    showWarningMessage: jest.fn(),
    showInformationMessage: jest.fn(),
  },
  workspace: {
    get workspaceFolders() {
      return mockWorkspaceFolders;
    },
  },
}));

jest.mock('@plugin/controller/task-controller', () => ({
  taskMethods: {
    startBuild: jest.fn(async () => undefined),
    startRun: jest.fn(async () => undefined),
    startBuildExample: jest.fn(async () => undefined),
    startSimulate: jest.fn(async () => undefined),
    startOnBoard: jest.fn(async () => undefined),
    runSanitizer: jest.fn(async () => undefined),
    startDumpTensor: jest.fn(async () => undefined),
    startUtTest: jest.fn(async () => undefined),
    startStTest: jest.fn(async () => undefined),
    stopTask: jest.fn(async () => false),
  },
}));

jest.mock('@plugin/controller/home-controller', () => ({ homeMethods: { getSelectedOperatorIds: jest.fn(async () => undefined) } }));

jest.mock('@plugin/class/operate-tree-provider', () => ({ OperateTreeProvider: { runFlowActionFromWebviewWithParams: jest.fn(async () => undefined) } }));

jest.mock('@plugin/helpers/operator-flow-coordinator', () => ({
  registerCompileRunStopShellProcess: jest.fn(),
  registerFlowPreemptListener: jest.fn(() => () => undefined),
  registerPreemptOperatorActionQueue: jest.fn(),
  preemptCompileRunQueue: jest.fn(async () => ({ hadQueuedRun: false })),
  notifyFlowPreempted: jest.fn(),
  shouldShowCompileRunStopAll: jest.fn(() => false),
  stopCompileRunQueueAll: jest.fn(async () => false),
  cancelQueuedCompileRunNode: jest.fn(() => false),
  hasRunningCompileRunShell: jest.fn(() => false),
  isCompileRunQueueActive: jest.fn(() => false),
  subscribeCompileRunGateUiState: jest.fn(() => () => undefined),
}));

type DispatchModule = typeof import('@plugin/helpers/task-method-dispatch');

let dispatch: DispatchModule;
let taskMethods: Record<string, jest.Mock>;
let homeMethods: { getSelectedOperatorIds: jest.Mock };
let coordinator: Record<string, jest.Mock>;
let runFlowActionFromWebviewWithParams: jest.Mock;
let showWarningMessage: jest.Mock;
let showInformationMessage: jest.Mock;

function barrier() {
  let release!: ()=> void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });

  return {
    promise,
    release,
  };
}

const flushQueue = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  jest.resetModules();
  mockWorkspaceFolders = [{ uri: { fsPath: 'C:\\Work\\Proj' } }];
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- fresh module instance per test
  taskMethods = require('@plugin/controller/task-controller').taskMethods;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- fresh module instance per test
  homeMethods = require('@plugin/controller/home-controller').homeMethods;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- fresh module instance per test
  coordinator = require('@plugin/helpers/operator-flow-coordinator');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- fresh module instance per test
  runFlowActionFromWebviewWithParams = require('@plugin/class/operate-tree-provider').OperateTreeProvider.runFlowActionFromWebviewWithParams;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- fresh module instance per test
  const vscodeMock = require('vscode');

  showWarningMessage = vscodeMock.window.showWarningMessage;
  showInformationMessage = vscodeMock.window.showInformationMessage;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- fresh module instance per test
  dispatch = require('@plugin/helpers/task-method-dispatch');
});

describe('task-method-dispatch', () => {
  describe('dispatch passthroughs', () => {
    it.each([
      [
        'dispatchStartBuild',
        'startBuild',
      ],
      [
        'dispatchStartRun',
        'startRun',
      ],
      [
        'dispatchStartBuildExample',
        'startBuildExample',
      ],
      [
        'dispatchStartSimulate',
        'startSimulate',
      ],
      [
        'dispatchStartOnBoard',
        'startOnBoard',
      ],
      [
        'dispatchRunSanitizer',
        'runSanitizer',
      ],
      [
        'dispatchStartDumpTensor',
        'startDumpTensor',
      ],
      [
        'dispatchStartUtTest',
        'startUtTest',
      ],
    ] as const)('%s forwards its params to taskMethods.%s', async (dispatchName, methodName) => {
      await (dispatch as unknown as Record<string, (params: unknown)=> Promise<void>>)[dispatchName]({ extra: 1 });

      // dispatchStartBuildExample threads an optional output-label argument.
      const expectedArgs = dispatchName === 'dispatchStartBuildExample'
        ? [
          { extra: 1 },
          undefined,
        ]
        : [{ extra: 1 }];

      expect(taskMethods[methodName])
        .toHaveBeenCalledWith(...expectedArgs);
    });

    it.each([
      'dispatchStartBuild',
      'dispatchStartRun',
      'dispatchStartBuildExample',
      'dispatchStartSimulate',
      'dispatchStartOnBoard',
      'dispatchRunSanitizer',
      'dispatchStartDumpTensor',
      'dispatchStartUtTest',
    ])('%s defaults to empty params', async (dispatchName) => {
      await (dispatch as unknown as Record<string, ()=> Promise<void>>)[dispatchName]();

      const methodName = dispatchName.replace('dispatch', '')
        .replace(/^./, (c) => c.toLowerCase());

      const expectedArgs = dispatchName === 'dispatchStartBuildExample'
        ? [
          {},
          undefined,
        ]
        : [{}];

      expect(taskMethods[methodName])
        .toHaveBeenCalledWith(...expectedArgs);
    });

    it('dispatchStartStTest forwards the context alongside params', async () => {
      const context = { subscriptions: [] } as never;

      await dispatch.dispatchStartStTest(context, { project: 'p1' });

      expect(taskMethods.startStTest)
        .toHaveBeenCalledWith(context, { project: 'p1' });
    });

    it('dispatchStopTask calls taskMethods.stopTask', async () => {
      await dispatch.dispatchStopTask();

      expect(taskMethods.stopTask)
        .toHaveBeenCalled();
    });

    it('re-exports compile/run gate state helpers from the coordinator', () => {
      expect(dispatch.isCompileRunQueueActive)
        .toBe(coordinator.isCompileRunQueueActive);
      expect(dispatch.shouldShowCompileRunStopAll)
        .toBe(coordinator.shouldShowCompileRunStopAll);
      expect(dispatch.stopCompileRunQueueAll)
        .toBe(coordinator.stopCompileRunQueueAll);
      expect(dispatch.subscribeCompileRunGateUiState)
        .toBe(coordinator.subscribeCompileRunGateUiState);
      expect(dispatch.registerFlowPreemptListener)
        .toBe(coordinator.registerFlowPreemptListener);
    });
  });

  describe('compile/run stop shell registration', () => {
    it('registers a stop-shell callback that forwards to stopTask', async () => {
      const stopShell = coordinator.registerCompileRunStopShellProcess.mock.calls[0][0] as
      (options?: { notify?: boolean })=> Promise<void>;

      await stopShell({ notify: false });
      expect(taskMethods.stopTask)
        .toHaveBeenCalledWith({ notify: false });

      await stopShell();
      expect(taskMethods.stopTask.mock.calls[1])
        .toEqual([undefined]);
    });
  });

  describe('operator action queue', () => {
    it('enqueues and executes the runner with the payload', async () => {
      const runner = jest.fn(async () => undefined);
      const accepted = await dispatch.dispatchEnqueueNativeOperatorAction('onboard', { a: 1 }, runner);

      expect(accepted)
        .toBe(true);
      await flushQueue();
      expect(runner)
        .toHaveBeenCalledWith({ a: 1 });
    });

    it('rejects a duplicate action already queued or running', async () => {
      const b = barrier();

      await expect(dispatch.dispatchEnqueueNativeOperatorAction('sanitizer', { run: 1 }, jest.fn(async () => b.promise)))
        .resolves.toBe(true);

      const second = await dispatch.dispatchEnqueueNativeOperatorAction('sanitizer', { run: 2 }, jest.fn(async () => undefined));

      expect(second)
        .toBe(false);
      expect(showWarningMessage)
        .toHaveBeenCalledWith('Action "sanitizer" is already queued or running');
      b.release();
    });

    it('runs the onFinished hook and swallows its errors', async () => {
      const runner = jest.fn(async () => undefined);
      const onFinished = jest.fn(async () => {
        throw new Error('hook failed');
      });

      await expect(dispatch.dispatchEnqueueNativeOperatorAction('onboard', { x: 1 }, runner, onFinished))
        .resolves.toBe(true);
      await flushQueue();
      expect(runner)
        .toHaveBeenCalledWith({ x: 1 });
      expect(onFinished)
        .toHaveBeenCalledWith({ x: 1 });
    });

    it('warns when the operator action preempts a queued compile/run', async () => {
      coordinator.preemptCompileRunQueue.mockResolvedValue({ hadQueuedRun: true });

      await dispatch.dispatchEnqueueNativeOperatorAction('onboard', {}, jest.fn(async () => undefined));
      await flushQueue();
      expect(showWarningMessage)
        .toHaveBeenCalledWith('task.queuedRunPreemptedByOperatorAction');
    });

    it('skips the runner when the scope is cancelled while preempting compile/run', async () => {
      let preemptStarted = false;
      let releasePreempt!: ()=> void;

      coordinator.preemptCompileRunQueue.mockImplementation(() => {
        preemptStarted = true;

        return new Promise((resolve) => {
          releasePreempt = resolve;
        });
      });

      const runner = jest.fn(async () => undefined);

      await expect(dispatch.dispatchEnqueueNativeOperatorAction('onboard', { a: 1 }, runner))
        .resolves.toBe(true);
      expect(preemptStarted)
        .toBe(true);

      const stopPromise = dispatch.dispatchStopAllOperatorActions();

      releasePreempt();
      await stopPromise;
      expect(runner).not.toHaveBeenCalled();
    });

    it('stops the runner when the queue scope is cancelled while preempting compile/run', async () => {
      let releasePreempt!: ()=> void;

      coordinator.preemptCompileRunQueue.mockImplementation(() => new Promise((resolve) => {
        releasePreempt = () => resolve({ hadQueuedRun: false });
      }));

      const runner = jest.fn(async () => undefined);

      await expect(dispatch.dispatchEnqueueNativeOperatorAction('onboard', { a: 1 }, runner))
        .resolves.toBe(true);

      const stopPromise = dispatch.dispatchStopAllOperatorActions();

      releasePreempt();
      await stopPromise;
      expect(runner).not.toHaveBeenCalled();
    });

    it('skips the runner when the scope generation is stale before the run starts', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- fresh module instance per test
      const { OperatorActionQueueManager } = require('@plugin/helpers/operator-action-queue');
      const generationSpy = jest.spyOn(OperatorActionQueueManager.prototype, 'getScopeCancelGeneration');

      // Scope was cancelled before the run began (stale generation).
      generationSpy.mockReturnValue(999);

      const runner = jest.fn(async () => undefined);

      await expect(dispatch.dispatchEnqueueNativeOperatorAction('onboard', { a: 1 }, runner))
        .resolves.toBe(true);
      await flushQueue();
      expect(runner)
        .not
        .toHaveBeenCalled();
    });

    it('falls back to a generic message when the rejection carries no reason', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- fresh module instance per test
      const { OperatorActionQueueManager } = require('@plugin/helpers/operator-action-queue');
      const enqueueSpy = jest.spyOn(OperatorActionQueueManager.prototype, 'enqueue');

      enqueueSpy.mockResolvedValue({
        accepted: false,
        reason: undefined as never,
      });

      await expect(dispatch.dispatchEnqueueNativeOperatorAction('onboard', { a: 1 }, jest.fn(async () => undefined)))
        .resolves.toBe(false);
      expect(showWarningMessage)
        .toHaveBeenCalledWith('Action is already queued');
    });

    it('merges local and global stTest actions with positions', async () => {
      const localBarrier = barrier();
      const globalBarrier = barrier();

      await dispatch.dispatchEnqueueNativeOperatorAction('onboard', {}, jest.fn(async () => localBarrier.promise));
      await dispatch.dispatchEnqueueNativeOperatorAction('stTest', { test: 1 }, jest.fn(async () => globalBarrier.promise));

      const status = await dispatch.dispatchGetOperatorActionQueueStatus();

      expect(status.items.map((item) => item.actionType)
        .sort())
        .toEqual([
          'onboard',
          'stTest',
        ]);
      expect(status.items.map((item) => item.position)
        .sort((a, b2) => a - b2))
        .toEqual([
          1,
          2,
        ]);
      localBarrier.release();
      globalBarrier.release();
    });

    it('keeps stTest items visible even when the local scope cannot be resolved', async () => {
      homeMethods.getSelectedOperatorIds.mockRejectedValue(new Error('boom'));
      mockWorkspaceFolders = undefined;
      const globalBarrier = barrier();

      await dispatch.dispatchEnqueueNativeOperatorAction('stTest', { test: 1 }, jest.fn(async () => globalBarrier.promise));

      const status = await dispatch.dispatchGetOperatorActionQueueStatus();

      expect(status.items.map((item) => item.actionType))
        .toEqual(['stTest']);
      globalBarrier.release();
    });

    it('uses the selected operator ids (sorted) as part of the local scope', async () => {
      homeMethods.getSelectedOperatorIds.mockResolvedValue([
        2,
        1,
      ]);
      const b = barrier();

      await dispatch.dispatchEnqueueNativeOperatorAction('utTest', {}, jest.fn(async () => b.promise));

      const status = await dispatch.dispatchGetOperatorActionQueueStatus();

      expect(status.items.map((item) => item.actionType))
        .toEqual(['utTest']);
      b.release();
    });
  });

  describe('isFlowStopAllVisible', () => {
    it('shows stop-all when the compile/run gate asks for it', async () => {
      coordinator.shouldShowCompileRunStopAll.mockReturnValue(true);

      await expect(dispatch.isFlowStopAllVisible()).resolves.toBe(true);
    });

    it('shows stop-all when two operator actions are visible', async () => {
      const b = barrier();

      await dispatch.dispatchEnqueueNativeOperatorAction('onboard', {}, jest.fn(async () => b.promise));
      await dispatch.dispatchEnqueueNativeOperatorAction('simulation', {}, jest.fn(async () => undefined));

      await expect(dispatch.isFlowStopAllVisible()).resolves.toBe(true);
      b.release();
    });

    it('hides stop-all for a single operator action', async () => {
      const b = barrier();

      await dispatch.dispatchEnqueueNativeOperatorAction('onboard', {}, jest.fn(async () => b.promise));

      await expect(dispatch.isFlowStopAllVisible()).resolves.toBe(false);
      b.release();
    });
  });

  describe('stop operator actions', () => {
    it('stops a queued operator action and removes it from the queue', async () => {
      const b = barrier();

      await dispatch.dispatchEnqueueNativeOperatorAction('onboard', {}, jest.fn(async () => b.promise));
      await dispatch.dispatchEnqueueNativeOperatorAction('simulation', {}, jest.fn(async () => undefined));

      await expect(dispatch.dispatchStopOperatorAction({ actionType: 'simulation' }))
        .resolves.toBe(true);

      const status = await dispatch.dispatchGetOperatorActionQueueStatus();

      expect(status.items.map((item) => item.actionType))
        .toEqual(['onboard']);
      b.release();
    });

    it('kills the compile/run shell and notifies when the operator action is stale', async () => {
      taskMethods.stopTask.mockResolvedValue(true);

      await expect(dispatch.dispatchStopOperatorAction({ actionType: 'sanitizer' }))
        .resolves.toBe(true);
      expect(coordinator.stopCompileRunQueueAll)
        .toHaveBeenCalledWith({ notify: false });
      expect(showWarningMessage)
        .toHaveBeenCalledWith('task.stoppedByUser');
    });

    it('reports when no matching action exists', async () => {
      await expect(dispatch.dispatchStopOperatorAction({ actionType: 'sanitizer' }))
        .resolves.toBe(false);
      expect(showInformationMessage)
        .toHaveBeenCalledWith('No matching queued/running action found');
      expect(showWarningMessage).not.toHaveBeenCalled();
    });

    it('stops all operator actions notifying the running task', async () => {
      const b = barrier();

      await dispatch.dispatchEnqueueNativeOperatorAction('onboard', {}, jest.fn(async () => b.promise));

      const stopPromise = dispatch.dispatchStopAllOperatorActions();

      b.release();
      await stopPromise;
      expect(taskMethods.stopTask)
        .toHaveBeenCalledWith({ notify: true });
      expect(showWarningMessage).not.toHaveBeenCalled();
    });

    it('does not touch stopTask when the queue is empty', async () => {
      await dispatch.dispatchStopAllOperatorActions();

      expect(taskMethods.stopTask).not.toHaveBeenCalled();
    });

    it('suppresses the stop notification during dispatchStopAllFlowActions and restores it after', async () => {
      const b1 = barrier();

      await dispatch.dispatchEnqueueNativeOperatorAction('onboard', {}, jest.fn(async () => b1.promise));

      const stopAllPromise = dispatch.dispatchStopAllFlowActions();

      b1.release();
      await stopAllPromise;
      expect(coordinator.stopCompileRunQueueAll)
        .toHaveBeenCalledWith({ notify: true });
      expect(taskMethods.stopTask)
        .toHaveBeenCalledWith({ notify: false });

      const b2 = barrier();

      await dispatch.dispatchEnqueueNativeOperatorAction('simulation', {}, jest.fn(async () => b2.promise));

      const stopPromise = dispatch.dispatchStopAllOperatorActions();

      b2.release();
      await stopPromise;
      expect(taskMethods.stopTask)
        .toHaveBeenCalledWith({ notify: true });
    });

    it('preempts the operator queue when compile/run takes over', async () => {
      const preempt = coordinator.registerPreemptOperatorActionQueue.mock.calls[0][0] as ()=> Promise<void>;
      const b = barrier();

      await dispatch.dispatchEnqueueNativeOperatorAction('onboard', {}, jest.fn(async () => b.promise));

      const preemptPromise = preempt();

      b.release();
      await preemptPromise;
      expect(taskMethods.stopTask)
        .toHaveBeenCalledWith({ notify: false });
      expect(showWarningMessage)
        .toHaveBeenCalledWith('task.operatorActionPreemptedByCompileRun');
      expect(coordinator.notifyFlowPreempted)
        .toHaveBeenCalled();
    });

    it('notifies preemption even when the queue was empty', async () => {
      const preempt = coordinator.registerPreemptOperatorActionQueue.mock.calls[0][0] as ()=> Promise<void>;

      await preempt();

      expect(taskMethods.stopTask).not.toHaveBeenCalled();
      expect(showWarningMessage).not.toHaveBeenCalled();
      expect(coordinator.notifyFlowPreempted)
        .toHaveBeenCalled();
    });
  });

  describe('dispatchStopCompileRunFlow', () => {
    it('is a silent no-op when nothing is running', async () => {
      await expect(dispatch.dispatchStopCompileRunFlow())
        .resolves.toBe(false);
      expect(showWarningMessage).not.toHaveBeenCalled();
    });

    it('notifies stopped-by-user when the gate stop owned a running shell', async () => {
      coordinator.hasRunningCompileRunShell.mockReturnValue(true);
      coordinator.stopCompileRunQueueAll.mockResolvedValue(true);

      await expect(dispatch.dispatchStopCompileRunFlow())
        .resolves.toBe(true);
      expect(showWarningMessage)
        .toHaveBeenCalledWith('task.stoppedByUser');
    });

    it('cancels the queued run row without stopping the active build', async () => {
      coordinator.hasRunningCompileRunShell.mockReturnValue(true);
      coordinator.cancelQueuedCompileRunNode.mockReturnValue(true);

      await expect(dispatch.dispatchStopCompileRunFlow({ nodeId: 'run' }))
        .resolves.toBe(true);
      expect(coordinator.cancelQueuedCompileRunNode)
        .toHaveBeenCalledWith('run');
      expect(coordinator.stopCompileRunQueueAll).not.toHaveBeenCalled();
      expect(taskMethods.stopTask).not.toHaveBeenCalled();
    });
  });

  describe('webview flow dispatch', () => {
    it('routes onboard actions through the flow tree with queueing', async () => {
      await dispatch.dispatchOnBoard({ project: 'p1' });

      expect(runFlowActionFromWebviewWithParams)
        .toHaveBeenCalledWith('onboard', expect.any(Function), { project: 'p1' });

      const runner = runFlowActionFromWebviewWithParams.mock.calls[0][1] as (params: unknown)=> Promise<boolean>;

      await runner({ project: 'p1' });
      await flushQueue();
      expect(taskMethods.startOnBoard)
        .toHaveBeenCalledWith({ project: 'p1' });
    });

    it('routes simulator actions through the flow tree', async () => {
      await dispatch.dispatchSimulator({ sim: true });

      const runner = runFlowActionFromWebviewWithParams.mock.calls[0][1] as (params: unknown)=> Promise<boolean>;

      await runner({ sim: true });
      await flushQueue();
      expect(taskMethods.startSimulate)
        .toHaveBeenCalledWith({ sim: true });
    });

    it('routes sanitizer actions through the flow tree', async () => {
      await dispatch.dispatchSanitizer({ mode: 'full' });

      const runner = runFlowActionFromWebviewWithParams.mock.calls[0][1] as (params: unknown)=> Promise<boolean>;

      await runner({ mode: 'full' });
      await flushQueue();
      expect(taskMethods.runSanitizer)
        .toHaveBeenCalledWith({ mode: 'full' });
    });

    it('defaults webview flow params to an empty object', async () => {
      await dispatch.dispatchOnBoard();

      expect(runFlowActionFromWebviewWithParams)
        .toHaveBeenCalledWith('onboard', expect.any(Function), {});
    });

    it('routes stTest from webview with the extension context', async () => {
      const context = { subscriptions: [] } as never;

      await dispatch.dispatchStTestFromWebview(context, { project: 'p1' });

      expect(runFlowActionFromWebviewWithParams)
        .toHaveBeenCalledWith('stTest', expect.any(Function), { project: 'p1' });

      const runner = runFlowActionFromWebviewWithParams.mock.calls[0][1] as (params: unknown)=> Promise<boolean>;

      await runner({ project: 'p1' });
      await flushQueue();
      expect(taskMethods.startStTest)
        .toHaveBeenCalledWith(context, { project: 'p1' });
    });
  });
});
