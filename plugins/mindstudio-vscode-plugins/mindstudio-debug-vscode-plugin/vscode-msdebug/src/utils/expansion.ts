/**
 * Copyright (c) 2024 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

function loopResult(variableCreate: Function, result: object, needExpand: boolean, level: number) {
	let valueCreated = [];
	for (let key in result) {
		let varRef = 0;
		let val = result[key];
		if (typeof val == "object") {
			// 遍历底层节点
			let loopValueCreated = loopResult(variableCreate, val, needExpand, level + 1);
			let loopValueRmLevel = [];
			for (let lvc of loopValueCreated) {
				valueCreated.push(lvc);

				if (lvc["levelCreated"] == level + 1) {
					//创建底层节点
					loopValueRmLevel.push({
						name: lvc["name"],
						value: lvc["value"],
						variablesReference: lvc["variablesReference"]
					});
				}
			}
			varRef = variableCreate(loopValueRmLevel);
			valueCreated.push({
				name: key,
				value: "Object",
				variablesReference: varRef,
				levelCreated: level
			})
		} else {
			valueCreated.push({
				name: key,
				value: val.toString(),
				variablesReference: varRef,
				levelCreated: level
			})
		}
	}

	return valueCreated;
}

/**
 * VARIABLE/WATCH展开
 * @param variableCreate
 * @param record
 * @param needExpand
 * @returns
 */
export function expandValue(variableCreate: Function, record: any, needExpand: boolean = true): any {
	let level = 1;
	let results = loopResult(variableCreate, record, needExpand, level);
	let ret = [];
	for (let r of results) {
		if (r["levelCreated"] == 1) {
			ret.push({
				name: r["name"],
				value: r["value"],
				variablesReference: r["variablesReference"]
			});
		}
	}
	return ret;
}

///////////////////////
function loopResultStackListVariable(variableCreate: Function, result: object, needExpand: boolean, level: number) {
	let valueCreated = [];
	for (let key in result) {
		let varRef = 0;
		let val = result[key];
		if (typeof val == "object") {
			// 遍历底层节点
			let loopValueCreated = loopResult(variableCreate, val, needExpand, level + 1);
			let loopValueRmLevel = [];
			for (let lvc of loopValueCreated) {
				valueCreated.push(lvc);

				if (lvc["levelCreated"] == level + 1) {
					//创建底层节点
					loopValueRmLevel.push({
						name: lvc["name"],
						value: lvc["value"],
						variablesReference: lvc["variablesReference"]
					});
				}
			}
			varRef = variableCreate(loopValueRmLevel);
			valueCreated.push({
				name: key,
				value: "Object",
				variablesReference: varRef,
				levelCreated: level
			})
		} else {
			if (needExpand) {
				// this指针不需要展开

				if (/^0x[0-9a-fA-F]+/.exec(val)) {
					// 指针类型
					varRef = variableCreate(`*${key}`);
					val = `Object@${val}`;
				}
			}

			valueCreated.push({
				name: key,
				value: val.toString(),
				variablesReference: varRef,
				levelCreated: level
			})
		}
	}

	return valueCreated;
}

/**
 * VARIABLE最外层显示
 * @param variableCreate
 * @param record
 * @param needExpand
 * @returns
 */
export function expandValueStackListVariable(variableCreate: Function, record: any, needExpand: boolean = true): any {
	let level = 1;
	let results = loopResultStackListVariable(variableCreate, record, needExpand, level);
	let ret = [];
	for (let r of results) {
		if (r["levelCreated"] == 1) {
			ret.push({
				name: r["name"],
				value: r["value"],
				variablesReference: r["variablesReference"]
			});
		}
	}
	return ret;
}