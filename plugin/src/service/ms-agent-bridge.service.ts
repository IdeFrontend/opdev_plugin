import { SettingsLoader } from '@plugin/service/settings-loader';
import * as vscode from 'vscode';

export type MsAgentAiFixState = 'queued' | 'running' | 'fixed';

export interface MsAgentAiFixQueueSnapshot {
  paused: boolean;
  hasPendingTasks: boolean;
  items: Array<{ id: string;
    title: string }>;
  states: Record<string, MsAgentAiFixState>;
}

/**
 * Thin VS Code command bridge to msAgent (sanitizer AI fix, auto parseLog).
 * See plugin/specs/MSAGENT_PLUGIN_INTEGRATION.md.
 */
export class MsAgentBridgeService {
  private isMsAgentAiFixEnabled(): boolean {
    try {
      return SettingsLoader.isMsAgentAiFixEnabled();
    }
    catch {
      return false;
    }
  }

  private static readonly emptyQueueSnapshot: MsAgentAiFixQueueSnapshot = {
    paused: false,
    hasPendingTasks: false,
    items: [],
    states: {},
  };

  private log(message: string, data?: unknown): void {
    if (data === undefined) {
      console.log(`[msAgentBridge] ${message}`);
    }
    else {
      console.log(`[msAgentBridge] ${message}`, data);
    }
  }

  private hasMsAgentCommandContributions(): boolean {
    const required = new Set([
      'msagent.parseLog',
      'msagent.fixProblem',
    ]);

    for (const ext of vscode.extensions.all) {
      const packageJson = ext.packageJSON as {
        contributes?: { commands?: Array<{ command?: string }> };
      };
      const commands = packageJson?.contributes?.commands ?? [];
      const contributed = new Set(commands
        .map((item) => item.command)
        .filter((command): command is string => typeof command === 'string'));

      if ([...required].every((command) => contributed.has(command))) {
        return true;
      }
    }

    return false;
  }

  async areMsAgentCommandsRegistered(): Promise<boolean> {
    try {
      const cmds = await vscode.commands.getCommands(true);

      return cmds.includes('msagent.parseLog') && cmds.includes('msagent.fixProblem');
    }
    catch {
      return false;
    }
  }

  /**
   * Feature flag on and msAgent contributed commands are present.
   */
  async isMsAgentIntegrationAvailable(): Promise<boolean> {
    if (!this.isMsAgentAiFixEnabled()) {
      return false;
    }

    if (this.hasMsAgentCommandContributions()) {
      return true;
    }

    return this.areMsAgentCommandsRegistered();
  }

  async loadMsAgentLog(
    absoluteLogPath: string,
    options?: { suppressMessage?: boolean },
  ): Promise<void> {
    const uri = vscode.Uri.file(absoluteLogPath);

    this.log('loadMsAgentLog executeCommand msagent.parseLog', {
      absoluteLogPath,
      suppressMessage: options?.suppressMessage ?? false,
    });

    await vscode.commands.executeCommand('msagent.parseLog', uri, options ?? {});
  }

  /**
   * Load the sanitizer log into msAgent when integration is enabled (auto after run or when opening a report).
   */
  async tryLoadLogWithIntegration(absoluteLogPath: string): Promise<void> {
    if (!(await this.isMsAgentIntegrationAvailable())) {
      return;
    }

    try {
      await this.loadMsAgentLog(absoluteLogPath, { suppressMessage: true });
    }
    catch (e) {
      console.warn('[msAgentBridge] msagent.parseLog failed:', e);
    }
  }

