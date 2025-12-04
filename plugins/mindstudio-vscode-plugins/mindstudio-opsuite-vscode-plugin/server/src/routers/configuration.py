#  Copyright (c) 2025 Huawei Technologies Co., Ltd.
#
#  This source code is licensed under the MIT license found in the
#  LICENSE file in the root directory of this source tree.
#  ==============================================================================
from flask import Blueprint, request

from common.exception import InValidRequestException
from service.configuration import config_process_registry

configuration_bp = Blueprint('configuration', __name__)


@configuration_bp.route('/<config_type>', methods=['GET'])
def get_configuration(config_type):
    project_id = request.args.get('project_id')
    op = request.args.get('op', None)
    if not project_id or config_type not in config_process_registry:
        raise InValidRequestException('request body is invalid')
    data = config_process_registry.get(config_type).get_config(project_id, config_type, op)
    return {
        'code': 0,
        'data': data,
        'message': 'success',
    }


@configuration_bp.route('/<config_type>', methods=['POST'])
def post_configuration(config_type):
    data_list = request.get_json()
    if not data_list or config_type not in config_process_registry:
        raise InValidRequestException('request body is invalid')
    config_id = config_process_registry.get(config_type).post_config(data_list)
    return {
        'code': 0,
        'data': config_id,
        'message': 'success',
    }

@configuration_bp.route('/<project_id>/<config_name>', methods=['DELETE'])
def delete_configuration(project_id, config_name):
    if not project_id or not config_name:
        raise InValidRequestException('request body is invalid')
    delete_config = config_process_registry.get('default').delete_config(project_id, config_name)
    return {
        'code': 0,
        'data': delete_config,
        'message': 'success',
    }