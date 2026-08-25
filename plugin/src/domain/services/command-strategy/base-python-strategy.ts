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
