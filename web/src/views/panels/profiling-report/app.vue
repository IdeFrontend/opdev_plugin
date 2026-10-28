<script setup lang="ts">
import {
  computed, onMounted, onUnmounted, ref, shallowRef, watch,
} from 'vue';
import i18next, { t } from 'i18next';
import {
  ProfilingReport,
  type ResolveSourceFile,
  type ResolveSourceFileRequest,
} from '@huawei/profiling-report';

import { vscode } from '@web/utils/vscode';
import { useProfilingReportTheme } from './composables/useProfilingReportTheme';

/** Members `<ProfilingReport>` exposes for the host (`defineExpose` in the library). */
type ProfilingReportHandle = {
  selectedOperatorId?: string | null;
};

const { theme } = useProfilingReportTheme();

/** IDE/extension language injected into the webview; library accepts en* / zh* prefixes. */
const locale = (i18next.resolvedLanguage ?? 'en').toLowerCase();

const source = shallowRef<Uint8Array | null>(null);
const fileName = ref('');
const filePath = ref('');
const collectedAt = ref('');
/**
 * Sudu worker URL passed to `<ProfilingReport>`. Host sends an asWebviewUri /
 * Vite URL; we re-wrap it as a same-origin `blob:` URL so `new Worker(...)`
 * succeeds under the webview CSP (direct vscode-webview:// workers often fail).
 */
const suduWorkerUrl = ref<string | undefined>(undefined);
/** Last blob: URL we minted — revoked when replaced or on unmount. */
let suduWorkerBlobUrl: string | undefined;
/** Bumps on each load/materialize so stale async work cannot revoke a newer blob. */
let suduWorkerGeneration = 0;
const isLoading = ref(true);
const error = ref<string | null>(null);
const reportRef = ref<ProfilingReportHandle | null>(null);
const performanceHintsPublished = ref(false);

/** In-flight host FS resolves keyed by requestId (see `resolveSourceFile`). */
const pendingSourceResolves = new Map<string, (text: string | null)=> void>();
let sourceResolveSeq = 0;

function revokeSuduWorkerBlob(): void {
  if (suduWorkerBlobUrl) {
    URL.revokeObjectURL(suduWorkerBlobUrl);
    suduWorkerBlobUrl = undefined;
  }
}

/**
 * Fetch the host-served worker script and expose it as a blob: URL for Sudu.
 * Falls back to the host URL if fetch fails (playground / permissive hosts).
 * Returns `undefined` when a newer load superseded this call.
 */
async function materializeSuduWorkerUrl(
  hostUrl: string,
  generation: number,
): Promise<string | undefined> {
  try {
    const response = await fetch(hostUrl);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const code = await response.text();

    if (generation !== suduWorkerGeneration) {
      return undefined;
    }

    const blob = new Blob([code], { type: 'text/javascript' });

    revokeSuduWorkerBlob();
    suduWorkerBlobUrl = URL.createObjectURL(blob);

    return suduWorkerBlobUrl;
  }
  catch {
    if (generation !== suduWorkerGeneration) {
      return undefined;
    }

    return hostUrl;
  }
}

/**
 * The host mirrors the report's selected operator into the Problems view, so
 * the published hints always describe the operator the user is looking at.
 * A flat report (single operator) exposes no id and nothing has to be sent.
 */
watch(
  () => reportRef.value?.selectedOperatorId,
  (operatorId) => {
    if (typeof operatorId !== 'string' || operatorId.length === 0) {
      return;
    }

    try {
      vscode.postMessage({
        command: 'profilingReportOperatorChanged',
        operatorId,
      });
    }
    catch {
      // Host not ready yet: the host republishes hints on its own triggers.
    }
  },
  { immediate: true },
);

/** Report identity for the cannbot payload (name / absolute path / collection time). */
const reportMeta = computed(() => ({
  name: fileName.value,
  path: filePath.value,
  collectedAt: collectedAt.value,
}));

