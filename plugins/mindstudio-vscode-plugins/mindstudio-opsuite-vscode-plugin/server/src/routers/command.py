#  Copyright (c) 2025, Huawei Technologies.
#  All Rights Reserved.
#  #
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#  #
#      http://www.apache.org/licenses/LICENSE-2.0
#  #
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
#  ==============================================================================
from pathlib import Path

from flask import Blueprint, request, jsonify
from service.configuration import BaseConfiguration
from service.ops import get_op_by_project_id_and_op_name
from service.project import query_project_by_id
from utils import op_util
from utils.aicore_utils import aicore_utils
from utils.ascend_util import ascend_util

command_bp = Blueprint('command', __name__)

@command_bp.route('/get_build_op_command', methods=['GET'])
def get_build_op_command():
    """
        构造编译算子的命令
    """
    if "config_id" not in request.args:
        return jsonify({'code': 0, 'data': -1, 'message': 'config_id is missing'})

    config_id = request.args.get("config_id")
    config_data = BaseConfiguration.get_config_by_id(config_id)

    if config_data is None:
        return jsonify({'code': 0, 'data': -1, 'message': 'config_id is invalid'})

    build_script_path = config_data.script
    custom_options = config_data.custom_options

    if build_script_path is None:
        return jsonify({'code': 0, 'data': -1, 'message': 'build_script_path is none'})

    project = query_project_by_id(config_data.project_id)
    operator = get_op_by_project_id_and_op_name(config_data.project_id, config_data.op)
    source_cann = f". {project.ascend_env_script}" if project.ascend_env_script else f". {ascend_util.ascend_env_script}"
    project_path = Path(project.project_path)
    deploy_cmd = f"chmod +x {config_data.target_file} && {config_data.target_file}"

    if not op_util.assistant_script_exists(project_path):
        cd_cmd = f"cd {project.project_path}/{operator.op_class}/{operator.op_name}"
        build_cmd = f"bash {build_script_path} {custom_options if custom_options else ''}"
        return jsonify({'code': 0, 'data': " && ".join([source_cann, cd_cmd, build_cmd, deploy_cmd]), 'message': 'ok'})

    try:
        soc = ascend_util.soc_version
        vendor_name = "custom"
        op = config_data.op

        args = aicore_utils.parse_cmd_options(custom_options)

        if args and args.vendor_name is not None:
            vendor_name = args.vendor_name

        if args and args.soc is not None:
            soc = args.soc

        cd_cmd = f"cd {project.project_path}"
        cmd = f"bash {build_script_path} --pkg --soc={soc} --vendor_name={vendor_name} --ops={op}"
        return jsonify({'code': 0, 'data': " && ".join([source_cann, cd_cmd, cmd, deploy_cmd]), 'message': 'ok'})

    except Exception as e:
        return jsonify({'code': 0, 'data': -1, 'message': str(e)})





@command_bp.route('/get_build_example_command', methods=['GET'])
def get_build_example_command():
    """
        构造编译算子example的命令
    """
    if "config_id" not in request.args:
        return jsonify({'code': 0, 'data': -1, 'message': 'config_id is missing'})

    config_id = request.args.get("config_id")
    config_data = BaseConfiguration.get_config_by_id(config_id)

    if config_data is None:
        return jsonify({'code': 0, 'data': -1, 'message': 'config_id is invalid'})

    build_script_path = config_data.script
    custom_options = config_data.custom_options

    project = query_project_by_id(config_data.project_id)
    operator = get_op_by_project_id_and_op_name(config_data.project_id, config_data.op)
    source_cann = f". {project.ascend_env_script}" if project.ascend_env_script else f". {ascend_util.ascend_env_script}"
    project_path = Path(project.project_path)

    if not op_util.assistant_script_exists(project_path):
        cd_cmd = f"cd {project.project_path}/{operator.op_class}/{operator.op_name}"
        cmd = f"bash {build_script_path} {custom_options if custom_options else ''}"
        return jsonify({'code': 0, 'data': " && ".join([source_cann, cd_cmd, cmd]), 'message': 'ok'})

    try:
        vendor_name = "custom"
        pkg_mode = "cust"
        mode = "eager"

        op = config_data.op

        args = aicore_utils.parse_cmd_options(custom_options)

        if args and args.vendor_name is not None:
            vendor_name = args.vendor_name

        if args and args.pkg_mode is not None:
            pkg_mode = args.pkg_mode

        if args and args.mode is not None:
            mode = args.mode

        cd_cmd = f"cd {project.project_path}"
        cmd = f"bash {build_script_path} --run_example {op} {mode} {pkg_mode} {vendor_name}"
        return jsonify({'code': 0, 'data': " && ".join([source_cann, cd_cmd, cmd]), 'message': 'ok'})
    except Exception as e:
        return jsonify({'code': 0, 'data': -1, 'message': str(e)})