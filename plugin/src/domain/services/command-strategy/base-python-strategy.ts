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
  CommandContext, BaseContext, ProfilerCommandParams, SectionConfig,
} from './types';
import type {
  SimulateConfig, OnBoardConfig,
} from '@plugin/service/config-service';
import {
  buildPythonOperatorCommandContext,
  buildPythonOnBoardCommand,
  buildPythonSimulateCommand,
} from './python-operator-strategy-shared';

/**
 * Shared base strategy for Python-based operators (e.g. PyAsc, Triton).
 * Keeps common context/profiler command wiring in one place.
 */
export abstract class BasePythonCommandStrategy {
  protected abstract readonly pythonOpType: string;

  buildCommandContext<TConfig extends SectionConfig>(baseContext: BaseContext<TConfig>): CommandContext<TConfig> {
    return buildPythonOperatorCommandContext(baseContext);
  }

  buildSimulateCommand(params: ProfilerCommandParams<SimulateConfig>): string {
    return buildPythonSimulateCommand(params, this.pythonOpType);
  }

  buildOnBoardCommand(params: ProfilerCommandParams<OnBoardConfig>): string {
    return buildPythonOnBoardCommand(params, this.pythonOpType);
  }
}