const handleMessage = (e: MessageEvent) => {
  const message = e.data;

  if (message?.command === 'performanceHintsPublishedChanged' && typeof message.published === 'boolean') {
    performanceHintsPublished.value = message.published;

    return;
  }

  if (message?.command === 'resolveSourceFileResult' && typeof message.requestId === 'string') {
    const settle = pendingSourceResolves.get(message.requestId);

    if (settle) {
      pendingSourceResolves.delete(message.requestId);
      settle(typeof message.text === 'string' ? message.text : null);
    }

    return;
  }

  if (message?.command === 'loadProfilingReportFailed' && typeof message.error === 'string') {
    suduWorkerGeneration += 1;
    revokeSuduWorkerBlob();
    suduWorkerUrl.value = undefined;
    source.value = null;
    error.value = message.error;
    isLoading.value = false;

    return;
  }

  if (message?.command === 'loadProfilingReport' && typeof message.uri === 'string') {
    void (async () => {
      const generation = ++suduWorkerGeneration;

      try {
        isLoading.value = true;
        error.value = null;
        // Hide the previous report until the worker URL is ready so
        // <ProfilingReport> never mounts with the library default `/sudu/worker.js`.
        source.value = null;

        const response = await fetch(message.uri);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const buffer = await response.arrayBuffer();

        if (generation !== suduWorkerGeneration) {
          return;
        }

        const hostWorkerUrl = typeof message.suduWorkerUrl === 'string' && message.suduWorkerUrl
          ? message.suduWorkerUrl
          : undefined;
        const resolvedWorkerUrl = hostWorkerUrl
          ? await materializeSuduWorkerUrl(hostWorkerUrl, generation)
          : undefined;

        if (generation !== suduWorkerGeneration) {
          return;
        }

        // Assign worker URL before source so the first mount sees the blob URL.
        suduWorkerUrl.value = resolvedWorkerUrl;
        fileName.value = message.fileName ?? '';
        filePath.value = typeof message.filePath === 'string' ? message.filePath : '';
        collectedAt.value = typeof message.collectedAt === 'string' ? message.collectedAt : '';
        source.value = new Uint8Array(buffer);
        isLoading.value = false;
      }
      catch {
        if (generation !== suduWorkerGeneration) {
          return;
        }

        source.value = null;
        suduWorkerUrl.value = undefined;
        revokeSuduWorkerBlob();
        error.value = t('profilingReport.fetchFailed');
        isLoading.value = false;
      }
    })();
  }
};

/**
 * Optional library hook: ask the extension host to read Ascend C when the pack
 * has correlation embeds but no `.asc` text (profiling-report #175).
 */
const resolveSourceFile: ResolveSourceFile = (request: ResolveSourceFileRequest) => {
  const requestId = `resolve-source-${++sourceResolveSeq}`;

  return new Promise<string | null>((resolve) => {
    pendingSourceResolves.set(requestId, resolve);

    try {
      vscode.postMessage({
        command: 'resolveSourceFile',
        requestId,
        fileName: request.fileName,
        basename: request.basename,
      });
    }
    catch {
      pendingSourceResolves.delete(requestId);
      resolve(null);
    }
  });
};

/**
 * Host environment the library sees: hints published in Problems → vscode routing,
 * otherwise the internal dock.
 */
const environment = computed(() => (performanceHintsPublished.value ? 'vscode' : 'browser'));

/** 性能分析 详情 under vscode routing: ask the host to reveal the published hints in Problems. */
const onOpenPerformanceHintsInProblems = () => {
  try {
    vscode.postMessage({ command: 'showPerformanceHintsInProblems' });
  }
  catch {
    // Host not ready: the indicator is hidden again once the state is false.
  }
};

onMounted(() => {
  window.addEventListener('message', handleMessage);
  vscode.postMessage({ command: 'profilingReportReady' });
});

onUnmounted(() => {
  window.removeEventListener('message', handleMessage);
  revokeSuduWorkerBlob();

  for (const settle of pendingSourceResolves.values()) {
    settle(null);
  }

  pendingSourceResolves.clear();
});

const onReady = () => {
  isLoading.value = false;
};

const onError = (err: { message: string;
  cause?: unknown }) => {
  error.value = err.message;
  isLoading.value = false;
};

/**
 * Relay the assembled cannbot payload (section snapshot + prompt) to the extension host.
 * The payload embeds Vue reactive view-model objects (proxies) which the webview
 * postMessage structured clone cannot serialize — deep-plain them via a JSON
 * round-trip first, otherwise postMessage throws DataCloneError.
 */
const onCannbotRequest = (payload: unknown) => {
  const plainPayload = JSON.parse(JSON.stringify(payload ?? {}));

  vscode.postMessage({
    command: 'cannbotRequest',
    payload: plainPayload,
  });
};
</script>

<template>
  <div class="profiling-report-host">
    <ProfilingReport
      v-if="source"
      ref="reportRef"
      :source="source"
      :theme="theme"
      :locale="locale"
      :title="fileName"
      :report-meta="reportMeta"
      :environment="environment"
      :sudu-worker-url="suduWorkerUrl"
      :resolve-source-file="resolveSourceFile"
      @ready="onReady"
      @error="onError"
      @cannbot-request="onCannbotRequest"
      @open-performance-hints-in-problems="onOpenPerformanceHintsInProblems"
    />
    <div
      v-else-if="error"
      class="flex flex-col items-center justify-center h-full text-sm text-red-500"
    >
      <p>{{ error }}</p>
    </div>
    <div
      v-else-if="isLoading"
      class="flex flex-col items-center justify-center h-full text-sm text-gray-500"
    >
      <div class="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent mb-2" />
      <p>{{ t('profilingReport.loading') }}</p>
    </div>
    <div
      v-else
      class="flex flex-col items-center justify-center h-full text-sm text-gray-500"
    >
      <p>{{ t('profilingReport.noData') }}</p>
    </div>
  </div>
</template>

<style scoped>
.profiling-report-host {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

:global(body) {
  margin: 0;
  padding: 0;
  color: var(--vscode-editor-foreground);
  background: var(--vscode-editor-background);
  font-family: var(--vscode-font-family);
  overflow: hidden;
}
</style>
