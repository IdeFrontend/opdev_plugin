import { t } from 'i18next';
import {
  computed,
  reactive,
  readonly,
  shallowRef,
} from 'vue';

import {
  loadStTestOptions,
  runStTestOptions,
} from '@web/apis/ops';
import type {
  StTestArgumentsByMode,
  StTestOptionsResult,
} from '@shared/api-types';
import {
  formatStTestPreviewToken,
  validateStTestArgumentTokens,
  type StTestArgumentValidationCode,
} from '@shared/st-test-options';
import type { StTestMode } from '@shared/st-test-results';

function emptyArgumentsByMode(): StTestArgumentsByMode {
  return {
    kernel: [],
    aclnn: [],
    e2e: [],
  };
}

function validationMessage(code: StTestArgumentValidationCode, index?: number): string {
  return t(
    `stTest.options.validation.${code}`,
    { index: index === undefined ? undefined : index + 1 },
  );
}

export function useStTestOptions() {
  const options = shallowRef<StTestOptionsResult>();
  const loading = shallowRef(false);
  const running = shallowRef(false);
  const globalError = shallowRef('');
  const selectedModes = shallowRef<StTestMode[]>([]);
  const argumentsByMode = reactive<StTestArgumentsByMode>(emptyArgumentsByMode());
  const defaultsByMode = reactive<StTestArgumentsByMode>(emptyArgumentsByMode());

  const availableModes = computed(() => options.value?.availableModes ?? []);
  const operatorName = computed(() => options.value?.operatorName ?? '');
  const modeErrors = computed<Partial<Record<StTestMode, string>>>(() => {
    const errors: Partial<Record<StTestMode, string>> = {};

    for (const mode of availableModes.value) {
      const validation = validateStTestArgumentTokens(argumentsByMode[mode]);

      if (!validation.valid) {
        errors[mode] = validationMessage(validation.code, validation.index);
      }
    }

    return errors;
  });
  const canRun = computed(() => (
    !loading.value
    && !running.value
    && selectedModes.value.length > 0
    && Object.keys(modeErrors.value).length === 0
  ));
  const commandPreviews = computed(() => selectedModes.value.map((mode) => {
    const tokens = [
      'python',
      '-m',
      'ttk',
      mode,
      '-i',
      '<input.csv>',
      '-o',
      '<result.csv>',
      '--plugin',
      '<tests>',
      ...argumentsByMode[mode],
    ];

    return tokens.map(formatStTestPreviewToken)
      .join(' ');
  }));

  async function load(): Promise<void> {
    loading.value = true;
    globalError.value = '';

    try {
      const loaded = await loadStTestOptions();

      options.value = loaded;
      selectedModes.value = [...loaded.selectedModes];

      for (const mode of [
        'kernel',
        'aclnn',
        'e2e',
      ] as const) {
        argumentsByMode[mode] = [...loaded.argumentsByMode[mode]];
        defaultsByMode[mode] = [...loaded.defaultArgumentsByMode[mode]];
      }
    }
    catch (error) {
      globalError.value = error instanceof Error ? error.message : String(error);
    }
    finally {
      loading.value = false;
    }
  }

  function setModeSelected(mode: StTestMode, selected: boolean): void {
    const next = new Set(selectedModes.value);

    if (selected) {
      next.add(mode);
    }
    else {
      next.delete(mode);
    }

    selectedModes.value = availableModes.value.filter((candidate) => next.has(candidate));
    globalError.value = '';
  }

  function setModeArguments(mode: StTestMode, tokens: string[]): void {
    argumentsByMode[mode] = [...tokens];
    globalError.value = '';
  }

  function resetModeArguments(mode: StTestMode): void {
    argumentsByMode[mode] = [...defaultsByMode[mode]];
    globalError.value = '';
  }

  async function run(): Promise<void> {
    if (!canRun.value) {
      if (selectedModes.value.length === 0) {
        globalError.value = t('stTest.options.validation.modes');
      }

      return;
    }

    running.value = true;
    globalError.value = '';

    try {
      await runStTestOptions({
        contextToken: options.value?.contextToken ?? '',
        selectedModes: [...selectedModes.value],
        argumentsByMode: {
          kernel: [...argumentsByMode.kernel],
          aclnn: [...argumentsByMode.aclnn],
          e2e: [...argumentsByMode.e2e],
        },
      });
    }
    catch (error) {
      globalError.value = error instanceof Error ? error.message : String(error);
    }
    finally {
      running.value = false;
    }
  }

  return {
    options: readonly(options),
    loading: readonly(loading),
    running: readonly(running),
    globalError: readonly(globalError),
    selectedModes: readonly(selectedModes),
    argumentsByMode: readonly(argumentsByMode),
    defaultsByMode: readonly(defaultsByMode),
    availableModes,
    operatorName,
    modeErrors,
    canRun,
    commandPreviews,
    load,
    setModeSelected,
    setModeArguments,
    resetModeArguments,
    run,
  };
}
