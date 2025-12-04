#  Copyright (c) 2025 Huawei Technologies Co., Ltd.
#  #
#  This source code is licensed under the MIT license found in the
#  LICENSE file in the root directory of this source tree.
#  ==============================================================================

from flask import Blueprint, request

from common.exception import InValidRequestException
from service import ops

ops_bp = Blueprint('ops', __name__)

@ops_bp.route('', methods=['POST'])
def generate_structure():
    data = request.get_json()
    if not data or 'project_id' not in data or 'ops_prototype_file' not in data:
        raise InValidRequestException('request body must contain project_id, ops_prototype_file')
    op_id = ops.generate_structure(data)
    return {
        'code': 0,
        'data': op_id,
        'message': 'success'
    }

@ops_bp.route('', methods=['GET'])
def get_ops():
    data = request.get_json()
    if not data or 'project_id' not in data:
        raise InValidRequestException('request body must contain project_id')
    op_list = ops.get_ops(project_id=data['project_id'])
    return {
        'code': 0,
        'data': op_list,
        'message': 'success'
    }


@ops_bp.route('/<project_id>/<op_name>', methods=['DELETE'])
def delete_ops(project_id, op_name):
    if not project_id or not op_name:
        raise InValidRequestException('request body is invalid')
    delete_count = ops.delete_ops(project_id, op_name)
    return {
        'code': 0,
        'data': delete_count,
        'message': 'success'
    }


@ops_bp.route('/add', methods=['POST'])
def add_exist_op():
    data = request.get_json()
    if not data or 'project_id' not in data or 'op_class' not in data or 'op_name' not in data:
        raise InValidRequestException('request body must contain project_id, ops_prototype_file')
    op_id = ops.add_exist_op(data)
    return {
        'code': 0,
        'data': op_id,
        'message': 'success'
    }