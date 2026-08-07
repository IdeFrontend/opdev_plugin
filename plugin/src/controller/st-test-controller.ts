import { createHash } from 'node:crypto';

import { t } from 'i18next';
import * as vscode from 'vscode';

import { homeMethods } from '@plugin/controller/home-controller';
import {
  normalizeStTestModes,
  ST_TEST_MODES,
} from '@plugin/domain/services/st-test-command';
import {
  discoverStTestInputCsvFiles,
  validateStTestOperatorDirectory,
} from '@plugin/domain/utils/st-test-paths';
import { getOpDevtoolsWorkspaceConfiguration } from '@plugin/helpers/operator-project-workspace-config';
import { dispatchStTestFromWebview } from '@plugin/helpers/task-method-dispatch';
import { ConfigService } from '@plugin/service/config-service';
import type { StartStTestParams } from '@plugin/service/st-test-service';
import type {
  RunStTestOptionsParams,
  StTestArgumentsByMode,
  StTestOptionsResult,
} from '@shared/api-types';
import {
  cloneDefaultStTestArguments,
  validateStTestArgumentTokens,
  type StTestArgumentValidationResult,
} from '@shared/st-test-options';
import type { StTestMode } from '@shared/st-test-results';

export const ST_TEST_SELECTED_MODES_SETTING = 'stTest.selectedModes';

export const ST_TEST_ARGUMENTS_SETTING: Readonly<Record<StTestMode, string>> = {
  kernel: 'stTest.kernel.arguments',
  aclnn: 'stTest.aclnn.arguments',
  e2e: 'stTest.e2e.arguments',
};

type StTestOperatorContext = {
  workspaceRoot: string;
  operatorName: string;
  operatorPath: string;
  availableModes: StTestMode[];
};

type StTestControllerDependencies = {
  resolveContext: ()=> Promise<StTestOperatorContext>;
  readWorkspaceSetting: (workspaceRoot: string, relativeKey: string)=> unknown;
  persistWorkspaceSettings: (
    updates: Record<string, unknown>,
    workspaceRoot: string,
  )=> Promise<boolean>;
  createContextToken: (context: StTestOperatorContext)=> string;
  dispatch: (params: StartStTestParams)=> Promise<boolean | undefined>;
  closeOptionsPanel: ()=> void;
};

let extensionContext: vscode.ExtensionContext | undefined;

let closeStTestOptionsPanel: (()=> void) | undefined;

function defaultArgumentsByMode(): StTestArgumentsByMode {
  return {
    kernel: cloneDefaultStTestArguments('kernel'),
    aclnn: cloneDefaultStTestArguments('aclnn'),
    e2e: cloneDefaultStTestArguments('e2e'),
  };
}

async function resolveCurrentContext(): Promise<StTestOperatorContext> {
  const selectedOperators = await homeMethods.getSelectedOperatorEntries();

  if (selectedOperators.length !== 1) {
    throw new Error(t('stTest.oneOperatorRequired'));
  }

  const operator = selectedOperators[0];
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(operator.path));
  const workspaceRoot = workspaceFolder?.uri.fsPath;

  if (!workspaceRoot) {
    throw new Error(t('stTest.noWorkspace'));
  }

  try {
    validateStTestOperatorDirectory(workspaceRoot, operator.path);
    const inputsByMode = discoverStTestInputCsvFiles(operator.path);

    return {
      workspaceRoot,
      operatorName: operator.name,
      operatorPath: operator.path,
      availableModes: ST_TEST_MODES.filter((mode) => inputsByMode[mode].length > 0),
    };
  }
  catch (error) {
    const detail = error instanceof Error ? error.message : String(error);

    throw new Error(t('stTest.discoveryFailed', { error: detail }));
  }
}

function createContextToken(context: StTestOperatorContext): string {
  return createHash('sha256')
    .update(context.workspaceRoot)
    .update('\0')
    .update(context.operatorPath)
    .digest('hex');
}

function readExplicitWorkspaceSetting(workspaceRoot: string, relativeKey: string): unknown {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(workspaceRoot));
  const inspection = getOpDevtoolsWorkspaceConfiguration(workspaceFolder?.uri)
    .inspect<unknown>(relativeKey);

  return inspection?.workspaceFolderValue ?? inspection?.workspaceValue;
}

function validationError(
  mode: StTestMode,
  validation: Exclude<StTestArgumentValidationResult, { valid: true }>,
): Error {
  return new Error(t(`stTest.options.validation.${validation.code}`, {
    mode: t(`stTest.mode.${mode}`),
    index: validation.index === undefined ? undefined : validation.index + 1,
    token: validation.token,
  }));
}

export function registerStTestControllerContext(context: vscode.ExtensionContext): void {
  extensionContext = context;
}

export function registerStTestOptionsPanelCloser(closer: (()=> void) | undefined): void {
  closeStTestOptionsPanel = closer;
}

export class StTestController {
  private readonly dependencies: StTestControllerDependencies;

  constructor(dependencies: Partial<StTestControllerDependencies> = {}) {
    this.dependencies = {
      resolveContext: dependencies.resolveContext ?? resolveCurrentContext,
      readWorkspaceSetting: dependencies.readWorkspaceSetting ?? readExplicitWorkspaceSetting,
      persistWorkspaceSettings: dependencies.persistWorkspaceSettings
        ?? ((updates, workspaceRoot) => ConfigService.writeOpDevtoolsDottedSettings(updates, workspaceRoot)),
      createContextToken: dependencies.createContextToken ?? createContextToken,
      dispatch: dependencies.dispatch ?? (async (params) => {
        if (!extensionContext) {
          throw new Error('ST test controller is not initialized');
        }

        return dispatchStTestFromWebview(extensionContext, params);
      }),
      closeOptionsPanel: dependencies.closeOptionsPanel ?? (() => closeStTestOptionsPanel?.()),
    };
  }

