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
import os
from flask import Blueprint, request, jsonify
from service.configuration import BaseConfiguration
from utils.aicore_utils import aicore_utils
from service.operator import Operator
from service.operator_example import OperatorExample




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

    build_script_file = os.path.basename(build_script_path)

    cmd = f"{build_script_path} {custom_options}"
    if not build_script_file.equals("assistant.py"):
        return jsonify({'code': 0, 'data': cmd, 'message': 'ok'})

    try:
        soc = aicore_utils.get_soc()
        vendor_name = "custom"
        op_id = config_data.op_ids
        project_id = config_data.project_ids
        operator = Operator.get_op_by_id(project_id, op_id)

        if operator is None:
            return jsonify({'code': 0, 'data': -1, 'message': 'ops is none'})

        args = aicore_utils.parse_cmd_options(custom_options)

        if args.vendor_name is not None:
            vendor_name = args.vendor_name

        if args.soc is not None:
            soc = args.soc

        cmd = f"{build_script_path} build --soc {soc} --vendor_name {vendor_name} --ops {operator.name}"
        return jsonify({'code': 0, 'data': cmd, 'message': 'ok'})

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

    if build_script_path is None:
        return jsonify({'code': 0, 'data': -1, 'message': 'build_script_path is none'})

    build_script_file = os.path.basename(build_script_path)

    cmd = f"{build_script_path} {custom_options}"

    #assistant.py是对标准build.sh的轻量级封装命令
    if not build_script_file.equals("assistant.py"):
        return jsonify({'code': 0, 'data': cmd, 'message': 'ok'})

    try:
        vendor_name = "custom"
        pkg_name = ""
        mode = ""

        op_id = config_data.op_ids
        project_id = config_data.project_ids
        operator = Operator.get_op_by_id(project_id, op_id)

        if operator is None:
            return jsonify({'code': 0, 'data': -1, 'message': 'ops is none'})

        args = aicore_utils.parse_cmd_options(custom_options)

        if args.vendor_name is not None:
            vendor_name = args.vendor_name

        if args.pkg_name is not None:
            pkg_name = args.pkg_name

        if args.mode is not None:
            mode = args.mode

        cmd = f"{build_script_path} run_example {operator.name} {mode} {pkg_name} {vendor_name}"
        return jsonify({'code': 0, 'data': cmd, 'message': 'ok'})
    except Exception as e:
        return jsonify({'code': 0, 'data': -1, 'message': str(e)})