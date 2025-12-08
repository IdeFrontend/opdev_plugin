/**
 * Copyright (c) 2024 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as vscode from "vscode";
import kernelSwitchView from "./views/switch_kernel";
import memoryView from "./views/memory_view";
import kernelView from './views/kernel_view';
import tableView from './views/table_view';
import registerView from './views/register_view';
import initBtTreeView from "./views/btTreeView";

export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "MindStudio Debug VSCode Plugin" is now active!');

	kernelView.init(context);
	tableView.init(context);
	memoryView.init(context);
	registerView.init(context);
	initBtTreeView(context);
}
