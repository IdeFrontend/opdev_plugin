import { downloadData, deleteNode } from '@/apis';

/**
 * 下载数据到本地
 */
export const handleDownload = async (nodeData: any) => {
  // 根据节点类型确定文件路径
  let filePath = '';
  if (nodeData.filePath) {
    filePath = nodeData.filePath;
  } else if (nodeData.key) {
    // 如果是文件夹节点，可能需要特殊处理
    filePath = nodeData.key;
  }

  console.log('下载数据到本地:', filePath);
  try {
    await downloadData({
      filePath: filePath,
      nodeKey: nodeData.key,
    });
  } catch (error) {
    console.error('下载数据失败:', error);
  }
};

/**
 * 删除节点
 */
export const handleDelete = async (nodeData: any) => {
  console.log('删除节点:', nodeData.key);
  try {
    await deleteNode({
      nodeKey: nodeData.key,
      filePath: nodeData.filePath,
    });
  } catch (error) {
    console.error('删除节点失败:', error);
  }
};
