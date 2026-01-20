import { request } from '@/core/request';
import { CreatedProjectParams, OpenProjectParams  } from '@shared/api-types';

/**
 * 创建项目
 */
export function createdProject(params: CreatedProjectParams) {
  return request.post<CreatedProjectParams, void>(
    'webview/createdProject',
    params,
  );
}

/** 
 * 打开算子工程 
 */ 
export function openProject(params: OpenProjectParams) { 
  return request.post<OpenProjectParams, void>( 
    'webview/openProject', 
    params, 
  ); 
}