/**
 * Copyright (c) 2024 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as fs from "fs";
import { DebugProtocol } from '@vscode/debugprotocol';
import {
	DebugSession, InitializedEvent, TerminatedEvent, StoppedEvent, ThreadEvent, OutputEvent, ContinuedEvent,
	Thread, StackFrame, Scope, Source, Handles, Event, InvalidatedEvent
} from '@vscode/debugadapter';
import * as DebugAdapter from '@vscode/debugadapter';
import { VariableScope, ExtendedVariable } from "./variable"
import { InitialCommandStatus } from "./initial_command"
import { StackVariable, VariableObjectChild } from '../machine_interface/backend';
import { expandValue, expandValueStackListVariable } from '../utils/expansion';
import { MIBase, execCmd } from '../machine_interface/mi_base';
import backendGlobal, { globalKernelEvents, initBackendGlobal, setBackendGlobalKernel } from '../utils/backend_global';
import { AsyncRecord } from "../utils/mi_parse_type/AsyncRecord";
import { OutputRecord } from "../utils/mi_parse_type/OutputRecord";
import { MemoryReference } from "./memory";

let preRecord = null;

export interface ReadMemoryInnerRequest {
	variableName:string;
	memoryReference:MemoryReference;
	offset:number;
	count:number;
}

export interface ReadMemoryInnerResponse extends ReadMemoryInnerRequest {
	data:string[];
}

export class DebugSessionExt extends DebugSession {
	protected miDebugger: MIBase;
	protected variableHandles = new Handles<string | VariableScope | VariableObjectChild>();
	protected variableHandlesReverse: { [id: string]: number } = {};
	protected scopeHandlesReverse: { [key: string]: number } = {};
	protected stackVariables: DebugProtocol.Variable[] = [];
	protected initialRunCommand: InitialCommandStatus;
	protected isInitialRunCommandFinished = false;
	protected mode:string = '';

	public constructor(debuggerLinesAndColumnsStartAt1: boolean, isServer: boolean = false) {
		super(debuggerLinesAndColumnsStartAt1, isServer);
	}

	protected bindDebuggerEvents(): void {
		this.miDebugger.on("error-fatal", (err: any) => {
			this.sendEvent(new OutputEvent(`${err.toString()}\n`, "stderr"));
			this.sendEvent(new TerminatedEvent());
		});
		this.miDebugger.on("quit", () => {
			this.sendEvent(new TerminatedEvent());
		});
		this.miDebugger.on("exited-normally", () => {
			this.sendEvent(new TerminatedEvent());
		});
		this.miDebugger.on("output", (type: string, msg: string) => {
			// type: console(blue)/stdout(green)/stderr(red)
			this.sendEvent(new OutputEvent(msg, type));
		});
		this.miDebugger.on("step", (info?: AsyncRecord) => {
			const event: DebugProtocol.StoppedEvent = new StoppedEvent("step", info ? parseInt(info.getResult("thread-id")) : 1);
			event.body.allThreadsStopped = info ? info.getResult("stopped-threads") == "all" : true;
			this.sendEvent(event);
		});
		this.miDebugger.on("signal-received", (info: AsyncRecord) => {
			const event: DebugProtocol.StoppedEvent = new StoppedEvent("exception", parseInt(info.getResult("thread-id")));
			event.body.allThreadsStopped = info.getResult("stopped-threads") == "all";
			this.sendEvent(event);
		});
		this.miDebugger.on("paused", (info: AsyncRecord) => {
			const event: DebugProtocol.StoppedEvent = new StoppedEvent("pause", parseInt(info.getResult("thread-id")));
			event.body.allThreadsStopped = info.getResult("stopped-threads") == "all";
			this.sendEvent(event);
		});
		this.miDebugger.on("thread-created", (info: AsyncRecord) => {
			this.sendEvent(new ThreadEvent("started", info.getResult("id")));
		});
		this.miDebugger.on("thread-exited", (info: AsyncRecord) => {
			this.sendEvent(new ThreadEvent("exited", info.getResult("id")));
		});
		this.miDebugger.once("debug-ready", (() => {
			this.sendEvent(new InitializedEvent());
			this.sendEvent(new KernelFocus({ focus: false }));
			initBackendGlobal();
		}));

		this.miDebugger.on("breakpoint-hit", this.handleBreakpointHit.bind(this));
		globalKernelEvents.on('npuFocus', this.kernelFocus.bind(this));
	}

	protected bindDebuggerEventsForCoredump(): void {
		this.miDebugger.on("quit", () => {
			this.sendEvent(new TerminatedEvent());
		});
		this.miDebugger.on("exited-normally", () => {
			this.sendEvent(new TerminatedEvent());
		});
		this.miDebugger.on("output", (type: string, msg: string) => {
			// type: console(blue)/stdout(green)/stderr(red)
			this.sendEvent(new OutputEvent(msg, type));
		});
		this.miDebugger.once("debug-ready", (() => {
			initBackendGlobal();
			setBackendGlobalKernel({ isNpu: true });
			
			this.sendEvent(new InitializedEvent());
			this.sendEvent(new KernelFocus({ focus: true }));
		
		}));
		globalKernelEvents.on('npuFocus', this.kernelFocus.bind(this));
	}

	kernelFocus() {
		const focus = backendGlobal.kernel.isNpu;
		this.sendEvent(new KernelFocus({ focus }));

		if (focus) {
			this.sendCurrentKernelInfo();
		}
	}

	async sendTableInfo() {
		const coredumpInfo = await this.miDebugger.getCoredumpInfo();

		this.sendEvent(new Event('tableResult', { table: coredumpInfo.allTables }));
	}

	async initTableWin() {
		this.sendEvent(new Event('openTable', {}));
	}

	async sendCurrentKernelInfo() {
		const isCoredump = this.mode === 'msdebug-coredump';
		const coredumpInfo = isCoredump ? await this.miDebugger.getCoredumpInfo() : null;

		const allCores = isCoredump ? coredumpInfo.allCores : await this.miDebugger.getKernelInfo();
		const index = allCores.findIndex(i => i[isCoredump ? 3 : 7].includes('*')) + 1;

		this.sendEvent(new ChangeKernelEvent({ type: allCores?.[index]?.[1], focusId: allCores?.[index]?.[0], allKernel: allCores, mode: this.mode }));
	}

	async sendMemoryInfo(args) {
		const memory = await this.miDebugger.getMemory(args);

		this.sendEvent(new Event('memoryResult', memory));
	}

	protected async customRequest(command: string, response: DebugProtocol.Response, args: any, request?: DebugProtocol.Request): Promise<any> {
		if (command === 'changeKernel') {
			try {
				await this.miDebugger.changeKernel(args);

				if (this.mode === 'msdebug-coredump') {
					this.sendCurrentKernelInfo();
					this.sendTableInfo();
				}

				this.handleBreakpointHit();
				this.sendEvent(new InvalidatedEvent(['variables']));
			} catch (e) {
				this.sendEvent(new ChangeKernelError({ message: e }));
			}
		}

		if (command === 'queryTable') {
			this.sendTableInfo();
		}

		if (command === 'queryTableMemory') {
			this.sendEvent(new Event('readTableMemory', { data: args }));
		}

		if (command === 'queryMemory') {
			const innerResp = await this.readMemoryInnerRequest(args);

			if (!innerResp || !innerResp?.memoryReference || innerResp?.memoryReference?.address === undefined) {
				this.sendEvent(new Event('memoryResultError', innerResp));
			} else {
				this.sendEvent(new Event('memoryResult', innerResp));
			}
		}
	}

	protected async readMemoryInnerRequest(args:ReadMemoryInnerRequest):Promise<any> {
		const response:ReadMemoryInnerResponse = {...args, data:[]}
		let memoryReference:MemoryReference;
		if (args.variableName != undefined && args.variableName != "") {
			memoryReference = await this.getMemoryReferenceByVariableName(args);
		} else {
			memoryReference = args.memoryReference;
		}
		if (memoryReference == undefined) {
			response.memoryReference = undefined;

			return response;
		}
		response.memoryReference  = memoryReference;

		let querySize = Math.min(args.count, parseInt(memoryReference.dataLength) - args.offset);
		if (args.count <= 0 || querySize <= 0) {
			response.data = [];
			return response;
		}
		await this.miDebugger.readMemoryRequest(memoryReference, args.offset, args.count).then((res) => {
			if (memoryReference.dataType == 'char[]') {
				response.data = res;
			} else {
				let memoryVals = res.split(/\s/);
				response.data = memoryVals;
			}
		}, err => {
			throw new Error(err);
		});
		return response;
	}
	
	protected async getMemoryReferenceByVariableName(args:ReadMemoryInnerRequest):Promise<MemoryReference> {
		// 0. 多行数据校验
		if (args.variableName.split('\r\n').length > 1) {
			return undefined;
		}

		// 1.evaluate 获取变量值，没有返回空
		let variable = await this.miDebugger.evalExpression(args.variableName, 1, 1).then((res) => {
			return res.getResult('value');
		}, err => {
			return undefined;
		})
		let memoryReference:MemoryReference = await this.getVariableMemoryReference(variable);
		return memoryReference;
	}

	protected handleBreakpointHit(record?: AsyncRecord) {
		if (!this.isInitialRunCommandFinished) {
			this.isInitialRunCommandFinished = true;
		}
		const info = record || preRecord;
		const event: DebugProtocol.StoppedEvent = new StoppedEvent("breakpoint", parseInt(info.getResult("thread-id")));
		event.body.allThreadsStopped = info.getResult("stopped-threads") == "all";
		this.sendEvent(event);

		preRecord = info;
		if (backendGlobal.kernel.isNpu) {
			this.sendCurrentKernelInfo();
		}
	}

	protected configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, args: DebugProtocol.ConfigurationDoneArguments): void {
		this.miDebugger.execRun().then(() => {
			this.sendResponse(response);
		}).catch(err => {
			this.sendErrorResponse(response, 1, `Exec-run error: ${err.toString()}`);
		});
	}

	protected disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments): void {
		this.miDebugger.exitDebugProcess();
		this.sendResponse(response);
	}

	protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): void {
		if  (this.mode == 'msdebug-coredump') {
			this.sendResponse(response);
			return;
		}
		let path = args.source.path;
		this.miDebugger.clearBreakPoints(path).then(() => {
			const all = args.breakpoints.map(brk => {
				return this.miDebugger.addBreakPoint({ sourceFileName: path, lineNumber: brk.line, breakCondition: brk.condition, breakCountCondition: brk.hitCondition });
			});
			Promise.all(all).then(brkpoints => {
				const finalBrks = [];
				brkpoints.forEach(brkp => {
					if (brkp[0]) {
						finalBrks.push(new DebugAdapter.Breakpoint(true, brkp[1].lineNumber));
					}
				});
				response.body = {
					breakpoints: finalBrks
				};
				this.sendResponse(response);
			}, msg => {
				this.sendErrorResponse(response, 1, `Set breakpiont error: ${msg.toString()}`);
			});
		}, msg => {
			this.sendErrorResponse(response, 1, `Clear breakpoint error: ${msg.toString()}`);
		});
	}

	protected setFunctionBreakPointsRequest(response: DebugProtocol.SetFunctionBreakpointsResponse, args: DebugProtocol.SetFunctionBreakpointsArguments): void {
		const all = [];
		args.breakpoints.forEach(brk => {
			all.push(this.miDebugger.addBreakPoint({ raw: brk.name, breakCondition: brk.condition, breakCountCondition: brk.hitCondition }));
		});
		Promise.all(all).then(brkpoints => {
			const finalBrks = [];
			brkpoints.forEach(brkp => {
				if (brkp[0]) {
					finalBrks.push({ line: brkp[1].lineNumber });
				}
			});
			response.body = {
				breakpoints: finalBrks
			};
			this.sendResponse(response);
		}, msg => {
			this.sendErrorResponse(response, 1, `Set function breakpoint error: ${msg.toString()}`);
		});
	}

	protected async setVariableRequest(response: DebugProtocol.SetVariableResponse, args: DebugProtocol.SetVariableArguments): Promise<void> {
		try {
			await this.miDebugger.changeVariable(args.name, args.value);
			response.body = {
				value: args.value
			};
			this.sendResponse(response);
		} catch (err) {
			this.sendErrorResponse(response, 1, `Continue error: ${err}`);
		}
	}

	protected stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments): void {
		this.miDebugger.getStackListFramesInfo(args.startFrame, args.levels, args.threadId).then(framesInfo => {
			const ret: StackFrame[] = [];
			framesInfo.forEach(frameInfo => {
				let source = undefined;
				let path = frameInfo.fullFileName;
				if (path) {
					source = new Source(frameInfo.fileName, path);
				}

				ret.push(new StackFrame(
					this.threadAndLevelToFrameId(args.threadId, frameInfo.frameNumber),
					frameInfo.functionName + "@" + frameInfo.pcAddr,
					source,
					frameInfo.pcLineNumber,
					0));
			});
			response.body = {
				stackFrames: ret
			};
			this.sendResponse(response);
		}, err => {
			this.sendErrorResponse(response, 1, `Get Stack Trace: ${err.toString()}`);
		});
	}

	protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
		if (!this.miDebugger || !this.isInitialRunCommandFinished) {
			this.sendResponse(response);
			return;
		}
		this.miDebugger.getThreadsInfo().then(threadsInfo => {
			response.body = {
				threads: []
			};
			for (const threadInfo of threadsInfo) {
				const threadName = threadInfo.targetId || "<unnamed>";
				response.body.threads.push(new Thread(threadInfo.id, threadInfo.id + ":" + threadName));
			}
			this.sendResponse(response);
		}).catch(error => {
			this.sendErrorResponse(response, 1, `Get threads: ${error}`);
		});
	}

	protected threadAndLevelToFrameId(threadId: number, level: number) {
		return level << 16 | threadId;
	}

	protected frameIdToThreadAndLevel(frameId: number) {
		return [frameId & 0xffff, frameId >> 16];
	}

	protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {
		const scopes = new Array<Scope>();
		const [threadId, level] = this.frameIdToThreadAndLevel(args.frameId);

		const createScope = (scopeName: string, expensive: boolean): Scope => {
			const key: string = scopeName + ":" + threadId + ":" + level;
			let handle: number;

			if (Object.prototype.hasOwnProperty.call(this.scopeHandlesReverse, key)) {
				handle = this.scopeHandlesReverse[key];
			} else {
				handle = this.variableHandles.create(new VariableScope(scopeName, threadId, level));
				this.scopeHandlesReverse[key] = handle;
			}

			return new Scope(scopeName, handle, expensive);
		};

		scopes.push(createScope("Local", false));
		scopes.push(createScope("Registers", false));

		response.body = {
			scopes: scopes
		};
		this.sendResponse(response);
	}

	protected async variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments): Promise<void> {
		const variables: DebugProtocol.Variable[] = [];
		const id: VariableScope | string | VariableObjectChild = this.variableHandles.get(args.variablesReference);

		const createVariable = (arg) => {
			return this.variableHandles.create(arg);
		};

		const findOrCreateVariable = (varObjChild: VariableObjectChild): number => {
			let id: number;
			if (Object.prototype.hasOwnProperty.call(this.variableHandlesReverse, varObjChild.name)) {
				id = this.variableHandlesReverse[varObjChild.name];
			} else {
				id = createVariable(varObjChild);
				this.variableHandlesReverse[varObjChild.name] = id;
			}
			return varObjChild.isCompound() ? id : 0;
		};

		if (id instanceof VariableScope) {
			if (id.name === 'Registers') {
				try {
					response.body = {
						variables: []
					};
					if (backendGlobal.kernel.isNpu) {
						await this.miDebugger.getKernelRegisterInfo().then(data => {
							const registerVariableArr = data;
							response.body.variables = registerVariableArr;
						}).catch(err => { });
					} else {
						const regNamesResp = await this.miDebugger.getRegistersNames();
						const regNames: string[] = regNamesResp.getResult("register-names");

						const regValuesResp = await this.miDebugger.getRegistersValues();
						const regValues = regValuesResp.getResult("register-values");

						regValues.forEach((pair) => {
							const regNum = Number.parseInt(pair[0][1]);
							const regName = regNames[regNum];
							let registerVariable = {
								name: regName,
								type: '',
								value: pair[1][1],
								variablesReference: 0
							}
							response.body.variables.push(registerVariable);
						})
					}

					this.sendResponse(response);
				} catch (err) {
					this.sendErrorResponse(response, 1, `Expand variable error: ${err}`);
				}
			} else {
				let stackVariables: StackVariable[];
				try {
					let result = await this.miDebugger.getStackVariables(id.threadId, id.level);
					stackVariables = result.getResult("variables");

					for (const stackVariable of stackVariables) {
						if (stackVariable.value !== undefined) {
							let expanded = expandValueStackListVariable(createVariable, { [stackVariable["name"]]: stackVariable["value"] });
							if (expanded) {
								variables.push(expanded[0]);
							}
						} else {
							let newVariable = {
								name: stackVariable.name,
								type: stackVariable.type,
								value: stackVariable.type,
								memoryReference: undefined,
								variablesReference: createVariable(stackVariable.name)
							}
							variables.push(newVariable);
						}
					}
					response.body = {
						variables: variables
					};
					/* 保存stack变量信息 */
					this.stackVariables = variables;
					this.sendResponse(response);
				} catch (err) {
					this.sendErrorResponse(response, 1, `Expand variable error: ${err}`);
				}
			}
		} else if (typeof id == "string") {
			let variable;
			try {
				variable = await this.miDebugger.evalExpression(JSON.stringify(id), 0, 0);
				let needExpand = true;

				if (id == "this") {
					needExpand = false;
				}

				let expandInput = variable.getResult("value");
				if (typeof expandInput == "string") {
					// VARIABLE显示this,x等， value是字符串
					expandInput = { "value": expandInput };
				}

				try {
					let expanded = expandValue(createVariable, expandInput, needExpand);
					if (!expanded) {
						this.sendErrorResponse(response, 1, `Expand variable error`);
					} else {
						response.body = {
							variables: expanded
						};
						this.sendResponse(response);
					}
				} catch (e) {
					this.sendErrorResponse(response, 1, `Expand variable error: ${e}`);
				}
			} catch (err) {
				this.sendErrorResponse(response, 1, `Expand variable error: ${err}`);
			}
		} else if (typeof id == "object") {
			if (id instanceof VariableObjectChild) {
				let children: VariableObjectChild[];
				try {
					children = await this.miDebugger.varListChildren(id.name);
					const vars = children.map(child => {
						const varId = findOrCreateVariable(child);
						child.id = varId;
						return child.toDebugProtocolVariable();
					});

					response.body = {
						variables: vars
					};
					this.sendResponse(response);
				} catch (err) {
					this.sendErrorResponse(response, 1, `Expand variable error: ${err}`);
				}
			} else {
				response.body = {
					variables: id
				};
				this.sendResponse(response);
			}
		} else {
			response.body = {
				variables: variables
			};
			this.sendResponse(response);
		}
	}

	protected pauseRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
		this.miDebugger.interrupt().then(done => {
			this.sendResponse(response);
		}, msg => {
			this.sendErrorResponse(response, 1, `Pause error: ${msg}`);
		});
	}

	protected reverseContinueRequest(response: DebugProtocol.ReverseContinueResponse, args: DebugProtocol.ReverseContinueArguments): void {
		this.miDebugger.continue(true).then(done => {
			this.sendResponse(response);
		}, msg => {
			this.sendErrorResponse(response, 1, `Continue error: ${msg}`);
		});
	}

	protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
		this.miDebugger.continue().then(done => {
			this.sendResponse(response);
		}, msg => {
			this.sendErrorResponse(response, 1, `Continue error: ${msg}`);
		});
	}

	protected stepInRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
		this.miDebugger.step().then(done => {
			this.sendResponse(response);
		}, msg => {
			this.sendErrorResponse(response, 1, `Step in error: ${msg}`);
		});
	}

	protected stepOutRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
		this.miDebugger.stepOut().then(done => {
			this.sendResponse(response);
		}, msg => {
			this.sendErrorResponse(response, 1, `Step out error: ${msg}`);
		});
	}

	protected stepBackRequest(response: DebugProtocol.StepBackResponse, args: DebugProtocol.StepBackArguments): void {
		this.miDebugger.step(true).then(done => {
			this.sendResponse(response);
		}, msg => {
			this.sendErrorResponse(response, 1, `Step back error: ${msg}`);
		});
	}

	protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
		this.miDebugger.next().then(done => {
			this.sendResponse(response);
		}, msg => {
			this.sendErrorResponse(response, 1, `Step over error: ${msg}`);
		});
	}

	protected gotoTargetsRequest(response: DebugProtocol.GotoTargetsResponse, args: DebugProtocol.GotoTargetsArguments): void {
		const path: string = args.source.path;
		this.miDebugger.goto(path, args.line).then(done => {
			response.body = {
				targets: [{
					id: 1,
					label: args.source.name,
					column: args.column,
					line: args.line
				}]
			};
			this.sendResponse(response);
		}, msg => {
			this.sendErrorResponse(response, 1, `Jump error: ${msg}`);
		});
	}

	protected gotoRequest(response: DebugProtocol.GotoResponse, args: DebugProtocol.GotoArguments): void {
		this.sendResponse(response);
	}

	protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): void {
		if(args.context == "hover" && args.expression.trim() == ""){
			return;
		}
		
		const [threadId, level] = this.frameIdToThreadAndLevel(args.frameId);		
		if (args.context == "watch" || args.context == "hover") {
			const createVariable = (arg) => {
				return this.variableHandles.create(arg);
			};

			this.miDebugger.evalExpression(args.expression, threadId, level).then((res) => {
				/* 获取变量variablesReference便于variable request查询 */
				let varReference: number;
				let variables: DebugProtocol.Variable[] = this.stackVariables;
				for (let i = 0; i < variables.length; i++) {
					if (args.expression == variables[i]['name']) {
						varReference = variables[i]['variablesReference'];
					}
				}
				if (!varReference) {
					varReference = createVariable(args.expression);
				}

				response.body = {
					variablesReference: varReference,
					result: JSON.stringify(res.getResult("value")),
				};
				this.sendResponse(response);
			}, msg => {
				if (args.context != "hover") {
					// hover到某个字符会触发错误
					this.sendErrorResponse(response, 1, msg.toString());
				}
			});
		} else {
			this.miDebugger.sendUserInput(args.expression, threadId, level).then(output => {
				if (typeof output == "undefined") {
					response.body = {
						result: "",
						variablesReference: 0
					};
				}
				else {
					response.body = {
						result: JSON.stringify(output),
						variablesReference: 0
					};
				}
				this.sendResponse(response);
			}, msg => {
				this.sendErrorResponse(response, 1, msg.toString());
			});
		}
	}

	protected async getVariableMemoryReference(variableVal): Promise<MemoryReference> {
		let address: string;
		let memoryLocation: string;
		let datalength:string;
		let dataType:string;

		let tensorKey = findTensorKey(variableVal);
		if (tensorKey != undefined && tensorKey.includes('BaseGlobalTensor')) {
			address = getGlobalTensorAddress(variableVal, tensorKey);
			memoryLocation = 'GM';
			datalength = getGlobalTensorDataLen(variableVal);
			dataType = getDataTypeByTensorKey(tensorKey);
		} else if (variableVal.address_ != undefined && variableVal.address_.datalen == undefined) {
			address = variableVal.address_;
			memoryLocation = 'GM';
			datalength = getGlobalTensorDataLen(variableVal);
			dataType = getDataTypeByTensorKey(tensorKey);
		} else if (tensorKey != undefined && tensorKey.includes('BaseLocalTensor')) {
			address = getLocalTensorAddress(variableVal, tensorKey);
			let logicPos = getLocalTensorLogicPos(variableVal, tensorKey);
			// logicPos打印值转成ascII码的值，仅适配UB
			logicPos = logicPos.replace('\\\\\\\\t', '\t').replace('\\\\\\\\0', '\t').replace('\\\\\\\\v', '\v').replace('\\\\\\\\n', '\n');
			const tPosition = getTPositionByLogicPos(logicPos.charCodeAt(0));
			memoryLocation = await getMemoryLocationByTPosition(tPosition);
			datalength = getLocalTensorDataLen(variableVal, tensorKey);
			dataType = getDataTypeByTensorKey(tensorKey);
		} else if (variableVal.address_ != undefined && variableVal.address_.datalen != undefined) {
			address = variableVal.address_.bufferAddr;
			memoryLocation = 'UB';
			datalength = variableVal.address_.datalen;
			dataType = getDataTypeByTensorKey(tensorKey);
		} else if (typeof variableVal === 'string' && !/^\d+$/.test(variableVal)) {
			address = variableVal.substring(0, 18);
			memoryLocation = 'COMMON';
		} else {
			address = undefined;
		}
		return {
			memoryLocation:memoryLocation,
			address:address,
			dataLength:datalength,
			dataType:dataType
		};
	}
}

