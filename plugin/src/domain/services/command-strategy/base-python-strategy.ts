import { CommandContext, BaseContext, ProfilerCommandParams } from './types';
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

  buildCommandContext(baseContext: BaseContext): CommandContext {
    return buildPythonOperatorCommandContext(baseContext);
  }

  buildSimulateCommand(params: ProfilerCommandParams): string {
    const {
      config, project, operator, sourceCannCmd, cdCmd, exampleTargetFile,
    } = params;
    return buildPythonSimulateCommand(
      config,
      project,
      operator,
      sourceCannCmd,
      cdCmd,
      exampleTargetFile,
      this.pythonOpType,
    );
  }

  buildOnBoardCommand(params: ProfilerCommandParams): string {
    const {
      config, project, operator, sourceCannCmd, cdCmd, exampleTargetFile,
    } = params;
    return buildPythonOnBoardCommand(
      config,
      project,
      operator,
      sourceCannCmd,
      cdCmd,
      exampleTargetFile,
      this.pythonOpType,
    );
  }
}
