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
  CompileRunGateAction,
  CompileRunGateFlowNodeId,
  CompileRunGateUiState,
  OperatorCompileRunGate,
} from './operator-compile-run-gate';

type StopShellProcessFn = (options?: { notify?: boolean })=> Promise<void>;

const compileRunGate = new OperatorCompileRunGate();

let stopShellProcess: StopShellProcessFn | null = null;

const preemptListeners = new Set<()=> void>();

export function registerFlowPreemptListener(listener: ()=> void): ()=> void {
  preemptListeners.add(listener);

  return () => {
    preemptListeners.delete(listener);
  };
}

function notifyFlowPreempted(): void {
  for (const listener of preemptListeners) {
    listener();
  }
}

export function registerCompileRunStopShellProcess(fn: StopShellProcessFn): void {
  stopShellProcess = fn;
  compileRunGate.setStopShellProcess(async (notify) => {
    await fn({ notify });
  });
}

let preemptOperatorActionQueueFn: (()=> Promise<void>) | null = null;

export function registerPreemptOperatorActionQueue(fn: ()=> Promise<void>): void {
  preemptOperatorActionQueueFn = fn;
}

export function subscribeCompileRunGateUiState(listener: (state: CompileRunGateUiState)=> void): ()=> void {
  return compileRunGate.subscribe(listener);
}

export function shouldShowCompileRunStopAll(): boolean {
  return compileRunGate.shouldShowStopAll();
}

export function isCompileRunQueueActive(): boolean {
  return compileRunGate.isActive();
}

export function isCompileRunNodeQueued(nodeId: CompileRunGateFlowNodeId): boolean {
  return compileRunGate.isNodeQueued(nodeId);
}

export function cancelQueuedCompileRunNode(nodeId: CompileRunGateFlowNodeId): boolean {
  return compileRunGate.cancelQueued(nodeId);
}

export function hasRunningCompileRunShell(): boolean {
  const state = compileRunGate.getUiState();

  return state.build === 'running' || state.run === 'running';
}

export async function enqueueCompileRun<T>(
  action: CompileRunGateAction,
  task: ()=> Promise<T>,
): Promise<T | undefined> {
  return compileRunGate.enqueue(action, async () => {
    await preemptOperatorActionQueueFn?.();

    return task();
  });
}

/** Stops the in-flight shell task and drops every pending compile/run gate item. */
export async function stopCompileRunQueueAll(options?: { notify?: boolean }): Promise<boolean> {
  if (!stopShellProcess) {
    return compileRunGate.stopAll(false);
  }

  return compileRunGate.stopAll(options?.notify ?? true);
}

/** Called when a queueable operator action is about to run. */
export async function preemptCompileRunQueue(): Promise<{ hadQueuedRun: boolean }> {
  if (!compileRunGate.isActive()) {
    return { hadQueuedRun: false };
  }

  const hadQueuedRun = compileRunGate.isNodeQueued('run');

  await compileRunGate.stopAll(false);
  notifyFlowPreempted();

  return { hadQueuedRun };
}

export { notifyFlowPreempted };
