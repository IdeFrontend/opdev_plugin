#  Copyright (c) 2025 Huawei Technologies Co., Ltd.
#  #
#  This source code is licensed under the MIT license found in the
#  LICENSE file in the root directory of this source tree.
#  ==============================================================================
from typing import Dict, Any

from ..task_executor import register_task, Task


@register_task
class ListFilesTask(Task):
    def get_name(self) -> str:
        return "list_files"

    def database_required(self) -> bool:
        return False

    def add_task_parser(self, task_subparsers):
        list_files_parser = task_subparsers.add_parser('list_files', help='List all files')
        list_files_parser.add_argument('--path', type=str, required=True, help='Path to the folder')
        list_files_parser.add_argument('--file_type', type=str, default='all', help='Type of files to list contains dir')

    def collect_task_args(self, task_args) -> dict[str, Any]:
        args_dict = {
            'path': getattr(task_args, 'path', None),
            'file_type': getattr(task_args, 'file_type', None),
        }
        return {k: v for k, v in args_dict.items() if v is not None}

    def execute(self, **kwargs) -> Dict[str, Any]:
        try:
            from service.system_api import get_files
            path = kwargs.get('path')
            file_type = kwargs.get('file_type', 'all')
            files = get_files(path, file_type=file_type)
            return {
                'code': 0,
                'data': files,
                'message': 'success',
            }
        except Exception as e:
            return {
                'code': 1,
                'data': str(e),
                'message': 'error',
            }

