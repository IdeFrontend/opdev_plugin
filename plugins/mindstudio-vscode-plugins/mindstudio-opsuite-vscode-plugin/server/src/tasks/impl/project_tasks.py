#  Copyright (c) 2025 Huawei Technologies Co., Ltd.
#  #
#  This source code is licensed under the MIT license found in the
#  LICENSE file in the root directory of this source tree.
#  ==============================================================================
from typing import Any

from ..task_executor import Task, register_task


@register_task
class CreateProjectTask(Task):
    def get_name(self) -> str:
        return "create_project"

    def add_task_parser(self, task_subparsers):
        create_project_parser = task_subparsers.add_parser('create_project', help='Create a new project')
        create_project_parser.add_argument('--project_name', type=str, help="Project name")
        create_project_parser.add_argument('--project_path', type=str, help="Project path")

    def collect_task_args(self, task_args) -> dict[str, Any]:
        args_dict = {
            'project_name': getattr(task_args, 'project_name', None),
            'project_path': getattr(task_args, 'project_path', None)
        }
        return {k: v for k, v in args_dict.items() if v is not None}

    def execute(self, **kwargs):
        try:
            from service.project import create_project

            project_data = {
                'project_name': kwargs.get('project_name'),
                'project_path': kwargs.get('project_path')
            }
            project_data = {k: v for k, v in project_data.items() if v is not None}
            project_id = create_project(project_data)
            return {
                'code': 0,
                'data': project_id,
                'message': 'success'
            }
        except Exception as e:
            return {
                'code': 1,
                'data': str(e),
                'message': 'error'
            }
