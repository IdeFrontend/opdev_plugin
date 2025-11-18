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
    if not data or 'op_name' not in data or 'project_id' not in data:
        raise InValidRequestException('request body is invalid')
    ops_prototype.generate_ops_prototype(data['op_name'], data['project_id'])
    return {
        'code': 0,
        'data': 0,
        'message': 'success'
    }
