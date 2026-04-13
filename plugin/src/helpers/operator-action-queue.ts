export type QueueableActionType =
  | 'sanitizer'
  | 'onboard'
  | 'simulation'
  | 'utTest'
  | 'dumpTensor';

export type QueueItemState =
  | 'queued'
  | 'running'
  | 'cancel_failed';

type QueueTaskRunner = (params: unknown) => Promise<void>;
type StopCurrentTaskFn = () => Promise<void>;

interface QueueItem {
  id: string;
  actionType: QueueableActionType;
  params: unknown;
  scopeKey: string;
  state: QueueItemState;
  createdAt: number;
  startedAt?: number;
  cancelRequestedAt?: number;
  stopTimeoutAt?: number;
  isProcessAlive: boolean;
  timer?: ReturnType<typeof setTimeout>;
  runner: QueueTaskRunner;
}

interface QueueScopeState {
  items: QueueItem[];
  processing: boolean;
}

export interface QueueActionView {
  id: string;
  actionType: QueueableActionType;
  internalState: QueueItemState;
  displayStatus: 'currently executed';
  isProcessAlive: boolean;
  createdAt: number;
  startedAt?: number;
  position: number;
}

interface EnqueueResult {
  accepted: boolean;
  reason?: string;
}

const NON_TERMINAL_STATES = new Set<QueueItemState>([
  'queued',
  'running',
  'cancel_failed',
]);

export class OperatorActionQueueManager {
  private readonly scopes = new Map<string, QueueScopeState>();
  private idSeed = 0;

  constructor(
    private readonly stopCurrentTask: StopCurrentTaskFn,
    private readonly stopTimeoutMs = 10000,
  ) {}

  async enqueue<P>(
    scopeKey: string,
    actionType: QueueableActionType,
    params: P,
    runner: (params: P) => Promise<void>,
  ): Promise<EnqueueResult> {
    const scope = this.getScope(scopeKey);
    const hasDuplicate = scope.items.some((item) =>
      item.actionType === actionType && NON_TERMINAL_STATES.has(item.state));

    if (hasDuplicate) {
      return {
        accepted: false,
        reason: `Action "${actionType}" is already queued or running`,
      };
    }

    const item: QueueItem = {
      id: this.nextId(),
      actionType,
      params,
      scopeKey,
      state: 'queued',
      createdAt: Date.now(),
      isProcessAlive: false,
      runner: runner as QueueTaskRunner,
    };
    scope.items.push(item);
    void this.process(scopeKey);

    return { accepted: true };
  }

  /**
   * Drops every queued item, removes finished/stale rows, and stops the current process once if any
   * running or cancel_failed item still has a live process. Does not start another queued action.
   */
  async stopAllAndClearQueue(scopeKey: string): Promise<void> {
    const scope = this.scopes.get(scopeKey);
    if (!scope) {
      return;
    }

    for (const item of [...scope.items]) {
      if (item.state === 'queued') {
        this.removeItem(scope, item.id);
      }
    }

    for (const item of [...scope.items]) {
      if ((item.state === 'running' || item.state === 'cancel_failed') && !item.isProcessAlive) {
        this.removeItem(scope, item.id);
      }
    }

    let shouldStopProcess = false;
    for (const item of [...scope.items]) {
      if ((item.state === 'running' || item.state === 'cancel_failed') && item.isProcessAlive) {
        if (!item.cancelRequestedAt) {
          item.cancelRequestedAt = Date.now();
        }
        this.attachStopTimeout(item);
        shouldStopProcess = true;
      }
    }

    if (shouldStopProcess) {
      await this.stopCurrentTask();
    }
  }

  async stopByActionType(scopeKey: string, actionType: QueueableActionType): Promise<boolean> {
    const scope = this.getScope(scopeKey);
    const target = scope.items.find((item) => item.actionType === actionType);

    if (!target) {
      return false;
    }

    if (target.state === 'queued') {
      this.removeItem(scope, target.id);
      return true;
    }

    if ((target.state === 'running' || target.state === 'cancel_failed') && target.isProcessAlive) {
      if (!target.cancelRequestedAt) {
        target.cancelRequestedAt = Date.now();
      }
      this.attachStopTimeout(target);
      await this.stopCurrentTask();
      return true;
    }

    return false;
  }

  getActions(scopeKey: string): QueueActionView[] {
    const scope = this.getScope(scopeKey);
    return scope.items.map((item, index) => ({
      id: item.id,
      actionType: item.actionType,
      internalState: item.state,
      displayStatus: 'currently executed',
      isProcessAlive: item.isProcessAlive,
      createdAt: item.createdAt,
      startedAt: item.startedAt,
      position: index + 1,
    }));
  }

  private getScope(scopeKey: string): QueueScopeState {
    const existing = this.scopes.get(scopeKey);
    if (existing) {
      return existing;
    }
    const created: QueueScopeState = {
      items: [],
      processing: false,
    };
    this.scopes.set(scopeKey, created);
    return created;
  }

  private nextId(): string {
    this.idSeed += 1;
    return `queue_${Date.now()}_${this.idSeed}`;
  }

  private async process(scopeKey: string): Promise<void> {
    const scope = this.getScope(scopeKey);
    if (scope.processing) {
      return;
    }
    scope.processing = true;
    try {
      while (true) {
        const next = scope.items.find((item) => item.state === 'queued');
        if (!next) {
          break;
        }
        next.state = 'running';
        next.startedAt = Date.now();
        next.isProcessAlive = true;
        try {
          await next.runner(next.params);
          next.isProcessAlive = false;
          this.clearTimer(next);
          this.removeItem(scope, next.id);
        }
        catch {
          next.isProcessAlive = false;
          this.clearTimer(next);
          this.removeItem(scope, next.id);
        }
      }
    }
    finally {
      scope.processing = false;
    }
  }

  private attachStopTimeout(item: QueueItem): void {
    if (item.timer) {
      return;
    }
    item.stopTimeoutAt = Date.now() + this.stopTimeoutMs;
    item.timer = setTimeout(() => {
      if ((item.state === 'running' || item.state === 'cancel_failed') && item.isProcessAlive) {
        item.state = 'cancel_failed';
      }
      this.clearTimer(item);
    }, this.stopTimeoutMs);
  }

  private clearTimer(item: QueueItem): void {
    if (item.timer) {
      clearTimeout(item.timer);
      item.timer = undefined;
    }
    item.stopTimeoutAt = undefined;
  }

  private removeItem(scope: QueueScopeState, id: string): void {
    const idx = scope.items.findIndex((item) => item.id === id);
    if (idx !== -1) {
      const [removed] = scope.items.splice(idx, 1);
      if (removed) {
        this.clearTimer(removed);
      }
    }
  }
}
