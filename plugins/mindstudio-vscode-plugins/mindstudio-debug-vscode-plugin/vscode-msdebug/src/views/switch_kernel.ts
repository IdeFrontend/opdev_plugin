/**
 * Copyright (c) 2024 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as vscode from 'vscode';

class KernelSwitchView {
    kernelStatusBar: vscode.StatusBarItem;
    allKernel: any = [];
    context: vscode.ExtensionContext;

    init = context => {
        if (!this.kernelStatusBar) {
            this.context = context;

            this.initChangeKernelBar();
            this.initChangeKernelEvent();
        }
    }

    setKernelText = body => {
        this.kernelStatusBar.text = `kernel: ${body.type} ${body.focusId}`;
    }

    kernelBarStatus = (isNpu: boolean) => {
        if (isNpu) {
            this.kernelStatusBar.show();
        } else {
            this.kernelStatusBar.hide();
        }
    }

    initChangeKernelBar = () => {
        this.kernelStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 0);
        this.kernelStatusBar.text = 'kernel: - ';
        this.kernelStatusBar.command = 'msdebug.ChangeKernel';
        this.kernelStatusBar.tooltip = 'Click to switch to the current kernel';
    }

    initChangeKernelEvent = () => {
	    this.context.subscriptions.push(vscode.commands.registerCommand('msdebug.ChangeKernel', this.changeKernel));

        vscode.debug.onDidReceiveDebugSessionCustomEvent((event) => {
            if (event.event === 'changeKernel') {
                const responseData = event.body;
    
                this.setKernelText(responseData);
                this.allKernel = responseData.allKernel;
            }
    
            if (event.event === 'changeKernelError') {
                vscode.window.showErrorMessage(event.body.message);
            }
    
            if (event.event === 'kernelFocus') {
                this.kernelBarStatus(event.body.focus);
            }
        });
    }

    changeKernel = async (): Promise<void> => {
        const value = await this.kernelInput();
    
        vscode.debug.activeDebugSession?.customRequest('changeKernel', value);
    }

    kernelInput = (): Promise<string> => {
        return new Promise((resolve, reject) => {
            const inputBox = vscode.window.createInputBox();
    
            inputBox.title = 'MindStudio Debug VSCode Plugin';
            inputBox.prompt = 'available cores: ' + this.allKernel.map(i => i[1] + ' ' + i[0]).join(',');
            inputBox.ignoreFocusOut = true;
            inputBox.placeholder = 'Please enter the core that needs to be switched, eg: "aiv 1" or "aic 1"';
            inputBox.onDidAccept(async () => {
                const value = inputBox.value;
                const regex = /^(aiv|aic)\s\d{1,3}$/;
    
                if (!value) {
                    inputBox.validationMessage = 'core can not be blank';
    
                    return;
                }
    
                if (!regex.test(value)) {
                    inputBox.validationMessage = 'Please enter the correct format "aic 1" or "aiv 1"';
    
                    return;
                }
    
                resolve(value);
                inputBox.dispose();
            });
    
            inputBox.onDidHide(() => {
                reject();
            });
    
            inputBox.show();
        });
    }
}

const kernelSwitchView = new KernelSwitchView();

export default kernelSwitchView;
