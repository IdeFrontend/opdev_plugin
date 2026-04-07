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
import { OperateTreeProvider, type OperateNodeId } from '../class/operate-tree-provider';

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

async function dispatchCheckTaskStatus(): Promise<boolean> {
  if (isAnyV2FlowEnabled()) {
    return taskMethodsV2.checkTaskStatus();
  }
  return taskMethods.checkTaskStatus();
}

async function waitUntilTaskStopped(maxWaitMs = 10000, intervalMs = 200): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    const running = await dispatchCheckTaskStatus();
    if (!running) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return !(await dispatchCheckTaskStatus());
}

export function dispatchFlowFromWebview<P>(
  nodeId: OperateNodeId,
  runner: (params: P) => Promise<void>,
): (params: P) => Promise<void | undefined> {
  return (params: P = {} as P) => {
    return OperateTreeProvider.runFlowActionFromWebviewWithParams(nodeId, runner, params);
  };
}

export function dispatchExclusiveFlowFromWebview<P>(
  nodeId: OperateNodeId,
  runner: (params: P) => Promise<void>,
): (params: P) => Promise<void | undefined> {
  return (params: P = {} as P) => {
    return OperateTreeProvider.runFlowActionFromWebviewWithParams(nodeId, async (p: P) => {
      const isRunning = await dispatchCheckTaskStatus();
      if (isRunning) {
        await dispatchStopTask();
        const stopped = await waitUntilTaskStopped();
        if (!stopped) {
          return;
        }
      }
      await runner(p);
    }, params);
  };
}

export const dispatchOnBoard = dispatchExclusiveFlowFromWebview<StartOnBoardParams>(
  'onboard',
  dispatchStartOnBoard,
);

export const dispatchSimulator = dispatchExclusiveFlowFromWebview<StartSimulateParams>(
  'simulation',
  dispatchStartSimulate,
);

export const dispatchSanitizer = dispatchExclusiveFlowFromWebview<StartSanitizerParams>(
  'sanitizer',
  dispatchRunSanitizer,
);

