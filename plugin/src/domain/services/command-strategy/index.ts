/**
 * Command strategy module
 *
 * Provides a command generation system based on strategy mode, supporting the generation of different types of operator commands.
 *
 * @module command-strategy
 *
 * @example
 * //Import strategy factory
 * import { CommandStrategyFactory } from './command-strategy';
 *
 * // Get strategy
 * const strategy = CommandStrategyFactory.getStrategy('ascend');
 *
 * // Use strategy to generate commands
 * const command = strategy.buildOpCommand(params);
 *
 * @example
 * //Register custom strategy
 * import { CommandStrategyFactory } from './command-strategy';
 * import type { CommandStrategy } from './command-strategy';
 *
 * class CustomStrategy implements CommandStrategy {
 * // Implement interface methods...
 * }
 *
 * // register the strategy in the factory map (see command-strategy/factory.ts).
 */

// Export type definition
export type {
  CommandContext,
  CommandBuildParams,
  ProfilerCommandParams,
  BaseContext,
  CommandStrategy,
  SectionConfig,
  BuildableConfig,
  ProfilerTargetConfig,
} from './types';

// Export strategy implementation
export { AscendCommandStrategy } from './ascend-strategy';

export { CannCommandStrategy } from './cann-strategy';

export { PyAscCommandStrategy } from './pyasc-strategy';

export { BasePythonCommandStrategy } from './base-python-strategy';

export {
  TritonCommandStrategy,
  probeTritonPythonDependencies,
} from './triton-strategy';

export { resolvePythonExecutablePath } from './python-operator-strategy-shared';

// Export factory class
export { CommandStrategyFactory } from './factory';
