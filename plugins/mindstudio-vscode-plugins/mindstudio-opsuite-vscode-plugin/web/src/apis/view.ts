import { request } from '@/core/request';

export function openCsvView(filePath: string): Promise<void> {
  return request.post('view/openCsvFile', filePath);
}

export function openInsightView(filePath: string): Promise<void> {
  return request.post('view/openInsight', filePath);
}
