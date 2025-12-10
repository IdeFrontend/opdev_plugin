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


def is_opgen_op(project_path, op):
    op_sh = project_path / op.op_class / op.op_name / 'build.sh'
    return op_sh.exists()

def get_default_target_dir(project_path, op, opgen_op=True):
    if opgen_op:
        return project_path / op.op_class / op.op_name / 'build_out'
    else:
        return project_path / 'build_out'


def get_default_target(project_path, op, opgen_op=True):
    os_name, architecture = get_detailed_system_info()
    target_dir = get_default_target_dir(project_path, op, opgen_op=opgen_op)
    target_op_file = target_dir / f'custom_opp_{os_name}_{architecture}.run' if opgen_op else target_dir / f'cann-ops-math-custom_linux-{architecture}.run'
    run_script = project_path / op.op_class / op.op_name / 'examples' / 'run.sh'
    target_example_file = run_script if opgen_op else target_dir / f'test_aclnn_{op.op_name}_example'
    return target_dir, target_op_file, target_example_file


def get_op_script_path(project_path, op):
    op_sh = project_path / op.op_class / op.op_name / 'build.sh'
    project_sh = project_path / 'build.sh'
    if op_sh:
        return str(op_sh.absolute())
    elif project_sh:
        return str(project_sh.absolute())
    else:
        return "未识别到脚本"


def get_example_script_path(project_path, op, opgen_op):
    if opgen_op:
        common = project_path / op.op_class / op.op_name / 'examples' / 'build.sh'
        aclnn = project_path / op.op_class / op.op_name / 'examples' / 'AclNNInvocation' / 'build.sh'
        return common if op.op_type == 'cann' else aclnn
    else:
        return project_path / 'build.sh'


def get_default_path(project, op):
    project_path = Path(project.project_path)
    opgen_op = is_opgen_op(project_path, op)
    target_dir, target_op_file, target_example_file = get_default_target(project_path, op, opgen_op)
    op_script_path = get_op_script_path(project_path, op)
    example_script_path = get_example_script_path(project_path, op, opgen_op)
    return op_script_path, str(example_script_path), str(target_dir.absolute()), str(target_op_file.absolute()), str(
        target_example_file.absolute())
