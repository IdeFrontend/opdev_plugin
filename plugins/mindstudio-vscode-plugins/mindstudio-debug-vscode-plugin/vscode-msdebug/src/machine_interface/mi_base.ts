/**
 * Copyright (c) 2024 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Breakpoint, ThreadInfo, StackFrameInfo, StackVariable, VariableObjectChild } from "./backend";
import * as ChildProcess from "child_process";
import { EventEmitter } from "events";
import * as path from "path";
import { kernelChangeFocus, msdebugLogger } from "../utils/backend_global";
import { escape } from "../utils/str_util";
import { MIParser } from "../utils/mi_parse_type/MIParser";
import { OutputRecord } from "../utils/mi_parse_type/OutputRecord";
import { ResultRecord, ResultRecordType } from "../utils/mi_parse_type/ResultRecord";
import { StreamRecord } from "../utils/mi_parse_type/StreamRecord";
import { AsyncRecord, AsyncRecordType } from "../utils/mi_parse_type/AsyncRecord";
import { MemoryReference } from "../debug_session/memory"
import {isFileExist} from "../utils/file_util"
import {validatePath} from "../utils/file_util"
import {exec} from "child_process"
import {ErrorStreamRecordHandler} from "../utils/mi_parse_type/ErrorStreamRecordHandler"

export class MIBase extends EventEmitter {
	constructor(public application: string, envs: any) {
		super();

		this.envs = envs;
		this.miParser = new MIParser();
		this.application = application;
	}

	async getMemory(args): Promise<any> {
		return { cc: 'cc' };
	}

	async getKernelInfo(): Promise<string[]> {
		const res = await this.sendCliCommand('ascend info cores');

		const infoStr = res.getResult('result').replace(/\\{1,3}[trn]/g, '');
		const content = infoStr.trim() || '';
		const contentSplit = content.split(/\s{2,}/);
		const results = contentSplit.slice(5);
		const allLine = results.length / 8;
		const allCores = [];

		for (let i = 0; i < allLine; i++) {
			const coreInfo = [];

			for (let j = 0; j < 8; j++) {
				coreInfo.push(results[i * 8 + j]);
			}

			allCores.push(coreInfo);
		}

		return allCores;
	}

	async changeKernel(kernelInfo): Promise<void> {
		const type = kernelInfo.split(' ')[0];
		const id = kernelInfo.split(' ')[1];

		const res = await this.sendCliCommand(`ascend ${type} ${id}`);
		const infoStr = res.getResult('result');

		if (!infoStr) {
			return Promise.reject(`error: Invalid ${type === 'aic' ? 'aicore' : 'vectorcore'} index '${id}'`);
		}
	}

	async getKernelRegisterInfo(): Promise<any> {
		return new Promise((resolve, reject) => {
			this.sendCliCommand('register read -a').then(result => {
				let infoStr = result.getResult("result");
				const content = infoStr.trim() || '';
				const contentSplit = content.split(/\s{2,}/);
				let registerVariableArr = [];
				for (const element of contentSplit) {
					const match = element.match(/^([a-zA-Z_\-][a-zA-Z0-9_\-]*|\[\d+\]|\s*)\s*=\s*([a-zA-Z0-9_\-]*)n?/);
					if (match) {
						let regName = match[1];
						let regValue = match[2];
						let registerVariable = {
							name: regName,
							type: '',
							value: regValue,
							variablesReference: 0
						}
						registerVariableArr.push(registerVariable)
					}
				}
				resolve(registerVariableArr);
			})
		});
	}

	async load(cwd: string, target: string, targetArgs: string[] = []): Promise<any> {
		let userHome = await getUserHomePath();
		if (!validatePath(cwd, userHome)) {
			throw new Error(`Invalid path for cwd param.cwd=${cwd}`);
		}

		if (!path.isAbsolute(target) && isFileExist(cwd, target)) {
			target = path.join(cwd, target);
		}

		if (!validatePath(target, userHome)) {
			throw new Error(`Invalid path for target with cwd.cwd=${cwd}, new target=${target}`);
		}

		return new Promise((resolve, reject) => {
			this.process = ChildProcess.spawn(this.application, [], { cwd: cwd, env: this.envs });
			this.process.stdin.on('error', (e: any) => {
				this.log('stderr', e?.stack || e);
			});
			this.process.stdout.on("data", (data: any) => {
				this.processStdout(data);
			});
			this.process.stderr.on("data", (data: any) => {
				this.processStderr(data);
			});
			this.process.on("exit", () => {
				this.emit("quit");
			});
			this.process.on("error", (err) => {
				this.emit("error-fatal", err);
			});
			const promises = this.initCommands(target);

			Promise.all(promises).then(() => {
				this.emit("debug-ready");
				resolve(undefined);
			}, reject);
		});
	}

	protected initCommands(target: string, targetArgs: string[] = []) {
		const cmds = [
			this.sendCommand("gdb-set target-async on"),
			new Promise(resolve => {
				this.sendCommand("list-features").then(done => {
					this.features = done.getResult("features");
					resolve(undefined);
				}, err => {
					this.features = [];
					resolve(undefined);
				});
			}),
			this.sendCommand("file-exec-and-symbols \"" + escape(target) + "\"")
		];
		if (targetArgs != undefined && targetArgs.length != 0) {
			cmds.push(this.sendCliCommand(`settings set target.run-args ${escape(targetArgs.join(' '))}`));
		}

		return cmds;
	}

	private processStdout(data: any) {
		this.outBuffer += data.toString("utf8");
		const nPos = this.outBuffer.lastIndexOf('\n');
		if (nPos != -1) {
			this.onOutput(this.outBuffer.substring(0, nPos));
			this.outBuffer = this.outBuffer.substring(nPos + 1);
		}
	}

	private processStderr(data) {
		this.errbuf += data.toString("utf8");
		const nPos = this.errbuf.lastIndexOf('\n');
		if (nPos != -1) {
			const lines = this.errbuf.substring(0, nPos).split("\n");
			this.errbuf = this.errbuf.substring(nPos + 1);
			lines.forEach(line => {
				this.log("stderr", line);
			});
		}
	}

	private handleResultRecord(record: ResultRecord) {
		if (record.getToken() !== undefined &&  this.handlers[record.getToken()]) {
			this.handlers[record.getToken()](record);
			delete this.handlers[record.getToken()];
			if (this.userInputCmdTokens.has(record.getToken())) {
				this.userInputCmdTokens.delete(record.getToken());
			}
		}
	}

	private handleAsyncExecRecord(record: AsyncRecord) {
		// 返回*开头的信息
		let execClass = record.getClass();
		switch (execClass) {
			case "stopped":
				const stopReason = record.getResult("reason");
				if (stopReason == undefined) {
					this.emit("step", record);
				}
				else {
					switch (stopReason) {
						case "breakpoint-hit":
							kernelChangeFocus(record.getResult("is-device") === 'true');
							this.emit("breakpoint-hit", record);
							break;
						case "watchpoint-trigger":
						case "read-watchpoint-trigger":
						case "access-watchpoint-trigger":
						case "function-finished":
						case "location-reached":
						case "end-stepping-range":
						case "watchpoint-scope":
						case "solib-event":
						case "syscall-entry":
						case "syscall-return":
						case "fork":
						case "vfork":
						case "exec":
							this.emit("step", record);
							break;
						case "signal-received":
							if (record.getResult("signal-meaning") == "Interrupt") {
								this.emit("paused", record);
							}
							else {
								this.emit("signal-received", record);
							}
							break;
						case "exited-normally":
							this.emit("exited-normally", record);
							break;
						case "exited":
							this.log("stderr", `Program exited ${record.getResult("exit-code")}`);
							this.emit("exited-normally", record);
							break;
						default:
							this.log("stderr", "Unkown stop reason: " + stopReason);
							break;
					}
				}
				break;
			case "running":
				this.emit("running", record);
				break;
			default:
				this.log("stderr", JSON.stringify(record));
				break;
		}
	}

	private handleAsyncNotifyRecord(record: AsyncRecord) {
		// 返回=开头的信息
		switch (record.getClass()) {
			case "thread-created":
				this.emit("thread-created", record);
				break;
			case "thread-exited":
				this.emit("thread-exited", record);
				break;
			default:
				break;
		}
	}

	private handleAsyncStatusRecord(record: AsyncRecord) {
		// 返回+开头的信息，预留
	}

	private handleAsyncRecord(record: AsyncRecord) {
		let recordType = record.getType();
		switch (recordType) {
			case AsyncRecordType.EXEC:
				this.handleAsyncExecRecord(record);
				break;
			case AsyncRecordType.NOTIFY:
				this.handleAsyncNotifyRecord(record);
				break;
			case AsyncRecordType.STATUS:
				this.handleAsyncStatusRecord(record);
				break;
			default:
				break;
		}
	}

	private handleStreamRecord(record: StreamRecord) {
		if (record.getCString().includes('[ERROR]')) {
			let handler = new ErrorStreamRecordHandler(record.getCString());
			const errorLog = handler.handle();
			if (errorLog != '') {
				this.log("stderr", `${String(errorLog)}`);
			}
		}
	}

	onOutput(line: string) {
		const lines = line.split('\n');
		lines.forEach(line => {
			try {
				let unknown = {"text": ""};
				const miOutput: OutputRecord = this.miParser.parse(line, unknown);
				if(unknown["text"] != "") {
					// 未知格式输出
					this.log("stdout", unknown["text"]);
					return;
				}

				if (miOutput == null) {
					// GDB Prompt
					return;
				}

				if (this.userInputCmdTokens.has(miOutput.getToken())) {
					let logContent:string;
					if (miOutput.getResult('result') != undefined) {
						let outputJson = JSON.stringify(miOutput.getResult('result'));
						logContent = outputJson.replace(/\\\\n/g, '\r\n').replace(/\"$/, '').replace(/^\"/, '');
					} else {
						// e.g. log enable lldb commands
						logContent = miOutput.response;
					}
					this.log("console", logContent);
				}
				if (!this.userInputCmdTokens.has(miOutput.getToken()) && this.printMiOutput) {
					this.log("console", `MI Output: ${JSON.stringify(miOutput)}`);
				}

				if (miOutput) {
					switch (miOutput.constructor) {
						case AsyncRecord:
							this.handleAsyncRecord(miOutput as AsyncRecord);
							break;
						case ResultRecord:
							this.handleResultRecord(miOutput as ResultRecord);
							break;
						case StreamRecord:
							this.handleStreamRecord(miOutput as StreamRecord);
							break;
					}
				}
			}
			catch (error) {
				this.log("stderr", `Encounter error: ${String(error)}`);
				this.emit("quit");
			}
		});
	}

	execRun(): Promise<boolean> {
		var cmd:string = 'run';
		if (this.targetArgs != undefined && this.targetArgs.length != 0) {
			cmd = `run ${escape(this.targetArgs.join(' '))}`;
		}
		return new Promise((resolve, reject) => {
			this.sendCliCommand(cmd).then((info) => {
				if (info.getType() == "done")
					resolve(undefined);
				else
					reject();
			}, reject);
		});
	}

	exitDebugProcess() {
		const debugProc = this.process;
		const toKillDebugProc = setTimeout(() => {
			process.kill(-debugProc.pid);
		}, 1000);
		this.process.on("exit", function (code) {
			clearTimeout(toKillDebugProc);
		});
		this.sendRaw("-gdb-exit");
	}

	async interrupt(): Promise<boolean> {
		return new Promise((resolve, reject) => {
			this.sendCommand("exec-interrupt").then((info) => {
				resolve(info.getType() == "done");
			}, reject);
		});
	}

	async continue(reverse: boolean = false): Promise<boolean> {
		return new Promise((resolve, reject) => {
			this.sendCommand("exec-continue" + (reverse ? " --reverse" : "")).then((info) => {
				resolve(info.getType() == "running");
			}, reject);
		});
	}

	async next(reverse: boolean = false): Promise<boolean> {
		return new Promise((resolve, reject) => {
			this.sendCliCommand("next").then((info) => {
				resolve(info.getType() == "done");
			}, reject);
		});
	}

	async step(reverse: boolean = false): Promise<boolean> {
		return new Promise((resolve, reject) => {
			this.sendCliCommand("step").then((info) => {
				resolve(info.getType() == "done");
			}, reject);
		});
	}

	async stepOut(reverse: boolean = false): Promise<boolean> {
		return new Promise((resolve, reject) => {
			this.sendCliCommand("finish").then((info) => {
				resolve(info.getType() == "done");
			}, reject);
		});
	}

	async goto(filename: string, line: number): Promise<boolean> {
		return new Promise((resolve, reject) => {
			const target: string = (filename ? '"' + escape(filename) + '":' : "") + line;
			this.sendCliCommand("jump " + target).then(() => {
				this.emit("step", undefined);
				resolve(true);
			}, reject);
		});
	}

	async changeVariable(name: string, rawValue: string): Promise<any> {
		return this.sendCommand("gdb-set var " + name + "=" + rawValue);
	}

	async setBreakPointCondition(bkptNum, condition): Promise<any> {
		return this.sendCommand("break-condition " + bkptNum + " \"" + escape(condition) + "\" 1");
	}

	async setEntryBreakPoint(entryPoint: string): Promise<any> {
		return this.sendCommand("break-insert -t -f " + entryPoint);
	}

	async addBreakPoint(breakpoint: Breakpoint): Promise<[boolean, Breakpoint]> {
		return new Promise((resolve, reject) => {
			if (this.breakpoints.has(breakpoint))
				return resolve([false, undefined]);
			let locationOpt = "";
			if (breakpoint.breakCountCondition) {
				const numRegex = /\d+/;
				if (breakpoint.breakCountCondition[0] == ">")
					locationOpt += "-i " + numRegex.exec(breakpoint.breakCountCondition.substring(1))[0] + " ";
				else {
					const match = numRegex.exec(breakpoint.breakCountCondition)[0];
					if (match.length != breakpoint.breakCountCondition.length) {
						this.log("stderr", "Unsupported break count expression: '" + breakpoint.breakCountCondition + "'. Only supports 'X' for breaking once after X times or '>X' for ignoring the first X breaks");
						locationOpt += "-t ";
					} else if (parseInt(match) != 0)
						locationOpt += "-t -i " + parseInt(match) + " ";
				}
			}
			if (breakpoint.raw) {
				locationOpt += '"' + escape(breakpoint.raw) + '"';
			}
			else {
				locationOpt += `"${breakpoint.sourceFileName}:${breakpoint.lineNumber}"`;
			}

			// location="/home/user02/add_custom.cpp:31",前后带双引号
			const locationArr = locationOpt.split('/');
			let relativeLocaltion = locationArr[locationArr.length - 1];
			// relativeLocaltion=add_custom.cpp:31",需要在前面追加一个双引号
			relativeLocaltion = `"${relativeLocaltion}`;

			this.sendCommand("break-insert -f " + relativeLocaltion).then((result) => {
				if (result.getType() == "done") {
					const breakPointNum = parseInt(result.getResult("bkpt")["number"]);
					const newBreakPoint: Breakpoint = {
						sourceFileName: breakpoint.sourceFileName ? breakpoint.sourceFileName : result.getResult("bkpt")["file"],
						raw: breakpoint.raw,
						lineNumber: parseInt(result.getResult("bkpt")["line"]),
						breakCondition: breakpoint.breakCondition
					};
					if (breakpoint.breakCondition) {
						this.setBreakPointCondition(breakPointNum, breakpoint.breakCondition).then((result) => {
							if (result.getType() == "done") {
								this.breakpoints.set(newBreakPoint, breakPointNum);
								resolve([true, newBreakPoint]);
							} else {
								resolve([false, undefined]);
							}
						}, reject);
					} else {
						this.breakpoints.set(newBreakPoint, breakPointNum);
						resolve([true, newBreakPoint]);
					}
				} else {
					reject(result);
				}
			}, reject);
		});
	}

	async clearBreakPoints(source?: string): Promise<any> {
		return new Promise((resolve, reject) => {
			const promises = [];
			const breakpoints = this.breakpoints;
			this.breakpoints = new Map();
			breakpoints.forEach((breakPointNumber, breakpoint) => {
				if (breakpoint.sourceFileName === source) {
					promises.push(this.sendCommand("break-delete " + breakPointNumber).then((result) => {
						if (result.getType() == "done") resolve(true);
						else resolve(false);
					}));
				} else {
					this.breakpoints.set(breakpoint, breakPointNumber);
				}
			});
			Promise.all(promises).then(resolve, reject);
		});
	}

	async getThreadsInfo(): Promise<ThreadInfo[]> {
		const result = await this.sendCommand("thread-info");
		const threads = result.getResult("threads");
		return threads.map(element => {
			const ret: ThreadInfo = {
				id: parseInt(element["id"]),
				targetId: element["target-id"]
			};
			return ret;
		});
	}

	async getStackListFramesInfo(startFrame: number, maxLevels: number, thread: number): Promise<StackFrameInfo[]> {
		const options: string[] = [];

		if (thread != 0) {
			options.push("--thread " + thread);
		}

		const depth: number = parseInt((await this.sendCommand(["stack-info-depth"].concat(options).join(" "))).getResult("depth"));
		const lowFrame: number = startFrame ? startFrame : 0;
		const highFrame: number = (maxLevels ? Math.min(depth, lowFrame + maxLevels) : depth) - 1;

		if (highFrame < lowFrame) {
			return [];
		}

		options.push(lowFrame.toString());
		options.push(highFrame.toString());

		const result = await this.sendCommand(["stack-list-frames"].concat(options).join(" "));
		const stackFramesInfo = result.getResult("stack");
		return stackFramesInfo.map(frameInfo => {
			let frame = frameInfo[1];
			const level = frame["level"];
			const addr = frame["addr"];
			const func = frame["func"];
			const filename = frame["file"];
			let fileFullName: string = frame["fullname"];
			if (fileFullName) {
				fileFullName = path.normalize(fileFullName);
			}

			let line = 0;
			const lnstr = frame["line"];
			if (lnstr)
				line = parseInt(lnstr);
			const from = parseInt(frame["from"]);
			return {
				pcAddr: addr,
				fileName: filename,
				fullFileName: fileFullName,
				functionName: func || from,
				frameNumber: level,
				pcLineNumber: line
			};
		});
	}

	async getStackVariables(thread: number, frame: number): Promise<ResultRecord> {
		const result = await this.sendCommand(`stack-list-variables --thread ${thread} --frame ${frame} --simple-values`);
		return result;
	}

	isPointType(element: any) {
		const type = element['type'];
		return type.includes('*');
	}

	tmpProcessPointValue(ret: StackVariable[], element: any) {
		let valueOfElement = element['value'];
		if (valueOfElement) {
			const regex = / "[^"]*"/g;
			valueOfElement = valueOfElement.replace(/'/g, '"').replace(regex, "");
			for (let i = 0; i < element.length; i++) {
				if (element[i][0] === 'value') {
					element[i][1] = valueOfElement;
				}
			}
		}
		const key = element['name'];
		const value = element['value'];
		const type = element['type'];
		ret.push({
			name: key,
			value: value,
			type: type,
			raw: element
		})
	}

	async getRegistersNames(): Promise<ResultRecord> {
		let command = "data-list-register-names";
		return await this.sendCommand(command);
	}

	async getRegistersValues(): Promise<ResultRecord> {
		let command = "data-list-register-values x";
		return await this.sendCommand(command);
	}

	async evalExpression(name: string, thread: number, frame: number): Promise<OutputRecord> {
		let command = "data-evaluate-expression ";
		if (thread != 0) {
			command += `--thread ${thread} --frame ${frame} `;
		}
		command += name;
		let evalExpressionResult = await this.sendCommand(command);
		return evalExpressionResult;
	}

	async varListChildren(name: string): Promise<VariableObjectChild[]> {
		const res = await this.sendCommand(`var-list-children --all-values ${this.quote(name)}`);
		const children = res.getResult("children") || [];
		const omg: VariableObjectChild[] = children.map(child => new VariableObjectChild(child[1]));
		return omg;
	}

	log(type: string, msg: string, newLine: boolean = true) {
		// 屏蔽添加删除断点会打印异常信息
		if (msg?.includes('failed to set breakpoint site at')) {
			return;
		}

		let msgOutput = msg.replace(/\\{1,3}[trn]/g, '');
		if (newLine) {
			msgOutput += "\n";
		}
		msdebugLogger(type, msg);
		this.emit("output", type, msgOutput);
	}

	async sendUserInput(command: string, threadId: number = 0, frameLevel: number = 0): Promise<ResultRecord> {
		if (command.startsWith("-")) {
			return this.sendCommand(command.substring(1));
		} else {
			return this.sendCliCommand(command, threadId, frameLevel, true);
		}
	}

	async readMemoryRequest(memoryReference:MemoryReference, offset: number, count: number): Promise<any> {
		return new Promise((resolve, reject) => { })
	}

	sendRaw(raw: string, token:number = undefined) {
		if (this.printMiInput) {
			this.log("console", `MI Input: ${raw}`);
		}
		this.process.stdin.write(raw + "\n");
	}

	async sendCliCommand(command: string, threadId: number = 0, frameLevel: number = 0, isUserInput: boolean = false): Promise<ResultRecord> {
		let miCommand = "interpreter-exec ";
		miCommand += `command "${command.replace(/[\\"']/g, '\\$&')}"`;
		return this.sendCommand(miCommand, isUserInput);
	}

	async sendCommand(command: string, isUserInput: boolean = false): Promise<ResultRecord> {
		const sel = this.currentToken++;
		return new Promise((resolve, reject) => {
			this.handlers[sel] = (node: ResultRecord) => {
				if (node && node.getType() == ResultRecordType.ERROR) {
					reject(new Error(node.response));
				} else {
					resolve(node);
				}
			};
			if (isUserInput) {
				this.userInputCmdTokens.add(sel);
			}
			this.sendRaw(sel + "-" + command, sel);
		});
	}

	isReady(): boolean {
		return !!this.process;
	}

	protected quote(text: string): string {
		return /^-|[^\w\d\/_\-\.]/g.test(text) ? ('"' + escape(text) + '"') : text;
	}

	printMiInput: boolean;
	printMiOutput: boolean;
	targetArgs:string[];
	userInputCmdTokens = new Set();
	features: string[];
	public envs: any;
	private miParser: MIParser;
	protected currentToken: number = 1;
	protected handlers: { [index: number]: (info: OutputRecord) => any } = {};
	protected breakpoints: Map<Breakpoint, number> = new Map();
	protected outBuffer: string;
	protected errbuf: string = '';
	protected process: ChildProcess.ChildProcess;
	protected stream;
}

export function execCmd(cmd:string):Promise<any> {
    return new Promise((resolve, reject) => {
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else{
                resolve(stdout);
            }
        })
    });
}


export async function getMsdebugMiPath(sourceMsdebugMiPath: string, envs: string[]): Promise<any> {
	if (sourceMsdebugMiPath != undefined && !validatePath(sourceMsdebugMiPath, await getUserHomePath(), '/usr')) {
		throw new Error(`Invalid path for msdebugMiPath. msdebugMiPath=${sourceMsdebugMiPath}`);
	}

	let targetMiPath = sourceMsdebugMiPath;
	if (sourceMsdebugMiPath == undefined && envs['ASCEND_TOOLKIT_HOME'] != undefined) {
		targetMiPath = `${envs['ASCEND_TOOLKIT_HOME']}/tools/msdebug/bin/msdebug-mi`;
	}
	return targetMiPath;
}


export async function getUserHomePath(): Promise<string> {
	let homePath = await execCmd('echo $HOME').catch(err => {throw err});
    homePath = (homePath.trim() == '') ? '/' : homePath.replace(/\n/g, '');
	return homePath;
}