  async loadOptions(): Promise<StTestOptionsResult> {
    const context = await this.dependencies.resolveContext();
    const defaults = defaultArgumentsByMode();
    const argumentsByMode = defaultArgumentsByMode();

    for (const mode of context.availableModes) {
      const configured = this.dependencies.readWorkspaceSetting(
        context.workspaceRoot,
        ST_TEST_ARGUMENTS_SETTING[mode],
      );
      const validation = validateStTestArgumentTokens(configured);

      if (validation.valid) {
        argumentsByMode[mode] = validation.tokens;
      }
    }

    const configuredModes = this.dependencies.readWorkspaceSetting(
      context.workspaceRoot,
      ST_TEST_SELECTED_MODES_SETTING,
    );
    const selectedModes = this.resolveSelectedModes(configuredModes, context.availableModes);

    return {
      contextToken: this.dependencies.createContextToken(context),
      operatorName: context.operatorName,
      availableModes: context.availableModes,
      selectedModes,
      argumentsByMode,
      defaultArgumentsByMode: defaults,
    };
  }

  async ensureOptionsAvailable(): Promise<void> {
    const context = await this.dependencies.resolveContext();

    if (context.availableModes.length === 0) {
      throw new Error(t('stTest.noAvailableCsv'));
    }
  }

  async runOptions(payload: RunStTestOptionsParams): Promise<void> {
    const context = await this.dependencies.resolveContext();

    if (payload?.contextToken !== this.dependencies.createContextToken(context)) {
      throw new Error(t('stTest.options.contextChanged'));
    }

    const selectedModes = this.validateSelectedModes(payload?.selectedModes, context.availableModes);
    const rawArgumentsByMode = payload?.argumentsByMode;

    if (!rawArgumentsByMode || typeof rawArgumentsByMode !== 'object' || Array.isArray(rawArgumentsByMode)) {
      throw new Error(t('stTest.options.validation.not_array', { mode: '' }));
    }

    const argumentsByMode = defaultArgumentsByMode();
    const writes: Record<string, unknown> = { [ST_TEST_SELECTED_MODES_SETTING]: selectedModes };

    for (const mode of context.availableModes) {
      const rawTokens = rawArgumentsByMode[mode]
        ?? this.dependencies.readWorkspaceSetting(
          context.workspaceRoot,
          ST_TEST_ARGUMENTS_SETTING[mode],
        )
        ?? cloneDefaultStTestArguments(mode);
      const validation = validateStTestArgumentTokens(rawTokens);

      if (!validation.valid) {
        throw validationError(mode, validation);
      }

      argumentsByMode[mode] = validation.tokens;
      writes[ST_TEST_ARGUMENTS_SETTING[mode]] = validation.tokens;
    }

    const persisted = await this.dependencies.persistWorkspaceSettings(writes, context.workspaceRoot);

    if (!persisted) {
      throw new Error(t('stTest.options.saveFailed'));
    }

    const queued = await this.dependencies.dispatch({
      workspaceRoot: context.workspaceRoot,
      operatorName: context.operatorName,
      operatorPath: context.operatorPath,
      modes: selectedModes,
      argumentsByMode,
    });

    if (!queued) {
      throw new Error(t('stTest.options.notStarted'));
    }

    this.dependencies.closeOptionsPanel();
  }

  private resolveSelectedModes(value: unknown, availableModes: readonly StTestMode[]): StTestMode[] {
    if (Array.isArray(value) && value.every((mode) => typeof mode === 'string')) {
      try {
        const available = new Set(availableModes);
        const selected = normalizeStTestModes(value)
          .filter((mode) => available.has(mode));

        if (selected.length > 0) {
          return selected;
        }
      }
      catch {
        // Invalid persisted settings fall back to a safe currently available mode.
      }
    }

    if (availableModes.includes('kernel')) {
      return ['kernel'];
    }

    return availableModes[0] ? [availableModes[0]] : [];
  }

  private validateSelectedModes(value: unknown, availableModes: readonly StTestMode[]): StTestMode[] {
    if (!Array.isArray(value) || !value.every((mode) => typeof mode === 'string')) {
      throw new Error(t('stTest.options.validation.modes'));
    }

    let selectedModes: StTestMode[];

    try {
      selectedModes = normalizeStTestModes(value);
    }
    catch {
      throw new Error(t('stTest.options.validation.unavailableMode'));
    }

    if (selectedModes.length === 0) {
      throw new Error(t('stTest.options.validation.modes'));
    }

    const available = new Set(availableModes);

    if (selectedModes.some((mode) => !available.has(mode))) {
      throw new Error(t('stTest.options.validation.unavailableMode'));
    }

    return selectedModes;
  }
}

const stTestController = new StTestController();

export const stTestMethods = {
  ensureOptionsAvailable: () => stTestController.ensureOptionsAvailable(),
  loadOptions: () => stTestController.loadOptions(),
  runOptions: (payload: RunStTestOptionsParams) => stTestController.runOptions(payload),
};
