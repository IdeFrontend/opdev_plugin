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


def assistant_script_exists(project_path):
    assistant_script = project_path / "scripts" / "opgen" / "opgen_standalone.py"
    return assistant_script.exists()

def get_default_target_dir(project_path, op, is_assistant_script=True):
    if is_assistant_script:
        return project_path / 'build'
    else:
        return project_path / op.op_class / op.op_name / 'build_output'

def get_default_target(project_path, op, is_assistant_script=True):
    os_name, architecture = get_detailed_system_info()
    target_dir = get_default_target_dir(project_path, op, is_assistant_script=is_assistant_script)
    target_op_file = target_dir / f'cann-ops-math-custom_linux_{architecture}.run' if is_assistant_script else target_dir / f'custom_opp_{os_name}_{architecture}.run'
    target_example_file = target_dir / f'test_aclnn_{op.op_name}_example'
    return target_dir, target_op_file, target_example_file

def get_default_script_path(project_path, op, is_assistant_script=True):
    if is_assistant_script:
        return project_path / 'build.sh'
    else:
        return project_path / op.op_class / op.op_name / 'build.sh'

def get_default_path(project, op):
    project_path = Path(project.project_path)
    is_assistant_script = assistant_script_exists(project_path)
    target_dir, target_op_file, target_example_file = get_default_target(project_path, op, is_assistant_script)
    script_path = get_default_script_path(project_path, op, is_assistant_script)
    return str(script_path.absolute()), str(target_dir.absolute()), str(target_op_file.absolute()), str(
        target_example_file.absolute())
