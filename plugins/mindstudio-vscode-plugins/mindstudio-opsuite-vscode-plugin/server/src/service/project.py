#  Copyright (c) 2025 Huawei Technologies Co., Ltd.
#
#  This source code is licensed under the MIT license found in the
#  LICENSE file in the root directory of this source tree.
#  ==============================================================================

import shutil
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from common.exception import InValidRequestException
from configs.db import get_db
from configs.log import app_logger
from configs.config import get_resource_path
from models.models import Project


def ensure_launch_json_exists(project_path):
    """
    检查并确保.vscode/launch.json文件存在，如果不存在则从resource目录拷贝

    Args:
        project_path: 项目根目录路径
        resource_dir: resource目录名称，默认为"resource"

    Returns:
        bool: 操作是否成功
    """
    # 转换为Path对象
    project_dir = Path(project_path)
    vscode_dir = project_dir / ".vscode"
    launch_json_path = vscode_dir / "launch.json"
    resource_launch_json_path = Path(get_resource_path('resource/launch.json'))

    if not project_dir.exists():
        app_logger.info("project_dir不存在")
        raise InValidRequestException("project_dir不存在")

    # 检查launch.json是否已存在
    if launch_json_path.exists():
        app_logger.info("✓ launch.json 已存在: .vscode/launch.json")
        return True

    # 检查resource目录下的launch.json是否存在
    if not resource_launch_json_path.exists():
        app_logger.error("✗ 资源文件不存在: launch")
        raise InValidRequestException("✗ 资源文件不存在: launch")

    try:
        # 确保.vscode目录存在
        vscode_dir.mkdir(exist_ok=True)

        # 拷贝launch.json文件
        shutil.copy2(resource_launch_json_path, launch_json_path)
        app_logger.info(f"✓ 成功拷贝 launch.json: {resource_launch_json_path} -> {launch_json_path}")
        return True

    except Exception as e:
        app_logger.error(f"✗ 拷贝launch.json失败: {e}")
        raise Exception("服务异常") from e


def create_project(data):
    project_config = Project(**data)
    project_find = query_project_by_path(project_config.project_path)
    if project_find:
        return project_find.id
    db: Session = next(get_db())
    try:
        db.add(project_config)
        # 检查project_config.project_path的.vscode文件夹下是否有launch.json，如果没有新建
        ensure_launch_json_exists(project_config.project_path)
        db.commit()
        db.refresh(project_config)
    except InValidRequestException as e:
        db.rollback()
        raise e
    except Exception as e:
        db.rollback()
        app_logger.error(e)
        raise Exception("服务异常") from e
    return project_config.id


def query_project_by_id(project_id):
    db: Session = next(get_db())
    project = db.scalars(
        select(Project).where(Project.id == project_id)).first()
    return project

def query_project_by_path(project_path):
    db: Session = next(get_db())
    project = db.scalars(
        select(Project).where(Project.project_path == project_path)).first()
    return project