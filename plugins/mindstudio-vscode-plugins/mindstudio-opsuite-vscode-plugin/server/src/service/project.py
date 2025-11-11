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

import shutil
from http.client import HTTPException
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

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

    # 检查launch.json是否已存在
    if launch_json_path.exists():
        app_logger.info("✓ launch.json 已存在: .vscode/launch.json")
        raise HTTPException("✓ launch.json 已存在: .vscode/launch.json")

    # 检查resource目录下的launch.json是否存在
    if not resource_launch_json_path.exists():
        app_logger.error("✗ 资源文件不存在: launch")
        raise HTTPException("✗ 资源文件不存在: launch")

    try:
        # 确保.vscode目录存在
        vscode_dir.mkdir(exist_ok=True)

        # 拷贝launch.json文件
        shutil.copy2(resource_launch_json_path, launch_json_path)
        app_logger.info(f"✓ 成功拷贝 launch.json: {resource_launch_json_path} -> {launch_json_path}")
        return True

    except Exception as e:
        app_logger.error(f"✗ 拷贝launch.json失败: {e}")
        raise HTTPException from e


def create_project(data):
    project_config = Project(**data)
    db: Session = next(get_db())
    try:
        db.add(project_config)
        db.flush()
        db.commit()

        # 检查project_config.project_path的.vscode文件夹下是否有launch.json，如果没有新建
        ensure_launch_json_exists(project_config.project_path)
    except Exception as e:
        db.rollback()
        raise HTTPException from e
    return project_config.id


def query_project_by_id(project_id):
    db: Session = next(get_db())
    project = db.scalars(
        select(Project).where(Project.id == project_id)).first()
    return project
