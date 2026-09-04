import { t } from 'i18next';
import type {
  StartBuildParams,
  StartRunParams,
  StartBuildExampleParams,
  StartSimulateParams,
  StartOnBoardParams,
  StartSanitizerParams,
  StartDumpTensorParams,
  StartUtTestParams,
} from '@shared/api-types';
import type { OperatorToolOutputLabel } from '@plugin/helpers/output-channel';
import type { StartStTestParams } from '@plugin/service/st-test-service';
import { taskMethods } from '@plugin/controller/task-controller';
import { homeMethods } from '@plugin/controller/home-controller';
import * as vscode from 'vscode';
import {
  OperateTreeProvider, type OperateNodeId,
} from '../class/operate-tree-provider';
import {
  OperatorActionQueueManager,
  positionVisibleOperatorActions,
  QueueableActionType,
} from './operator-action-queue';
import {
  cancelQueuedCompileRunNode,
  hasRunningCompileRunShell,
  isCompileRunQueueActive,
  notifyFlowPreempted,
  preemptCompileRunQueue,
  registerCompileRunStopShellProcess,
  registerFlowPreemptListener,
  registerPreemptOperatorActionQueue,
  shouldShowCompileRunStopAll,
  stopCompileRunQueueAll,
  subscribeCompileRunGateUiState,
} from './operator-flow-coordinator';
import {
  stopCompileRunFlow,
  stopOperatorFlowAction,
} from './operator-flow-stop';

export {
  isCompileRunQueueActive,
  registerFlowPreemptListener,
  shouldShowCompileRunStopAll,
  stopCompileRunQueueAll,
  subscribeCompileRunGateUiState,
};

export async function dispatchStartBuild(params: StartBuildParams = {}): Promise<void> {
  await taskMethods.startBuild(params);
}

export async function dispatchStartRun(params: StartRunParams = {}): Promise<void> {
  await taskMethods.startRun(params);
}

export async function dispatchStartBuildExample(
  params: StartBuildExampleParams = {},
  outputLabel?: OperatorToolOutputLabel,
): Promise<void> {
  await taskMethods.startBuildExample(params, outputLabel);
}

export async function dispatchStartSimulate(params: StartSimulateParams = {}): Promise<void> {
  await taskMethods.startSimulate(params);
}

export async function dispatchStartOnBoard(params: StartOnBoardParams = {}): Promise<void> {
  await taskMethods.startOnBoard(params);
}

export async function dispatchRunSanitizer(params: StartSanitizerParams = {}): Promise<void> {
  await taskMethods.runSanitizer(params);
}

export async function dispatchStartDumpTensor(params: StartDumpTensorParams = {}): Promise<void> {
  await taskMethods.startDumpTensor(params);
}

export async function dispatchStartUtTest(params: StartUtTestParams = {}): Promise<void> {
  await taskMethods.startUtTest(params);
}

export async function dispatchStartStTest(
  context: vscode.ExtensionContext,
  params: StartStTestParams,
): Promise<void> {
  await taskMethods.startStTest(context, params);
}

export async function dispatchStopTask(): Promise<void> {
  await taskMethods.stopTask();
}

registerCompileRunStopShellProcess(async (options) => {
  await taskMethods.stopTask(options);
});

let suppressOperatorQueueStopNotify = false;

const operatorActionQueue = new OperatorActionQueueManager(async () => {
  await taskMethods.stopTask({ notify: !suppressOperatorQueueStopNotify });
});

async function stopOperatorActionQueueAll(options?: { notify?: boolean }): Promise<boolean> {
  const hadItems = operatorActionQueue.hasAnyItems();

  if (!hadItems) {
    return false;
  }

  if (options?.notify === false) {
    suppressOperatorQueueStopNotify = true;
  }

  try {
    await operatorActionQueue.stopAllScopes();
  }
  finally {
    if (options?.notify === false) {
      suppressOperatorQueueStopNotify = false;
    }
  }

  return true;
}

async function preemptOperatorActionQueue(): Promise<void> {
  const hadItems = await stopOperatorActionQueueAll({ notify: false });

  if (hadItems) {
    vscode.window.showWarningMessage(t('task.operatorActionPreemptedByCompileRun'));
  }

  notifyFlowPreempted();
}

registerPreemptOperatorActionQueue(preemptOperatorActionQueue);

function createFlowStopDeps() {
  return {
    stopCompileRunQueueAll,
    cancelQueuedCompileRunNode,
    hasRunningCompileRunShell,
    stopOperatorByType: async (actionType: string) => {
      const typedAction = actionType as QueueableActionType;
      const localScope = await getOperatorQueueScopeKey();

      return operatorActionQueue.stopByActionType(localScope, typedAction);
    },
    stopTask: (options?: { notify?: boolean }) => taskMethods.stopTask(options),
    notifyStoppedByUser: () => {
      vscode.window.showWarningMessage(t('task.stoppedByUser'));
    },
    notifyNoMatchingAction: () => {
      vscode.window.showInformationMessage('No matching queued/running action found');
    },
  };
}

