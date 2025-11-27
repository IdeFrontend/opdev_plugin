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

from common.exception import InValidRequestException, ServerException
from configs.config import get_resource_path
from configs.log import app_logger
from service.project import query_project_by_id


def get_available_prototype():
    prototype_dir = Path(get_resource_path('resource/ops_prototype'))
    if not prototype_dir.exists():
        app_logger.error(f'prototype_dir={prototype_dir} does not exist')
        raise ServerException("资源文件目录不存在 ops_prototype")
    prototype_files = list(prototype_dir.glob('*.json'))
    prototype_names = [f.stem for f in prototype_files]
    return prototype_names


def generate_ops_prototype_json(project_path, op_name='default_op', prototype_name='add_custom'):
    # 转换为Path对象
    project_dir = Path(project_path)
    ops_path = project_dir / f"{op_name}.json"
    ops_prototype_json_path = Path(get_resource_path(f'resource/ops_prototype/{prototype_name}.json'))

    # 检查launch.json是否已存在
    t = 1
    while ops_path.exists():
        ops_path = project_dir / f"{op_name}_{t}.json"
        t = t + 1

    # 检查resource目录下的ops_prototype.json是否存在
    if not ops_prototype_json_path.exists():
        app_logger.error("✗ 不存在的 ops_prototype模板")
        raise InValidRequestException("✗ 不存在的 ops_prototype模板")

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

def generate_ops_prototype(project_id, op_name='default_op', prototype_name='add_custom'):
    project = query_project_by_id(project_id)
    return generate_ops_prototype_json(project.project_path, op_name, prototype_name)
