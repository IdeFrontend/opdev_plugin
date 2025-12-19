import { message } from "../../../untils/Message";

/**
 * 打开 CSV 文件
 */
export const handleOpenCsv = (csvPath) => {
    console.log('打开 CSV 文件:', csvPath)
    message.sendMessageToParent({ 
        command: "vscodeOpenCsv", 
        data: csvPath 
    });
}

/**
 * 加载 BIN 文件
 */
export const handleLoadData = (binPath) => {
    console.log('加载 BIN 文件:', binPath)
    message.sendMessageToParent({ 
        command: "vscodeinsigLoadData", 
        data: binPath 
    });
}

/**
 * 下载数据到本地
 */
export const handleDownload = (nodeData: any) => {
    // 根据节点类型确定文件路径
    let filePath = ''
    if (nodeData.filePath) {
        filePath = nodeData.filePath
    } else if (nodeData.key) {
        // 如果是文件夹节点，可能需要特殊处理
        filePath = nodeData.key
    }
    
    console.log('下载数据到本地:', filePath)
    message.sendMessageToParent({
        command: "vscodeDownloadData",
        data: {
            filePath: filePath,
            nodeKey: nodeData.key
        }
    })
}

/**
 * 删除节点
 */
export const handleDelete = (nodeData: any) => {
    console.log('删除节点:', nodeData.key)
    message.sendMessageToParent({
        command: "vscodeDeleteNode",
        data: {
            nodeKey: nodeData.key,
            filePath: nodeData.filePath
        }
    })
}