async function getOperatorQueueScopeKey(): Promise<string> {
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  let projectScope = 'unknown';

  if (workspacePath) {
    const normalizedPath = workspacePath.replace(/\\/g, '/')
      .toLowerCase();

    projectScope = `path:${normalizedPath}`;
  }

  let selected = 'default';

  try {
    const ids = await homeMethods.getSelectedOperatorIds();

    if (ids && ids.length > 0) {
      selected = ids.slice()
        .sort((a, b) => a - b)
        .join(',');
    }
  }
  catch {
    // fall back to default operator selection
  }

  return `${projectScope}::${selected}`;
}

async function enqueueQueueableAction<P>(
  actionType: QueueableActionType,
  params: P,
  runner: (payload: P)=> Promise<void>,
  onFinished?: (payload: P)=> Promise<void> | void,
): Promise<boolean> {
  const localScope = await getOperatorQueueScopeKey();
  const scopeKey = localScope;
  const wrappedRunner = async (payload: P): Promise<void> => {
    const runGeneration = operatorActionQueue.getScopeCancelGeneration(scopeKey);

    if (operatorActionQueue.isScopeCancelled(scopeKey, runGeneration)) {
      return;
    }

    const { hadQueuedRun } = await preemptCompileRunQueue();

    if (hadQueuedRun) {
      vscode.window.showWarningMessage(t('task.queuedRunPreemptedByOperatorAction'));
    }

    if (operatorActionQueue.isScopeCancelled(scopeKey, runGeneration)) {
      return;
    }

    try {
      await runner(payload);
    }
    finally {
      if (onFinished) {
        try {
          await onFinished(payload);
        }
        catch {
          // Post-action hooks must not break queue execution flow.
        }
      }
    }
  };
  const result = await operatorActionQueue.enqueue(scopeKey, actionType, params, wrappedRunner);

  if (!result.accepted) {
    vscode.window.showWarningMessage(result.reason ?? 'Action is already queued');

    return false;
  }

  return true;
}

export async function dispatchGetOperatorActionQueueStatus(): Promise<{
  items: Array<{
    id: string;
    actionType: QueueableActionType;
    internalState: 'queued' | 'running' | 'cancel_failed';
    displayStatus: 'currently executed';
    isProcessAlive: boolean;
    createdAt: number;
    startedAt?: number;
    position: number;
  }>;
}> {
  const localScope = await getOperatorQueueScopeKey();
  const items = positionVisibleOperatorActions(operatorActionQueue.getActions(localScope));

  return { items };
}

export async function isFlowStopAllVisible(): Promise<boolean> {
  if (shouldShowCompileRunStopAll()) {
    return true;
  }

  const localScope = await getOperatorQueueScopeKey();
  const items = positionVisibleOperatorActions(operatorActionQueue.getActions(localScope));

  return items.length >= 2;
}

export async function dispatchStopOperatorAction(params: { actionType: QueueableActionType }): Promise<boolean> {
  return stopOperatorFlowAction(createFlowStopDeps(), params.actionType);
}

export async function dispatchStopAllOperatorActions(): Promise<void> {
  await stopOperatorActionQueueAll();
}

/** Stop all: always clears compile/run gate and the operator action queue. */
export async function dispatchStopAllFlowActions(): Promise<void> {
  await stopCompileRunQueueAll({ notify: true });

  suppressOperatorQueueStopNotify = true;

  try {
    await stopOperatorActionQueueAll();
  }
  finally {
    suppressOperatorQueueStopNotify = false;
  }
}

export async function dispatchStopCompileRunFlow(options?: { nodeId?: 'build' | 'run' }): Promise<boolean> {
  return stopCompileRunFlow(createFlowStopDeps(), options);
}

export async function dispatchEnqueueNativeOperatorAction<P>(
  actionType: QueueableActionType,
  params: P,
  runner: (payload: P)=> Promise<void>,
  onFinished?: (payload: P)=> Promise<void> | void,
): Promise<boolean> {
  return enqueueQueueableAction(actionType, params, runner, onFinished);
}

export function dispatchFlowFromWebview<P>(
  nodeId: OperateNodeId,
  runner: (params: P)=> Promise<void>,
): (params: P)=> Promise<void | undefined> {
  return (params: P = {} as P) => {
    return OperateTreeProvider.runFlowActionFromWebviewWithParams(nodeId, runner, params);
  };
}

export const dispatchOnBoard = dispatchFlowFromWebview<StartOnBoardParams>(
  'onboard',
  async (params) => {
    await dispatchEnqueueNativeOperatorAction('onboard', params, dispatchStartOnBoard);
  },
);

export const dispatchSimulator = dispatchFlowFromWebview<StartSimulateParams>(
  'simulation',
  async (params) => {
    await dispatchEnqueueNativeOperatorAction('simulation', params, dispatchStartSimulate);
  },
);

export const dispatchSanitizer = dispatchFlowFromWebview<StartSanitizerParams>(
  'sanitizer',
  async (params) => {
    await dispatchEnqueueNativeOperatorAction('sanitizer', params, dispatchRunSanitizer);
  },
);

export async function dispatchStTestFromWebview(
  context: vscode.ExtensionContext,
  params: StartStTestParams,
): Promise<boolean | undefined> {
  return OperateTreeProvider.runFlowActionFromWebviewWithParams(
    'stTest',
    async (payload) => {
      return dispatchEnqueueNativeOperatorAction('stTest', payload, async (queuedParams) => {
        await dispatchStartStTest(context, queuedParams);
      });
    },
    params,
  );
}
