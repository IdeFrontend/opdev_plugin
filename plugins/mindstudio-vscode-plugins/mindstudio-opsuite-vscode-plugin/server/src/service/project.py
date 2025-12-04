#  Copyright (c) 2025 Huawei Technologies Co., Ltd.
#
#  This source code is licensed under the MIT license found in the
#  LICENSE file in the root directory of this source tree.
#  ==============================================================================

import shutil
from pathlib import Path

from sqlalchemy import select

from common.exception import InValidRequestException
from configs.db import with_db_session, safe_db_session
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
        return

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
    except Exception as e:
        app_logger.error(f"✗ 拷贝launch.json失败: {e}")
        raise Exception("服务异常") from e


def create_project(data):
    project_obj = Project(**data)
    project_find = query_project_by_path(project_obj.project_path)
    if project_find:
        if not project_obj.ascend_env_script:
            return project_find.id
        with safe_db_session() as db:
            project = db.query(Project).filter(Project.id == project_find.id).first()
            project.ascend_env_script = project_obj.ascend_env_script
            db.commit()
        return project_find.id
    ensure_launch_json_exists(project_obj.project_path)
    with safe_db_session() as db:
        db.add(project_obj)
        db.commit()
        db.refresh(project_obj)
        return project_obj.id


@with_db_session
def query_project_by_id(project_id, db=None):
    project = db.scalars(
        select(Project).where(Project.id == project_id)).first()
    return project


@with_db_session
def query_project_by_path(project_path, db=None):
    project = db.scalars(
        select(Project).where(Project.project_path == project_path)).first()
    return project

def delete_project_by_id(project_id: int):
    db: Session = next(get_db())
    project = db.scalars(select(Project).where(Project.id == project_id)).first()

    if not project:
        raise InValidRequestException("project not found")

    try:
        db.delete(project)
        db.commit()
    except Exception as e:
        db.rollback()
        app_logger.error(e)
        raise Exception("服务异常") from e


def delete_project_by_path(project_path: str):
    db: Session = next(get_db())
    project = db.scalars(select(Project).where(Project.project_path == project_path)).first()

    if not project:
        raise InValidRequestException("project not found")

    try:
        db.delete(project)
        db.commit()
    except Exception as e:
        db.rollback()
        app_logger.error(e)
        raise Exception("服务异常") from e


def delete_project(project_id: int = None, project_path: str = None):
    if project_id is not None:
        return delete_project_by_id(project_id)

    if project_path is not None:
        return delete_project_by_path(project_path)

    raise InValidRequestException("project_id or project_path is required")
