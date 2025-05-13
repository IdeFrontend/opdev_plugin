/**
 * Copyright (c) 2024 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { MIBase } from "./mi_base";
import backendGlobal from '../utils/backend_global';
import { MemoryReference } from "../debug_session/memory";

export class MsdebugMI extends MIBase {

	async readMemoryRequest(memoryReference:MemoryReference, offset: number, count: number): Promise<any> {
		if (this.isHostState() || (!this.isHostState() && memoryReference.memoryLocation == 'COMMON')) {
			return this.examineMemory4Host(parseInt(memoryReference.address), offset, count, memoryReference);
		}
		if (memoryReference.dataType == 'char[]') {
			memoryReference.dataType = 'uint8_t[]';
			const result = await this.examineMemory4Kernel(memoryReference, offset, count).then((res) => {
				const arr = res.split(' ')
				// 内存值转成字符串后，可能为空格，故不用空格分隔
				return arr.map((item)=>String.fromCharCode(parseInt(`0x${item}`)));
			})
			memoryReference.dataType = 'char[]';
			return result;
		}
		
		return this.examineMemory4Kernel(memoryReference, offset, count);

	}

	async examineMemory4Host(originalAddress: number, offset: number, count: number, memoryReference:any): Promise<any> {
		let address = updateAddress(originalAddress, offset, 16);
		return new Promise((resolve, reject) => {
			this.sendCliCommand(`x/${count}xb ${address} --force`).then((result) => {
				resolve(this.parseExmaineMemoryCLIResultToStr(result.response, memoryReference));
			}, reject);
		});
	}

	async examineMemory4Kernel(memoryReference:MemoryReference, offset: number, count: number): Promise<any> {
		let originalAddress:number = parseInt(memoryReference.address);
		let address: string;

		if (memoryReference.memoryLocation == 'UB') {
			address = updateAddress(originalAddress, offset, 10);
		} else {
			address = updateAddress(originalAddress, offset, 16);
		}

		let querySize = Math.min(count, parseInt(memoryReference.dataLength) - offset);

		let cmd;
		if (memoryReference.dataType == 'bool') {
			cmd = `x -m ${memoryReference.memoryLocation} -f ${memoryReference.dataType} ${address} -s 1 -c ${querySize}`;
		} else {
			cmd = `x -m ${memoryReference.memoryLocation} -f ${memoryReference.dataType} ${address} -s ${querySize} -c 1`;
		}

		if (parseInt(memoryReference.dataLength) > 1024) {
			cmd += ' --force';
		}

		return new Promise((resolve, reject) => {
			this.sendCliCommand(cmd)
				.then((result) => {
					resolve(this.parseExmaineMemoryCLIResultToStr(result.getResult('result'), memoryReference));
				}, reject);
		});
	}

	isHostState(): boolean {
		return !backendGlobal.kernel.isNpu;
	}

	parseExmaineMemoryCLIResultToStr(input: string, memoryReference:any): string {
		if (input == undefined || input.length == 0) {
			return '';
		}
		if (this.isHostState() || memoryReference.memoryLocation == 'COMMON') {
			return this.parseMemoryToStrWhenHostState(input);
		}
		if (memoryReference.dataType == 'bool') {
			return this.parseMemoryToStrWhenKernelState4Bool(input, memoryReference.memoryLocation);
		}
		return this.parseMemoryToStrWhenKernelState4Uint8(input, memoryReference.memoryLocation);
	}

	parseMemoryToStrWhenHostState(input: string): string {
		const parts = input.split(/ |\n/);
		const hexRegx = new RegExp('^0x[\\da-f]{2}$');
		return parts.filter(part=> hexRegx.test(part)).map(part=>part.slice(2)).join(' ');
	}

	parseMemoryToStrWhenKernelState4Hex(input: string, memoryLocation: string): string {
		let regex;
		let from;
		if (memoryLocation == 'UB') {
			regex = /^0x[0-9a-f]{8}: 0x[0-9a-f]+/;
			from = 14;
		} else {
			regex = /^0x[0-9a-f]{12}: 0x[0-9a-f]+/;
			from = 18;
		}
		if (input.match(regex)) {
			return input.substring(from, input.length - 1);
		}
		return input;
	}

	parseMemoryToStrWhenKernelState4Uint8(input: string, memoryLocation: string): string {
		const firstColonIdx = input.indexOf(':');
		const regex = new RegExp(`^0x[0-9a-f]{${firstColonIdx - 2}}:\\s\\{.*\\}`);
		const from = firstColonIdx + 3
		const end = input.length - 3;
		let ret = input;
		if (input.match(regex)) {
			let hexAndSpaceStr = input.substring(from, end);
			ret = hexAndSpaceStr.replace(/0x/g, '');
		}
		return ret;
	}

	parseMemoryToStrWhenKernelState4Bool(input: string, memoryLocation: string): string {
		const arr = input.split(' ');
		const hexRegx = new RegExp('true|false')
		return arr.filter(str=>hexRegx.test(str)).map(str=> str.startsWith('true')?'true':'false').join(' ');
	}
}

function updateAddress(address: number, offset: number, addressNumberSystem: number): string {
	let res: string;
	if (addressNumberSystem == 16) {
		res = '0x' + (address + offset).toString(16).padStart(16, '0');
	} else if (addressNumberSystem == 10) {
		res = address + offset + '';
	} else {
		throw new Error('Not support.');
	}
	return res;
}