class ChangeKernelEvent extends Event {
	body: {
		type: '',
		focusId: '',
		allKernel: []
	}

	public constructor(body) {
		super('changeKernel');

		this.body = {
			...this.body,
			...body
		};
	}
}

class KernelFocus extends Event {
	body: {
		focus: false
	}

	public constructor(body) {
		super('kernelFocus');

		this.body = {
			...this.body,
			...body
		};
	}
}

class ChangeKernelError extends Event {
	body: {
		message: ''
	}

	public constructor(body) {
		super('changeKernelError');

		this.body = {
			...this.body,
			...body
		};
	}
}

function getLocalTensorLogicPos(localTensorVal, tensorKey): string {
	tensorKey = (tensorKey.length != 0) ? tensorKey : findTensorKey(localTensorVal);
	return localTensorVal[tensorKey].address_.logicPos;
}

function getLocalTensorAddress(localTensorVal, tensorKey): string {
	tensorKey = (tensorKey.length != 0) ? tensorKey : findTensorKey(localTensorVal);
	return localTensorVal[tensorKey].address_.bufferAddr;
}

function getLocalTensorDataLen(localTensorVal, tensorKey): string {
	tensorKey = (tensorKey.length != 0) ? tensorKey : findTensorKey(localTensorVal);
	return localTensorVal[tensorKey].address_.dataLen;
}

