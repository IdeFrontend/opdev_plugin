import { message } from '../../../untils/Message';

/**
 * 下载数据到本地
 */
export const handleDownload = (nodeData: any) => {
  // 根据节点类型确定文件路径
  let filePath = '';
  if (nodeData.filePath) {
    filePath = nodeData.filePath;
  } else if (nodeData.key) {
    // 如果是文件夹节点，可能需要特殊处理
    filePath = nodeData.key;
  }

  console.log('下载数据到本地:', filePath);
  message.sendMessageToParent({
    command: 'vscodeDownloadData',
    data: {
      filePath: filePath,
      nodeKey: nodeData.key,
    },
  });
};

/**
 * 删除节点
 */
export const handleDelete = (nodeData: any) => {
  console.log('删除节点:', nodeData.key);
  message.sendMessageToParent({
    command: 'vscodeDeleteNode',
    data: {
      nodeKey: nodeData.key,
      filePath: nodeData.filePath,
    },
  });
};
