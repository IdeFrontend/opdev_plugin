/**
 * Copyright (c) 2024 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export class ErrorStreamRecordHandler {
    private static errorLogLines: string = '';

    constructor(errorMsg: string) {
        this.errorMsg = errorMsg;
    }
    
    public handle():string{
        const ERROR_CODE_REGEX = /0x([0-9a-f]+)/
        const enablePrintLogErrorCodeList: string[] = ['0x20200'];

        const errorMsg = this.errorMsg.replace(/^\[ERROR\]/, '');
        if (errorMsg.match(ERROR_CODE_REGEX)) {
            let match = errorMsg.match(ERROR_CODE_REGEX);
            const errorCode = `0x${match[1]}`;
            if (enablePrintLogErrorCodeList.includes(errorCode)) {
                let res = ErrorStreamRecordHandler.errorLogLines;
                ErrorStreamRecordHandler.errorLogLines = '';
                return res;
            }
        }
        ErrorStreamRecordHandler.errorLogLines = (ErrorStreamRecordHandler.errorLogLines == '') ? this.errorMsg : `${ErrorStreamRecordHandler.errorLogLines}\r\n${this.errorMsg}`;
        return '';
    }

    public errorMsg: string;
}