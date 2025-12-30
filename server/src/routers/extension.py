#  Copyright (c) 2025 Huawei Technologies Co., Ltd.
#
#  This source code is licensed under the MIT license found in the
#  LICENSE file in the root directory of this source tree.
#  ==============================================================================

from flask import Blueprint, request

from common.exception import InValidRequestException
from utils.extension import register_extension


extension_bp = Blueprint('extension', __name__)


@extension_bp.route('/register', methods=['POST'])
def extension_register():
    data = request.get_json()
    if not data:
        raise InValidRequestException('request body is empty')
    extension_publisher = data.get('extension_publisher')
    extension_name = data.get('extension_name')
    extension_version = data.get('extension_version')
    if not extension_publisher or not extension_name or not extension_version:
        raise InValidRequestException('request body is invalid')
    if not register_extension(extension_publisher, extension_name, extension_version):
        raise InValidRequestException('register extension failed')
    return {'code': 0, 'data': {'status': 'success', 'message': 'extension registered'}}