function getGlobalTensorAddress(globalTensorVal, tensorKey): string {
	tensorKey = (tensorKey.length != 0) ? tensorKey : findTensorKey(globalTensorVal);
	return globalTensorVal[tensorKey].address_;
}

function getGlobalTensorDataLen(globalTensorVal): string {
	return globalTensorVal.bufferSize_;
}

function findTensorKey(tensorVal): string {
	let firstKey: string | undefined;
	for (let key in tensorVal) {
		if (key.startsWith('AscendC::')) {
			firstKey = key;
			break;
		}
	}
	return firstKey;
}

function getDataTypeByTensorKey(tensorKey): string {
	const keywordToDatatypeMap:{[key:string]:string} = {
		'bool':'bool',
		'char':'char[]',
		'int8_t':'int8_t[]',
		'signed char':'int8_t[]',
		'uint8_t':'uint8_t[]',
		'unsigned char':'uint8_t[]',
		'int16_t':'int16_t[]',
		'uint16_t':'uint16_t[]',
		'int32_t':'int32_t[]',
		'int':'int32_t[]',
		'signed int':'int32_t[]',
		'uint':'uint32_t[]',
		'uint32_t':'uint32_t[]',
		'unsigned int':'uint32_t[]',
		'int64_t':'int64_t[]',
		'uint64_t':'uint64_t[]',
		'__bf16':'bfloat16[]',
		'__fp16':'float16[]',
		'half':'float16[]',
		'float':'float32[]',
		'double':'float64[]',
		'uint128_t':'uint128_t[]'
	}
	for (const [keyword, datatype] of Object.entries(keywordToDatatypeMap)) {
		if (tensorKey.includes(`<${keyword}>`)) {
			return datatype;
		}
	}
}

