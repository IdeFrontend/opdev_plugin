import {
  computed,
  readonly,
  shallowRef,
} from 'vue';

import { useConnector } from '@web/core/use-connector';
import {
  ST_TEST_RESULTS_CONNECT_CHANNEL,
  type StTestResultReportDto,
  type StTestResultsWebviewAction,
} from '@shared/st-test-results';

export function useStTestResults() {
  const report = shallowRef<StTestResultReportDto>();
  const connector = useConnector<
    StTestResultsWebviewAction,
    StTestResultReportDto
  >(ST_TEST_RESULTS_CONNECT_CHANNEL);

  connector.receive((nextReport) => {
    report.value = nextReport;
  });

  const hasReport = computed(() => report.value !== undefined);

  function openResultFile(artifactId: string): void {
    connector.send({
      type: 'openResultFile',
      artifactId,
    });
  }

  return {
    report: readonly(report),
    hasReport,
    openResultFile,
  };
}
