import { request } from '@/core/request';
import {
  CheckPathExistsParams, SaveFileParams, SaveFileResult,
} from '@shared/api-types';

/**
 * 检查路径是否存在
 */
export function checkPathExists(params: CheckPathExistsParams) {
  return request.post<CheckPathExistsParams, boolean>(
    'common/pathExists',
    params,
  );
}

/**
 * 保存至本地文件
 * Web 版本会自动触发浏览器下载，桌面版本会显示保存对话框
 */
export async function saveFileToLocal(params: SaveFileParams): Promise<boolean> {
  const result = await request.post<SaveFileParams, SaveFileResult>(
    'common/saveFileToLocal',
    params,
  );

  // 如果是 Web 版本返回的文件数据，触发浏览器下载
  if (typeof result === 'object' && result !== null && 'data' in result && 'filename' in result) {
    try {
      console.log('[saveFileToLocal] ========== 开始处理下载 ==========');
      console.log('[saveFileToLocal] 文件名:', result.filename);
      console.log('[saveFileToLocal] Base64 数据长度:', result.data.length);
      console.log('[saveFileToLocal] Base64 数据前100字符:', result.data.substring(0, Math.min(100, result.data.length)));

      // 将 Base64 转换为 Blob
      console.log('[saveFileToLocal] 开始 Base64 解码...');
      let binaryString: string;
      try {
        binaryString = atob(result.data);
        console.log('[saveFileToLocal] ✓ Base64 解码成功，二进制字符串长度:', binaryString.length);
      }
      catch (error) {
        console.error('[saveFileToLocal] ✗ Base64 解码失败:', error);
        throw new Error('Base64 数据格式错误');
      }

      console.log('[saveFileToLocal] 创建 Uint8Array...');
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      console.log('[saveFileToLocal] ✓ Uint8Array 创建成功，长度:', bytes.length);
      console.log('[saveFileToLocal] Uint8Array 前100字节:', Array.from(bytes.slice(0, Math.min(100, bytes.length))));

      // 根据文件扩展名确定 MIME 类型
      const filename = result.filename || 'download';
      const extension = filename.split('.').pop()?.toLowerCase();
      let mimeType = 'application/octet-stream';
      if (extension === 'zip') {
        mimeType = 'application/zip';
      }
      else if (extension === 'log') {
        mimeType = 'text/plain';
      }
      else if (extension === 'txt') {
        mimeType = 'text/plain';
      }
      else if (extension === 'json') {
        mimeType = 'application/json';
      }

      console.log('[saveFileToLocal] 创建 Blob...');
      const blob = new Blob([bytes], { type: mimeType });
      console.log('[saveFileToLocal] ✓ Blob 创建成功，大小:', blob.size, 'bytes', '类型:', mimeType);

      // 验证 Blob 大小是否正确
      if (blob.size === 0) {
        console.error('[saveFileToLocal] ✗ 错误：Blob 大小为 0！');
        throw new Error('文件数据为空，无法下载');
      }

      if (blob.size !== bytes.length) {
        console.warn('[saveFileToLocal] 警告：Blob 大小与 Uint8Array 长度不匹配', blob.size, 'vs', bytes.length);
      }

      // 创建下载链接并触发下载
      console.log('[saveFileToLocal] 创建下载链接...');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename || 'download.zip';
      link.style.display = 'none';
      link.setAttribute('download', result.filename || 'download.zip'); // 确保 download 属性设置
      document.body.appendChild(link);

      console.log('[saveFileToLocal] 准备触发下载');
      console.log('[saveFileToLocal] 链接 URL:', link.href.substring(0, 50) + '...');
      console.log('[saveFileToLocal] 文件名:', link.download);
      console.log('[saveFileToLocal] Blob 大小:', blob.size, 'bytes');

      // 立即触发点击，不使用 requestAnimationFrame
      // 因为用户交互已经发生，这里应该可以触发下载
      link.click();
      console.log('[saveFileToLocal] ✓ 下载链接已点击');

      // 延迟清理，确保下载已开始
      setTimeout(() => {
        if (link.parentNode) {
          document.body.removeChild(link);
        }
        URL.revokeObjectURL(url);
        console.log('[saveFileToLocal] ✓ 下载链接已清理');
      }, 1000);

      console.log('[saveFileToLocal] ========== 下载处理完成 ==========');
      console.log('[saveFileToLocal] 最终结果：文件名:', result.filename, '文件大小:', blob.size, 'bytes');
      return true;
    }
    catch (error) {
      console.error('下载处理失败:', error);
      throw new Error(`下载处理失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // 桌面版本直接返回 boolean
  if (typeof result === 'boolean') {
    return result;
  }

  // 如果返回格式不符合预期，记录警告
  console.warn('意外的返回格式:', result);
  throw new Error('服务器返回了意外的数据格式');
}

/**
 * 打开外部网站
 */
export function openExternalLink(url: string) {
  return request.post(
    'common/openExternalLink',
    url,
  );
}

/**
 * 执行 VSCode 命令
 */
export function executeVscodeCommand(command: string, ...args: any[]) {
  return request.post(
    'common/executeVscodeCommand',
    { command, args }
  );
}
