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