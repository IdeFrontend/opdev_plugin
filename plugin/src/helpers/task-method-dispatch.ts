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
import { taskMethodsV2 } from '@plugin-v2/presentation/controllers-v2';
import { getFeatureFlag } from '@plugin/feature-flags';
import { homeMethods } from '@plugin/controller/home-controller';
import * as vscode from 'vscode';
import { OperateTreeProvider, type OperateNodeId } from '../class/operate-tree-provider';
import {
  OperatorActionQueueManager,
  QueueableActionType,
} from './operator-action-queue';

function isAnyV2FlowEnabled(): boolean {
  return (
    getFeatureFlag('USE_V2_BUILD') ||
    getFeatureFlag('USE_V2_RUN') ||
    getFeatureFlag('USE_V2_BUILD_EXAMPLE') ||
    getFeatureFlag('USE_V2_SIMULATE') ||
    getFeatureFlag('USE_V2_ON_BOARD') ||
    getFeatureFlag('USE_V2_SANITIZER') ||
    getFeatureFlag('USE_V2_DUMP_TENSOR') ||
    getFeatureFlag('USE_V2_UT_TEST')
  );
}

export async function dispatchStartBuild(params: StartBuildParams = {}): Promise<void> {
  if (getFeatureFlag('USE_V2_BUILD')) {
    await taskMethodsV2.startBuild(params);
    return;
  }
  await taskMethods.startBuild(params);
}

export async function dispatchStartRun(params: StartRunParams = {}): Promise<void> {
  if (getFeatureFlag('USE_V2_RUN')) {
    await taskMethodsV2.startRun(params);
    return;
  }
  await taskMethods.startRun(params);
}

export async function dispatchStartBuildExample(params: StartBuildExampleParams = {}): Promise<void> {
  if (getFeatureFlag('USE_V2_BUILD_EXAMPLE')) {
    await taskMethodsV2.startBuildExample(params);
    return;
  }
  await taskMethods.startBuildExample(params);
}

export async function dispatchStartSimulate(params: StartSimulateParams = {}): Promise<void> {
  if (getFeatureFlag('USE_V2_SIMULATE')) {
    await taskMethodsV2.startSimulate(params);
    return;
  }
  await taskMethods.startSimulate(params);
}

export async function dispatchStartOnBoard(params: StartOnBoardParams = {}): Promise<void> {
  if (getFeatureFlag('USE_V2_ON_BOARD')) {
    await taskMethodsV2.startOnBoard(params);
    return;
  }
  await taskMethods.startOnBoard(params);
}

export async function dispatchRunSanitizer(params: StartSanitizerParams = {}): Promise<void> {
  if (getFeatureFlag('USE_V2_SANITIZER')) {
    await taskMethodsV2.runSanitizer(params);
    return;
  }
  await taskMethods.runSanitizer(params);
}

export async function dispatchStartDumpTensor(params: StartDumpTensorParams = {}): Promise<void> {
  if (getFeatureFlag('USE_V2_DUMP_TENSOR')) {
    await taskMethodsV2.startDumpTensor(params);
    return;
  }
  await taskMethods.startDumpTensor(params);
}

export async function dispatchStartUtTest(params: StartUtTestParams = {}): Promise<void> {
  if (getFeatureFlag('USE_V2_UT_TEST')) {
    await taskMethodsV2.startUtTest(params);
    return;
  }
  await taskMethods.startUtTest(params);
}

export async function dispatchStopTask(): Promise<void> {
  if (isAnyV2FlowEnabled()) {
    await taskMethodsV2.stopTask();
    return;
  }
  await taskMethods.stopTask();
}

const operatorActionQueue = new OperatorActionQueueManager(async () => {
  await dispatchStopTask();
});

async function getOperatorQueueScopeKey(): Promise<string> {
  let projectId = 'unknown';
  try {
    const id = await homeMethods.getProjectId();
    if (id) {
      projectId = String(id);
    }
  }
  catch {
    // fall back to unknown project id
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

  return `${projectId}::${selected}`;
}

async function enqueueQueueableAction<P>(
  actionType: QueueableActionType,
  params: P,
  runner: (payload: P) => Promise<void>,
): Promise<void> {
  const scopeKey = await getOperatorQueueScopeKey();
  const result = await operatorActionQueue.enqueue(scopeKey, actionType, params, runner);
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
): Promise<void> {
  await enqueueQueueableAction(actionType, params, runner);
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

