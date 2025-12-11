#  Copyright (c) 2025 Huawei Technologies Co., Ltd.
#  #
#  This source code is licensed under the MIT license found in the
#  LICENSE file in the root directory of this source tree.
#  ==============================================================================
import platform
from pathlib import Path

import distro

from configs.config import settings


def get_python_cmd():
    if settings.environment == "development":
        return "python"
    else:
        return "python3"


def get_detailed_system_info():
    system = platform.system().lower()
    arch = platform.machine().lower()

    # 架构映射
    arch_map = {
        'x86_64': 'x86_64',
        'amd64': 'x86_64',
        'aarch64': 'aarch64',
        'arm64': 'aarch64'
    }

    architecture = arch_map.get(arch, arch)

    if system == "linux":
        # 使用distro获取精确的发行版信息
        os_name = distro.id()  # ubuntu, centos, debian等
    else:
        os_name = system

    return os_name, architecture


def get_op_run_path(op):
    op_path = Path(op.op_path)
    # 根据算子类型确定脚本路径
    if op.op_type == 'ascend':
        return op_path.parent.parent
    else:
        return op_path

def get_default_target(op_run_path, op):
    os_name, architecture = get_detailed_system_info()
    target_dir = op_run_path / 'build_out'

    # 根据算子类型确定目标文件名
    if op.op_type == 'ascend':
        target_op_file = op_run_path / 'build_out' / f'cann-ops-math-custom_linux-{architecture}.run'
        target_example_file = op_run_path / 'build' / f'test_aclnn_{op.op_name}'
    else:
        target_example_file = target_op_file = op_run_path / 'build' / op.op_name
    return target_dir, target_op_file, target_example_file


def get_build_script_path(op_run_path):
    return op_run_path / 'build.sh'


def get_default_path(op):
    op_run_path = get_op_run_path(op)
    target_dir, target_op_file, target_example_file = get_default_target(op_run_path, op)
    example_script_path = op_script_path = get_build_script_path(op_run_path)
    return str(op_script_path), str(example_script_path), str(target_dir.absolute()), str(target_op_file.absolute()), str(
        target_example_file.absolute())