/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
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
