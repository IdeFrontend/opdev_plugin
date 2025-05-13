/**
 * Copyright (c) 2024 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as fs from "fs";
import * as path from "path";
import {readFileContent} from "../utils/file_util";

/**
 * 替换用户输入的环境变量$VAR、${VAR}
 * @param envs 用户配置的环境变量, 可能含有$VAR、${VAR}
 * @param basicEnv 基础环境变量
 * @param isEnvScript 是否处理environ
 * @returns
 */
function replaceEnvVariable(envs: Map<string, string>[], retMap: Map<string, string>, isEnvScript: boolean): Map<string, string> {
    for (let env of envs) {
        if (!env.has("name") || !env.has("value")) {
            // 环境变量格式不对
            if (isEnvScript) {
                throw new Error(`environmentScript found bad format: ${env}`);
            }
            else {
                throw new Error(`environment bad format: ${env} , key must be name and value, found in launch.json`);
            }

        }

        let name = env.get("name");
        let value = env.get("value").trim();

        let valueList = value.split(":");
        let resultList = [];
        for (let vl of valueList) {
            let valueListList = vl.split("/");
            let resultListList = [];
            for (let vll of valueListList) {
                vll = vll.trim();

                let vllPure = "";
                let isEnv = false;
                if (vll.match(/^\${(.+)}$/)) {
                    // 环境变量有大括号
                    vllPure = vll.match(/^\${(.+)}$/)[1];
                    isEnv = true;
                }
                else if (vll.match(/^\$(.+)$/)) {
                    // 环境变量没有大括号
                    vllPure = vll.match(/^\$(.+)$/)[1];
                    isEnv = true;
                }
                else {
                    vllPure = vll;
                    isEnv = false;
                }

                if (isEnv) {
                    if (retMap.has(vllPure)) {
                        // 已有环境变量中存在该名称, 进行替换；找不到不做添加，相当于空
                        resultListList.push(retMap.get(vllPure));
                    }
                }
                else {
                    // 不是环境变量，原样添加
                    resultListList.push(vllPure);
                }
            }

            if (resultListList.length > 0) {
                resultList.push(resultListList.join("/"));
            }
        }
        retMap.set(name, resultList.join(":"));
    }

    return retMap;
}

/**
 * 读取环境变量文件
 * @param envFiles 用户配置的环境变量文件
 * @returns
 */
function readEnvFile(envFiles: string[]): Map<string, string>[] {
    let matchEnvReg = /^(export[\s]+){0,1}(\w+)=(.*)$/i;
    let invalidMatchEnvReg = /^(export[\s]+){0,1}(\w+)="(.*)"$/i;
    let fileEnvList = [];

    for (let filePath of envFiles) {
        let fileContent = readFileContent(filePath);
        let fileLines = fileContent.split(/\r?\n/);
        for (let fileLine of fileLines) {
            if (fileLine.trim() == "") {
                continue;
            }

            let mat = matchEnvReg.exec(fileLine);
            if (!mat) {
                // 导出环境变量格式不对
                throw new Error(`export enviroment bad format: ${fileLine}, found in ${filePath}`);
            }

            let invalidmatch = invalidMatchEnvReg.exec(fileLine);
            if (invalidmatch) {
                throw new Error(`Invalid format for extra quotation marks: ${fileLine}`);
            }

            let fileEnvMap = new Map<string, string>();
            fileEnvMap.set("name", mat[2]);
            fileEnvMap.set("value", mat[3]);
            fileEnvList.push(fileEnvMap);
        }

    }

    return fileEnvList;
}

/**
 * 基于process.env依次处理用户配置的environment、environmentScripts
 * @param envs 用户配置的环境变量environment
 * @param envFiles 用户配置的环境变量文件envionmentScripts
 * @returns 环境变量字典
 */
export function processEnv(envs: any[], envFiles: string[]): any {

    let basicEnv = new Map<string, string>();
    for (const k in process.env) {
        // vscode-server启动时刻的环境变量作为基准
        basicEnv.set(k, process.env[k]);
    }

    let envReplaced = new Map<string, string>();
    for (let [k, v] of basicEnv) {
        envReplaced.set(k, v.trim());
    }

    if (envFiles != null && envFiles.length > 0) {
        // 处理用户配置环境变量文件 environmentScripts, 先处理set_env.sh, 优先级低
        let inputFileEnvs = readEnvFile(envFiles);
        envReplaced = replaceEnvVariable(inputFileEnvs, basicEnv, true);
    }

    if (envs != null && envs.length > 0) {
        let inputEnvs = [];
        for (const envItem of envs) {
            let tmpMap = new Map<string, string>();
            for (const envK in envItem) {
                tmpMap.set(envK, envItem[envK]);
            }
            inputEnvs.push(tmpMap);
        }
         // 处理用户配置环境变量 environment， 在set_env.sh后面处理，优先级高
        envReplaced = replaceEnvVariable(inputEnvs, envReplaced, false);
    }

    let outputEnv = {};
    for (const [k, v] of envReplaced) {
        outputEnv[k] = v;
    }

    return outputEnv;
}

export function checkAndPrintPostLoadMessage(envs: any[], logFunc): any {
    // 0.check CANN is installed
    const cannInstalledFile = '/dev/drv_debug';
    if (!fs.existsSync(cannInstalledFile)) {
        throw new Error(`/dev/drv_debug is not found. Please install Ascend HDK 24.x with "--debug" or upgrade to Ascend HDK 25.x or higher version`);
    }

    // 1.read ascend_tool_kit version
    const ascendToolkitHome = envs['ASCEND_TOOLKIT_HOME'];
    if (ascendToolkitHome == undefined || ascendToolkitHome == '') {
        throw new Error(`$ASCEND_TOOLKIT_HOME not exist!`);
    }
    const ascendToolkitConfigInfoPath = `${ascendToolkitHome}/mindstudio-toolkit/ascend_install.info`;
    let configLines = readFileContent(ascendToolkitConfigInfoPath).split(/\r?\n/);
    let ascendToolkitVersion = '';
    for (const line of configLines) {
        if (line.startsWith('Install_Path_Param')) {
            const versionRegex = /\/(\w+\.\w+\.\w+)/;
            ascendToolkitVersion = line.match(versionRegex)[1];
        }
    }

    // 2.read driver info
    const driverDir = '/usr/local/Ascend/driver';
    const driverBuildInfoFile = `${driverDir}/build.info`;
    const driverVersionFile = `${driverDir}/version.info`;
    if (!fs.existsSync(driverDir)) {
        throw new Error(`HDK not installed!`);
    }
    let driverBuildInfo = readFileContent(driverBuildInfoFile).split(/\r?\n/)[0];
    let driverVersionContent = readFileContent(driverVersionFile).split(/\r?\n/);
    let driverVersion = driverVersionContent[0].split('=')[1];

    // 3. read plugin version
    const packageFilePath = path.join(__dirname, '../../package.json');
    const packageContent = readFileContent(packageFilePath);
    const packageJson = JSON.parse(packageContent);
    let extensionVersion = packageJson.version;

    // 4. print
    logFunc(`AscendToolKit version: ${ascendToolkitVersion}\r\nHDK build time:        ${driverBuildInfo}\r\nHDK build version:     ${driverVersion}\r\nExtension version:     ${extensionVersion}`);
}