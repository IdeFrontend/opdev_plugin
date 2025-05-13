/**
 * Copyright (c) 2024 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { InitialCommandStatus } from "./initial_command";
import { DebugSessionExt } from './debug_session_ext';
import { DebugSession, OutputEvent } from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol'
import { MsdebugMI } from "../machine_interface/msdebug_mi";
import { processEnv, checkAndPrintPostLoadMessage} from "../machine_interface/process_env"
import { getMsdebugMiPath } from "../machine_interface/mi_base"
import { initLogger } from '../utils/backend_global';

export interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
	cwd: string;
	target: string;
	targetArgs: string[];
	msdebugMiPath: string;
	environment: any;
	args: string;
	printMiInput: boolean;
	printMiOutput: boolean;
	enableLog: boolean;
	skipEnvCheck: boolean;
	environmentScripts: string[];
}

class MsDebugDebugSession extends DebugSessionExt {
	protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
		response.body.supportsGotoTargetsRequest = true;
		response.body.supportsHitConditionalBreakpoints = true;
		response.body.supportsConfigurationDoneRequest = true;
		response.body.supportsConditionalBreakpoints = true;
		response.body.supportsFunctionBreakpoints = true;
		response.body.supportsEvaluateForHovers = true;
		response.body.supportsReadMemoryRequest = true;
		this.sendResponse(response);
	}

	protected async launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments): Promise<void> {
		try {
			let envs = processEnv(args.environment, args.environmentScripts);
			let msdebugMiPath:string = await getMsdebugMiPath(args.msdebugMiPath, envs);
			this.miDebugger = new MsdebugMI(msdebugMiPath, envs);
			this.bindDebuggerEvents();
			this.miDebugger.printMiInput = !!args.printMiInput;
			this.miDebugger.printMiOutput = !!args.printMiOutput;
			this.miDebugger.targetArgs = args.targetArgs;

			if (args.enableLog) {
				initLogger();
			}

			if (!args.skipEnvCheck){
				checkAndPrintPostLoadMessage(this.miDebugger.envs, (msg)=>this.miDebugger.log("console", msg));
			}

		} catch (err) {
			this.sendEvent(new OutputEvent(`Failed to launch: ${String(err.message)}`, "stderr"));
			this.sendErrorResponse(response, 1, `Failed to launch: ${String(err.message)}`);
			return;
		}
		this.miDebugger.load(args.cwd, args.target).then(() => {
			this.sendResponse(response);
		}, err => {
			this.sendErrorResponse(response, 1, `Failed to load MI Debugger: ${err.toString()}`);
		});

	}
}

DebugSession.run(MsDebugDebugSession);