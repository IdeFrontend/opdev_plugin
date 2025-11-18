#  Copyright (c) 2025 Huawei Technologies Co., Ltd.
#
#  This source code is licensed under the MIT license found in the
#  LICENSE file in the root directory of this source tree.
#  ==============================================================================

from flask import Blueprint, request

from common.exception import InValidRequestException
from service.configuration import BaseConfiguration

configuration_bp = Blueprint('configuration', __name__)

@configuration_bp.route('/<config_type>', methods=['GET'])
def get_configuration(config_type):
    project_id = request.args.get('project_id')
    if not project_id:
        raise InValidRequestException('request body is invalid')
    data = BaseConfiguration.get_config(project_id, config_type)
    return {
        'code': 0,
        'data': data,
        'message': 'success',
    }


@configuration_bp.route('/<config_type>', methods=['POST'])
def post_configuration(config_type):
    data = request.get_json()
    if not data:
        raise InValidRequestException('request body is empty')
    data['config_type'] = config_type
    config_id = BaseConfiguration.post_config(data)
    return {
        'code': 0,
        'data': config_id,
        'message': 'success',
    }
