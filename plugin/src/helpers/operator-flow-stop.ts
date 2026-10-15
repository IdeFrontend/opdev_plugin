/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
export type FlowStopDeps = {
  stopCompileRunQueueAll: (options?: { notify?: boolean })=> Promise<boolean>;
  cancelQueuedCompileRunNode: (nodeId: 'build' | 'run')=> boolean;
  hasRunningCompileRunShell: ()=> boolean;
  stopOperatorByType: (actionType: string)=> Promise<boolean>;
  stopTask: (options?: { notify?: boolean })=> Promise<boolean>;
  notifyStoppedByUser: ()=> void;
  notifyNoMatchingAction: ()=> void;
};

/**
 * Stop build/run flow: clear the compile/run gate, then kill any live shell (e.g. a
 * queueable action that preempted compile/run but left the build row showing Stop).
 */
export async function stopCompileRunFlow(
  deps: FlowStopDeps,
  options?: { nodeId?: 'build' | 'run' },
): Promise<boolean> {
  if (options?.nodeId === 'run' && deps.hasRunningCompileRunShell()) {
    const cancelledQueuedRun = deps.cancelQueuedCompileRunNode('run');

    if (cancelledQueuedRun) {
      return true;
    }
  }

  const hadRunningShell = deps.hasRunningCompileRunShell();
  const stoppedGate = await deps.stopCompileRunQueueAll({ notify: false });
  const stoppedShell = await deps.stopTask({ notify: false });

  if (stoppedGate || stoppedShell) {
    if (stoppedShell || hadRunningShell) {
      deps.notifyStoppedByUser();
    }

    return true;
  }

  return false;
}

/**
 * Stop a queueable operator action, or kill the live shell when that row is stale after
 * compile/run preempted the operator queue.
 */
export async function stopOperatorFlowAction(
  deps: FlowStopDeps,
  actionType: string,
): Promise<boolean> {
  const stoppedQueue = await deps.stopOperatorByType(actionType);

  if (stoppedQueue) {
    return true;
  }

  const stoppedShell = await deps.stopTask({ notify: false });

  if (stoppedShell) {
    await deps.stopCompileRunQueueAll({ notify: false });
    deps.notifyStoppedByUser();

    return true;
  }

  deps.notifyNoMatchingAction();

  return false;
}
