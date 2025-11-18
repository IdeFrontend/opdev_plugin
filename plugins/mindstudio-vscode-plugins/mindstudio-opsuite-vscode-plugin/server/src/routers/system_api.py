#  Copyright (c) 2025 Huawei Technologies Co., Ltd.
#  #
#  This source code is licensed under the MIT license found in the
#  LICENSE file in the root directory of this source tree.
#  ==============================================================================
from flask import Blueprint, request

from service import system_api
from utils.ascend_util import ascend_util

system_bp = Blueprint('system', __name__)

@system_bp.route('/<file_type>', methods=['GET'])
def list_directories(file_type):
    path = request.args.get('path')
    if path is None:
        items = system_api.get_default_ascend_env_sh_dir()
    else:
        items = system_api.get_files(path, file_type)
    return {
        'code': 0,
        'data': items,
        'message': 'success'
    }

@system_bp.route('/ascend_env_script', methods=['POST'])
def set_ascend_env_script():
    path = request.args.get('path')
    ascend_util.set_ascend_env_script(path)
    return {
        'code': 0,
        'data': 0,
        'message': 'success'
    }