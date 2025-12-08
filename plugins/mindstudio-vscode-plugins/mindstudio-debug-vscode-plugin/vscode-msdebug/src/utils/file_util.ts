import * as fs from "fs";
import * as path from "path";

export function readFileContent(filePath:string):string {
    if (!fs.existsSync(filePath)) {
        throw new Error(`${filePath} not exist`);
    }

    let fileContent = "";
    try {
        fileContent = fs.readFileSync(filePath, "utf-8");
    }
    catch (err) {
        throw new Error(String(err));
    }
    return fileContent;
}

export function isFileExist(fileName: string, cwd: string='') {
	let ret = true;
    if (cwd != '') {
        fileName = `${cwd}/${fileName}`
    }
	try {
		fs.accessSync(fileName, fs.constants.F_OK);
	} catch (err) {
		ret = false;
	}
	return ret;
}



export function validatePath(filePath:string, homePath:string, customizedValidDir = 'notExistDir/'):boolean {
    let normalizedFilePath = path.normalize(filePath);

    if (!fs.existsSync(normalizedFilePath)) {
       return false;
    }

    if (homePath == '/root' || normalizedFilePath.startsWith(homePath) || normalizedFilePath.startsWith(customizedValidDir) || normalizedFilePath.startsWith('~')) {
        return true;
    }
    return false;
}