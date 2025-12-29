#  Copyright (c) 2025 Huawei Technologies Co., Ltd.
#
#  This source code is licensed under the MIT license found in the
#  LICENSE file in the root directory of this source tree.
#  ==============================================================================

from flask import Blueprint, request

from common.exception import InValidRequestException
from service.project import create_project, delete_project


project_bp = Blueprint('project', __name__)

@project_bp.route('', methods=['POST'])
def create():
    data = request.get_json()
    if not data or 'project_path' not in data or 'project_name' not in data:
        raise InValidRequestException('request body is invalid')
    project_id = create_project(data)
    return {
        'code': 0,
        'data': project_id,
        'message': 'success'
    }

@project_bp.route('', methods=['DELETE'])
def delete():
    data = request.get_json() or {}

    project_id = data.get("project_id")
    project_path = data.get("project_path")

    try:
        delete_project(project_id=project_id, project_path=project_path)
        return {
            'code': 0,
            'data': None,
            'message': 'success'
        }
    except InValidRequestException as e:
        return {
            'code': 400,
            'data': None,
            'message': str(e)
        }, 400
    except Exception as e:
        return {
            'code': 500,
            'data': None,
            'message': 'internal error'
        }, 500
