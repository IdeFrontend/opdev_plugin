import {
  computed,
  shallowRef,
} from 'vue';

import { useConnector } from '@web/core/use-connector';
import {
  ST_TEST_RESULTS_CONNECT_CHANNEL,
  type StTestResultsPanelDto,
  type StTestResultsWebviewAction,
} from '@shared/st-test-results';

export function useStTestResults() {
  const state = shallowRef<StTestResultsPanelDto>();
  const connector = useConnector<
    StTestResultsWebviewAction,
    StTestResultsPanelDto
  >(ST_TEST_RESULTS_CONNECT_CHANNEL);

  connector.receive((nextState) => {
    state.value = nextState;
  });

  const report = computed(() => state.value?.report);
  const hasReport = computed(() => report.value !== undefined);

  function openResultFile(artifactId: string): void {
    connector.send({
      type: 'openResultFile',
      artifactId,
    });
  }

  return {
    report,
    hasReport,
    openResultFile,
  };
}
