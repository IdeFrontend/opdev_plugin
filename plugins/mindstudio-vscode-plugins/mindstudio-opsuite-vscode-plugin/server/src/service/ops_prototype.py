#  Copyright (c) 2025 Huawei Technologies Co., Ltd.
#  #
#  This source code is licensed under the MIT license found in the
#  LICENSE file in the root directory of this source tree.
#  ==============================================================================
#
#  This source code is licensed under the MIT license found in the
#  LICENSE file in the root directory of this source tree.
#  ==============================================================================
import json
from pathlib import Path

from common.exception import InValidRequestException
from configs.config import get_resource_path
from configs.log import app_logger
from service.ops import is_op_name_exist
from service.project import query_project_by_id


def generate_ops_prototype_json(op_name, project_path):
    # 转换为Path对象
    project_dir = Path(project_path)
    ops_path = project_dir / f"{op_name}.json"
    ops_prototype_json_path = Path(get_resource_path('resource/ops_prototype.json'))

    # 检查launch.json是否已存在
    if ops_path.exists():
        app_logger.info(f"✓ 原型定义 已存在: {op_name}")
        raise InValidRequestException(f"✓ 原型定义 已存在: {op_name}")

    # 检查resource目录下的ops_prototype.json是否存在
    if not ops_prototype_json_path.exists():
        app_logger.error("✗ 资源文件不存在 ops_prototype")
        raise InValidRequestException("✗ 资源文件不存在 ops_prototype")

    try:
        with open(ops_prototype_json_path, 'r', encoding='utf-8') as f:
            prototype_json = json.load(f)

        prototype_json[0]['op'] = op_name

        with open(ops_path, 'w', encoding='utf-8') as f:
            json.dump(prototype_json, f, indent=4, ensure_ascii=False) # type: ignore

        app_logger.info(f"✓ 成功创建 json: {op_name}.json")
        return True

    except Exception as e:
        app_logger.error(f"✗ 处理ops_prototype.json失败: {e}")
        raise Exception from e

def generate_ops_prototype(op_name, project_id):
    if is_op_name_exist(project_id, op_name):
        app_logger.warn(f"opname is exist: {op_name}")
        raise InValidRequestException(f"opname is exist: {op_name}")
    project = query_project_by_id(project_id)
    return generate_ops_prototype_json(op_name, project.project_path)
