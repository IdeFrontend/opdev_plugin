/**
 * Copyright (c) 2024 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export class ExtendedVariable {
	constructor(public readonly name, public readonly options) {
	}
}

export class VariableScope {
	constructor(public readonly name: string, public readonly threadId: number, public readonly level: number) {
	}

	public static getVariableName(handle: number, name: string): string {
		return `var_${handle}_${name}`;
	}
}