  /**
   * Snapshot of sanitizer-row AI fix activity (indices match table msAgentIndex / fixProblem index).
   */
  async getAiFixQueueSnapshot(): Promise<MsAgentAiFixQueueSnapshot> {
    if (!(await this.isMsAgentIntegrationAvailable())) {
      return MsAgentBridgeService.emptyQueueSnapshot;
    }

    const globalObj = globalThis as {
      __msAgentGetAiFixQueueSnapshot?: ()=> unknown;
      __msAgentGetAiFixQueueStates?: ()=> unknown;
    };

    const fromSnapshotGlobal = globalObj.__msAgentGetAiFixQueueSnapshot;

    if (typeof fromSnapshotGlobal === 'function') {
      try {
        const snapshot = fromSnapshotGlobal();

        if (this.isQueueSnapshot(snapshot)) {
          this.log('getAiFixQueueSnapshot from global', snapshot);

          return snapshot;
        }
      }
      catch {
        // fall through
      }
    }

    const fromStatesGlobal = globalObj.__msAgentGetAiFixQueueStates;

    if (typeof fromStatesGlobal === 'function') {
      try {
        const states = fromStatesGlobal();

        if (this.isStateMap(states)) {
          const snapshot = this.snapshotFromStates(states);

          this.log('getAiFixQueueSnapshot from global states', snapshot);

          return snapshot;
        }
      }
      catch {
        // fall through
      }
    }

    try {
      const snapshot = await vscode.commands.executeCommand('msagent.getAiFixQueueSnapshot') as unknown;

      if (this.isQueueSnapshot(snapshot)) {
        this.log('getAiFixQueueSnapshot from command', snapshot);

        return snapshot;
      }
    }
    catch {
      // fall through
    }

    try {
      const result = await vscode.commands.executeCommand('msagent.getAiFixQueueStates') as unknown;

      if (this.isStateMap(result)) {
        const snapshot = this.snapshotFromStates(result);

        this.log('getAiFixQueueSnapshot from states command', snapshot);

        return snapshot;
      }

      return MsAgentBridgeService.emptyQueueSnapshot;
    }
    catch {
      return MsAgentBridgeService.emptyQueueSnapshot;
    }
  }

  async getAiFixQueueStates(): Promise<Record<string, MsAgentAiFixState>> {
    const snapshot = await this.getAiFixQueueSnapshot();

    return snapshot.states;
  }

  private isStateMap(value: unknown): value is Record<string, MsAgentAiFixState> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    return Object.values(value as Record<string, unknown>)
      .every((state) =>
        state === 'queued' || state === 'running' || state === 'fixed');
  }

  private snapshotFromStates(states: Record<string, MsAgentAiFixState>): MsAgentAiFixQueueSnapshot {
    const hasPendingTasks = Object.values(states)
      .some((state) => state === 'queued' || state === 'running');

    return {
      paused: false,
      hasPendingTasks,
      items: [],
      states,
    };
  }

  private isQueueSnapshot(value: unknown): value is MsAgentAiFixQueueSnapshot {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    const snapshot = value as Partial<MsAgentAiFixQueueSnapshot>;

    if (typeof snapshot.paused !== 'boolean' || typeof snapshot.hasPendingTasks !== 'boolean') {
      return false;
    }

    if (!Array.isArray(snapshot.items) || !this.isStateMap(snapshot.states ?? {})) {
      return false;
    }

    return snapshot.items.every((item) =>
      item && typeof item.id === 'string' && typeof item.title === 'string');
  }

  async fixMsAgentProblem(
    index: number,
    options?: { suppressProgressNotification?: boolean },
  ): Promise<{ status: string }> {
    if (!(await this.isMsAgentIntegrationAvailable())) {
      return { status: 'integration_unavailable' };
    }

    try {
      this.log('fixMsAgentProblem executeCommand msagent.fixProblem', {
        index,
        suppressProgressNotification: options?.suppressProgressNotification ?? false,
      });
      const result = await vscode.commands.executeCommand(
        'msagent.fixProblem',
        index,
        options ?? {},
      ) as { status?: string } | boolean | undefined;

      if (typeof result === 'object' && result !== null && typeof result.status === 'string') {
        this.log('fixMsAgentProblem status object result', result);

        return { status: result.status };
      }

      if (result === true) {
        this.log('fixMsAgentProblem boolean result=true');

        return { status: 'completed' };
      }

      if (result === false) {
        this.log('fixMsAgentProblem boolean result=false');

        return { status: 'failed' };
      }

      return { status: 'unknown' };
    }
    catch (e) {
      console.warn('[msAgentBridge] msagent.fixProblem failed:', e);

      return { status: 'failed' };
    }
  }
}

export const msAgentBridgeService = new MsAgentBridgeService();
