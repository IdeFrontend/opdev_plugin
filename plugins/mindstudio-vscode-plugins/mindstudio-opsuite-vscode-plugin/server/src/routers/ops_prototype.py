#  Copyright (c) 2025 Huawei Technologies Co., Ltd.
#  #
#  This source code is licensed under the MIT license found in the
#  LICENSE file in the root directory of this source tree.
#  ==============================================================================
#
#  This source code is licensed under the MIT license found in the
#  LICENSE file in the root directory of this source tree.
#  ==============================================================================

from flask import Blueprint, request

from common.exception import InValidRequestException
from service import ops_prototype


ops_prototype_bp = Blueprint('ops_prototype', __name__)


@ops_prototype_bp.route('', methods=['POST'])
def generate():
    data = request.get_json()
    if 'project_id' not in data:
        raise InValidRequestException('request body is invalid')
    project_id = data['project_id']
    op_name = data.get('op_name', 'default_op')
    prototype_name = data.get('prototype_name', 'add_custom')
    ops_prototype.generate_ops_prototype(project_id, op_name, prototype_name)
    return {
        'code': 0,
        'data': 0,
        'message': 'success'
    }

@ops_prototype_bp.route('', methods=['GET'])
def list_ops_prototype():
    prototypes = ops_prototype.get_available_prototype()
    return {'code': 0, 'data': prototypes, 'message': 'success'}