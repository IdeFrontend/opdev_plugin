/**
 * Copyright (c) 2024 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Variable } from "@vscode/debugadapter";
import { DebugProtocol } from "@vscode/debugprotocol/lib/debugProtocol";

export interface Breakpoint {
	sourceFileName?: string;
	lineNumber?: number;
	raw?: string;
	breakCondition: string;
	breakCountCondition?: string;
}

export interface ThreadInfo {
	id: number;
	targetId: string;
}

export interface StackFrameInfo {
	frameNumber: number;
	pcAddr: string;
	functionName: string;
	fileName: string;
	fullFileName: string;
	pcLineNumber: number;
}

export interface StackVariable {
	name: string;
	value: string;
	type: string;
	raw?: any;
}


export class VariableObjectChild {
	name: string;
	expressionShown: string;
	childrenNum: number;
	type: string;
	value: string;
	globalThreadId: string;
	isFrozen: boolean;
	isDynamic: boolean;
	displayhint: string;
	selectedRangehasMore: boolean;
	id: number;
	constructor(node: any) {
		this.name = node["name"];
		this.expressionShown = node["exp"];
		this.childrenNum = parseInt(node["numchild"]);
		this.type = node["type"];
		this.value = node["value"];
		this.globalThreadId = node["thread-id"];
		this.isFrozen = !!node["frozen"];
		this.isDynamic = !!node["dynamic"];
		this.displayhint = node["displayhint"];
		this.selectedRangehasMore = !!node["has_more"];
	}

	public isCompound(): boolean {
		return this.childrenNum > 0 ||
			this.value === "{...}" ||
			(this.isDynamic && (this.displayhint === "array" || this.displayhint === "map"));
	}

	public toDebugProtocolVariable(): DebugProtocol.Variable {
		let protocoName = this.expressionShown;
		let protocoEvaluateName = this.name;
		let protocoVal = (this.value === void 0) ? "<unknown>" : this.value;
		let protocoType = this.type;
		let protocoVariablesReference = this.id;
		const res: DebugProtocol.Variable = {
			name: protocoName,
			evaluateName: protocoEvaluateName,
			value: protocoVal,
			type: protocoType,
			variablesReference: protocoVariablesReference
		};
		return res;
	}
}