function getTPositionByLogicPos(index): string {
	const tPositions = ['GM', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'C01', 'C02', 'VECIN', 'VECOUT', 'VECCALC', 'LCM', 'SPM', 'SHM', 'TSCM', 'MAX'];
	return tPositions[index];
}


async function getMemoryLocationByTPosition(tPosition): Promise<string> {
	let SocVersion = await execCmd("npu-smi info|awk 'NR==7 {print $3}'").catch(err => {throw err});

	// 当前仅适配220芯片，对应910B
	const tPositionToMemoryLocationMapFor220:{[key:string]:string} = {
		'GM':'GM',
		'A1':'L1',
		'B1':'L1',
		'TSCM':'L1',
		'VECIN':'UB',
		'VECOUT':'UB',
		'VECCALC':'UB',
		'A2':'L0A',
		'B2':'L0B',
		'C1':'L1',
		'C2':'BIAS',
		'C01':'L0C',
		'C02':'GM',
		'C2PIPE2GM':'FIXBUF'
	}
	// 当前仅适配200芯片，对应310P
	const tPositionToMemoryLocationMapFor200:{[key:string]:string} = {
		'GM':'GM',
		'A1':'L1',
		'B1':'L1',
		'TSCM':'L1',
		'VECIN':'UB',
		'VECOUT':'UB',
		'VECCALC':'UB',
		'A2':'L0A',
		'B2':'L0B',
		'C1':'L1',
		'C2':'BIAS',
		'C01':'L0C',
		'C02':'UB'
	}
	
	let tPositionToMemoryLocationMap = {};
	if (SocVersion.includes('910')) {
		tPositionToMemoryLocationMap = tPositionToMemoryLocationMapFor220;
	} else if (SocVersion.includes('310')) {
		tPositionToMemoryLocationMap = tPositionToMemoryLocationMapFor200;
	} else {
		throw new Error(`Unsupported npu SocVersion: ${SocVersion}`);
	}

	for (const [keyword, memoryLocation] of Object.entries(tPositionToMemoryLocationMap)) {
		if (tPosition == keyword) {
			return String(memoryLocation);
		}
	}
}