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
      console.log('开始处理下载，文件名:', result.filename, '数据长度:', result.data.length);

      // 将 Base64 转换为 Blob
      const binaryString = atob(result.data);
      const bytes = new Uint8Array(binaryString.length);

      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: 'application/zip' });

      console.log('Blob 创建成功，大小:', blob.size, 'bytes');

      // 创建下载链接并触发下载
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.download = result.filename || 'download.zip';
      link.style.display = 'none';
      link.setAttribute('download', result.filename || 'download.zip'); // 确保 download 属性设置
      document.body.appendChild(link);

      console.log('准备触发下载，链接:', link.href, '文件名:', link.download);

      // 立即触发点击，不使用 requestAnimationFrame
      // 因为用户交互已经发生，这里应该可以触发下载
      link.click();

      // 延迟清理，确保下载已开始
      setTimeout(() => {
        if (link.parentNode) {
          document.body.removeChild(link);
        }

        URL.revokeObjectURL(url);
        console.log('下载链接已清理');
      }, 1000);

      console.log('下载已触发，文件名:', result.filename, '文件大小:', blob.size, 'bytes');

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
    {
      command,
      args,
    },
  );
}

export function getSanitizerShowQuickOptions() {
  return request.post<undefined, boolean>('common/getSanitizerShowQuickOptions', undefined);
}

export function setSanitizerShowQuickOptions(value: boolean) {
  return request.post<{ value: boolean }, void>('common/setSanitizerShowQuickOptions', { value });
}

export function getSimulationShowQuickOptions() {
  return request.post<undefined, boolean>('common/getSimulationShowQuickOptions', undefined);
}

export function setSimulationShowQuickOptions(value: boolean) {
  return request.post<{ value: boolean }, void>('common/setSimulationShowQuickOptions', { value });
}

export function getOnBoardAnalysisShowQuickOptions() {
  return request.post<undefined, boolean>('common/getOnBoardAnalysisShowQuickOptions', undefined);
}

export function setOnBoardAnalysisShowQuickOptions(value: boolean) {
  return request.post<{ value: boolean }, void>('common/setOnBoardAnalysisShowQuickOptions', { value });
}
