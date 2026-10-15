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
  stopCompileRunFlow,
  stopOperatorFlowAction,
} from '@plugin/helpers/operator-flow-stop';

describe('operator-flow-stop coordination', () => {
  const notifyStoppedByUser = jest.fn();
  const notifyNoMatchingAction = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function deps(overrides: Partial<{
    stopCompileRunQueueAll: jest.Mock;
    cancelQueuedCompileRunNode: jest.Mock;
    hasRunningCompileRunShell: jest.Mock;
    stopOperatorByType: jest.Mock;
    stopTask: jest.Mock;
  }> = {}) {
    return {
      stopCompileRunQueueAll: overrides.stopCompileRunQueueAll ?? jest.fn(async () => false),
      cancelQueuedCompileRunNode: overrides.cancelQueuedCompileRunNode ?? jest.fn(() => false),
      hasRunningCompileRunShell: overrides.hasRunningCompileRunShell ?? jest.fn(() => false),
      stopOperatorByType: overrides.stopOperatorByType ?? jest.fn(async () => false),
      stopTask: overrides.stopTask ?? jest.fn(async () => false),
      notifyStoppedByUser,
      notifyNoMatchingAction,
    };
  }

  describe('stopCompileRunFlow', () => {
    it('kills a live shell when compile/run gate was already preempted (sanitizer running)', async () => {
      const stopTask = jest.fn(async () => true);
      const stopCompileRunQueueAll = jest.fn(async () => false);

      const stopped = await stopCompileRunFlow(deps({
        stopCompileRunQueueAll,
        stopTask,
      }));

      expect(stopped)
        .toBe(true);
      expect(stopCompileRunQueueAll)
        .toHaveBeenCalledWith({ notify: false });
      expect(stopTask)
        .toHaveBeenCalledWith({ notify: false });
      expect(notifyStoppedByUser)
        .toHaveBeenCalledTimes(1);
      expect(notifyNoMatchingAction).not.toHaveBeenCalled();
    });

    it('clears queued compile/run without showing no-running-task when shell is idle', async () => {
      const stopped = await stopCompileRunFlow(deps({
        stopCompileRunQueueAll: jest.fn(async () => true),
        stopTask: jest.fn(async () => false),
      }));

      expect(stopped)
        .toBe(true);
      expect(notifyStoppedByUser).not.toHaveBeenCalled();
      expect(notifyNoMatchingAction).not.toHaveBeenCalled();
    });

    it('shows stopped-by-user when gate stop owned a running build shell', async () => {
      const stopped = await stopCompileRunFlow(deps({
        hasRunningCompileRunShell: jest.fn(() => true),
        stopCompileRunQueueAll: jest.fn(async () => true),
        stopTask: jest.fn(async () => false),
      }));

      expect(stopped)
        .toBe(true);
      expect(notifyStoppedByUser)
        .toHaveBeenCalledTimes(1);
      expect(notifyNoMatchingAction).not.toHaveBeenCalled();
    });

    it('cancels queued run without stopping active build when stopping run row', async () => {
      const stopCompileRunQueueAll = jest.fn(async () => false);
      const stopTask = jest.fn(async () => false);
      const cancelQueuedCompileRunNode = jest.fn(() => true);
      const hasRunningCompileRunShell = jest.fn(() => true);

      const stopped = await stopCompileRunFlow(
        deps({
          stopCompileRunQueueAll,
          stopTask,
          cancelQueuedCompileRunNode,
          hasRunningCompileRunShell,
        }),
        { nodeId: 'run' },
      );

      expect(stopped)
        .toBe(true);
      expect(cancelQueuedCompileRunNode)
        .toHaveBeenCalledWith('run');
      expect(stopCompileRunQueueAll).not.toHaveBeenCalled();
      expect(stopTask).not.toHaveBeenCalled();
      expect(notifyStoppedByUser).not.toHaveBeenCalled();
      expect(notifyNoMatchingAction).not.toHaveBeenCalled();
    });

    it('is a silent no-op when both queues and shell are already idle', async () => {
      const stopped = await stopCompileRunFlow(deps());

      expect(stopped)
        .toBe(false);
      expect(notifyStoppedByUser).not.toHaveBeenCalled();
      expect(notifyNoMatchingAction).not.toHaveBeenCalled();
    });
  });

  describe('stopOperatorFlowAction', () => {
    it('stops via operator queue when the action is still registered', async () => {
      const stopOperatorByType = jest.fn(async () => true);
      const stopTask = jest.fn(async () => false);

      const stopped = await stopOperatorFlowAction(
        deps({
          stopOperatorByType,
          stopTask,
        }),
        'sanitizer',
      );

      expect(stopped)
        .toBe(true);
      expect(stopOperatorByType)
        .toHaveBeenCalledWith('sanitizer');
      expect(stopTask).not.toHaveBeenCalled();
      expect(notifyNoMatchingAction).not.toHaveBeenCalled();
    });

    it('kills compile shell when operator queue was preempted but sanitizer row still shows Stop', async () => {
      const stopCompileRunQueueAll = jest.fn(async () => false);
      const stopTask = jest.fn(async () => true);

      const stopped = await stopOperatorFlowAction(
        deps({
          stopCompileRunQueueAll,
          stopTask,
        }),
        'sanitizer',
      );

      expect(stopped)
        .toBe(true);
      expect(stopCompileRunQueueAll)
        .toHaveBeenCalledWith({ notify: false });
      expect(stopTask)
        .toHaveBeenCalledWith({ notify: false });
      expect(notifyStoppedByUser)
        .toHaveBeenCalledTimes(1);
      expect(notifyNoMatchingAction).not.toHaveBeenCalled();
    });

    it('reports no matching action only when neither queue nor shell has work', async () => {
      const stopped = await stopOperatorFlowAction(deps(), 'simulation');

      expect(stopped)
        .toBe(false);
      expect(notifyNoMatchingAction)
        .toHaveBeenCalledTimes(1);
      expect(notifyStoppedByUser).not.toHaveBeenCalled();
    });
  });
});
