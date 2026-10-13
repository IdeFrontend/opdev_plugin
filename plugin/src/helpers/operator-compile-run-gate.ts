/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
/**
 * Serializes compile (build / build example) and run actions so Run waits for an
 * in-flight compile to finish instead of racing the shared CommandExecutor (GC-24).
 */
export type CompileRunGateAction = 'build' | 'buildExample' | 'run';

export type CompileRunGateFlowNodeId = 'build' | 'run';

export type CompileRunGateFlowState = 'queued' | 'running';

export type CompileRunGateUiState = Partial<Record<CompileRunGateFlowNodeId, CompileRunGateFlowState>>;

type StateListener = (state: CompileRunGateUiState)=> void;

type StopShellProcessFn = (notify: boolean)=> Promise<void>;

export class OperatorCompileRunGate {
  private tail: Promise<void> = Promise.resolve();

  private pendingCount = 0;

  private cancelGeneration = 0;
  private readonly cancelledQueuedNodeIds = new Set<CompileRunGateFlowNodeId>();

  private readonly uiState: CompileRunGateUiState = {};

  private readonly listeners = new Set<StateListener>();

  private stopShellProcess: StopShellProcessFn | null = null;

  setStopShellProcess(fn: StopShellProcessFn): void {
    this.stopShellProcess = fn;
  }

  subscribe(listener: StateListener): ()=> void {
    this.listeners.add(listener);
    listener(this.getUiState());

    return () => {
      this.listeners.delete(listener);
    };
  }

  getUiState(): CompileRunGateUiState {
    return { ...this.uiState };
  }

  isActive(): boolean {
    return this.pendingCount > 0;
  }

  isNodeQueued(nodeId: CompileRunGateFlowNodeId): boolean {
    return this.uiState[nodeId] === 'queued';
  }

  /** Stop-all targets the compile/run gate when Run is queued behind compile. */
  shouldShowStopAll(): boolean {
    return this.uiState.run === 'queued';
  }

  async stopAll(notify = true): Promise<boolean> {
    if (!this.isActive() && Object.keys(this.uiState).length === 0) {
      return false;
    }

    const hadRunningShell = this.uiState.build === 'running' || this.uiState.run === 'running';

    this.cancelGeneration += 1;
    this.pendingCount = 0;
    this.cancelledQueuedNodeIds.clear();

    for (const key of Object.keys(this.uiState) as CompileRunGateFlowNodeId[]) {
      delete this.uiState[key];
    }

    this.tail = Promise.resolve();
    this.emitState();

    if (hadRunningShell && this.stopShellProcess) {
      await this.stopShellProcess(notify);
    }

    return true;
  }

  enqueue<T>(action: CompileRunGateAction, task: ()=> Promise<T>): Promise<T | undefined> {
    const nodeId = this.nodeIdFor(action);

    if (this.uiState[nodeId]) {
      return Promise.resolve(undefined);
    }

    const generation = this.cancelGeneration;
    const willWait = this.pendingCount > 0;

    this.pendingCount += 1;

    if (willWait) {
      if (this.uiState[nodeId] !== 'running') {
        this.setNodeState(nodeId, 'queued');
      }
    }
    else {
      this.setNodeState(nodeId, 'running');
    }

    const run = this.tail.then(async (): Promise<T | undefined> => {
      if (generation !== this.cancelGeneration) {
        return undefined;
      }

      if (willWait) {
        if (generation !== this.cancelGeneration) {
          return undefined;
        }

        if (this.cancelledQueuedNodeIds.has(nodeId)) {
          this.cancelledQueuedNodeIds.delete(nodeId);

          return undefined;
        }

        this.setNodeState(nodeId, 'running');
      }

      try {
        return await task();
      }
      finally {
        if (generation === this.cancelGeneration) {
          this.pendingCount -= 1;
          this.setNodeState(nodeId, null);
        }
      }
    });

    this.tail = run.then(
      () => undefined,
      () => undefined,
    );

    return run;
  }

  cancelQueued(nodeId: CompileRunGateFlowNodeId): boolean {
    if (this.uiState[nodeId] !== 'queued') {
      return false;
    }

    this.cancelledQueuedNodeIds.add(nodeId);
    this.setNodeState(nodeId, null);
    this.pendingCount = Math.max(0, this.pendingCount - 1);

    if (this.pendingCount === 0) {
      this.tail = Promise.resolve();
    }

    return true;
  }

  private nodeIdFor(action: CompileRunGateAction): CompileRunGateFlowNodeId {
    return action === 'build' ? 'build' : 'run';
  }

  private setNodeState(
    nodeId: CompileRunGateFlowNodeId,
    state: CompileRunGateFlowState | null,
  ): void {
    if (state === null) {
      delete this.uiState[nodeId];
    }
    else {
      this.uiState[nodeId] = state;
    }

    this.emitState();
  }

  private emitState(): void {
    const snapshot = this.getUiState();

    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
