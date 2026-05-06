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
import { taskMethods } from '@plugin/controller/task-controller';
import { homeMethods } from '@plugin/controller/home-controller';
import { getProjectByPath } from '@plugin/domain/models/project-model';
import * as vscode from 'vscode';
import { OperateTreeProvider, type OperateNodeId } from '../class/operate-tree-provider';
import {
  OperatorActionQueueManager,
  QueueableActionType,
} from './operator-action-queue';

export async function dispatchStartBuild(params: StartBuildParams = {}): Promise<void> {
  await taskMethods.startBuild(params);
}

export async function dispatchStartRun(params: StartRunParams = {}): Promise<void> {
  await taskMethods.startRun(params);
}

export async function dispatchStartBuildExample(params: StartBuildExampleParams = {}): Promise<void> {
  await taskMethods.startBuildExample(params);
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

export async function dispatchStopTask(): Promise<void> {
  await taskMethods.stopTask();
}

const operatorActionQueue = new OperatorActionQueueManager(async () => {
  await dispatchStopTask();
});

async function getOperatorQueueScopeKey(): Promise<string> {
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  let projectScope = 'unknown';
  if (workspacePath) {
    const existingProject = getProjectByPath(workspacePath);
    if (existingProject?.id !== undefined && existingProject.id !== null) {
      projectScope = `id:${String(existingProject.id)}`;
    } else {
      const normalizedPath = workspacePath.replace(/\\/g, '/').toLowerCase();
      projectScope = `path:${normalizedPath}`;
    }
  }

  let selected = 'default';
  try {
    const ids = await homeMethods.getSelectedOperatorIds();
    if (ids && ids.length > 0) {
      selected = ids.slice().sort((a, b) => a - b).join(',');
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
  runner: (payload: P) => Promise<void>,
  onFinished?: (payload: P) => Promise<void> | void,
): Promise<void> {
  const scopeKey = await getOperatorQueueScopeKey();
  const wrappedRunner = async (payload: P): Promise<void> => {
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
  }
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
  const scopeKey = await getOperatorQueueScopeKey();
  return {
    items: operatorActionQueue.getActions(scopeKey),
  };
}

export async function dispatchStopOperatorAction(
  params: { actionType: QueueableActionType },
): Promise<void> {
  const scopeKey = await getOperatorQueueScopeKey();
  const stopped = await operatorActionQueue.stopByActionType(scopeKey, params.actionType);
  if (!stopped) {
    vscode.window.showInformationMessage('No matching queued/running action found');
  }
}

export async function dispatchStopAllOperatorActions(): Promise<void> {
  const scopeKey = await getOperatorQueueScopeKey();
  await operatorActionQueue.stopAllAndClearQueue(scopeKey);
}

export async function dispatchEnqueueNativeOperatorAction<P>(
  actionType: QueueableActionType,
  params: P,
  runner: (payload: P) => Promise<void>,
  onFinished?: (payload: P) => Promise<void> | void,
): Promise<void> {
  await enqueueQueueableAction(actionType, params, runner, onFinished);
}

export function dispatchFlowFromWebview<P>(
  nodeId: OperateNodeId,
  runner: (params: P) => Promise<void>,
): (params: P) => Promise<void | undefined> {
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

