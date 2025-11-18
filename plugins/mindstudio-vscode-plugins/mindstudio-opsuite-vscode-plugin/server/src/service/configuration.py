#  Copyright (c) 2025 Huawei Technologies Co., Ltd.
#
#  This source code is licensed under the MIT license found in the
#  LICENSE file in the root directory of this source tree.
#  ==============================================================================
from pydantic import BaseModel
from sqlalchemy import select, update, and_
from sqlalchemy.orm import Session

from configs.db import get_db
from models.models import TConfig


class ConfigBase(BaseModel):
    id: int = None
    config_id: int
    config_type: str
    script: str
    custom_options: str
    project_id: int
    op_ids: str


class BaseConfiguration(BaseModel):

    @staticmethod
    def get_config(project_id, config_type):
        db: Session = next(get_db())
        project_configs = db.scalars(
            select(TConfig).where(and_(TConfig.project_id == project_id, TConfig.config_type == config_type))).all()
        return [{"config_id": project_config.id, "op_ids": project_config.op_ids, "script": project_config.script,
                 "custom_options": project_config.custom_options} for project_config in project_configs]


    @staticmethod
    def get_config_by_id(config_id):
        db: Session = next(get_db())
        project_config = db.scalars(
            select(TConfig).where(TConfig.id == config_id)).first()
        return project_config


    @staticmethod
    def post_config(data: dict):
        project_config = ConfigBase(**data)
        db: Session = next(get_db())
        try:
            if data.get('config_id'):
                db.execute(update(TConfig).where(TConfig.id == data['config_id']).values(
                    config_type=project_config.config_type, script=project_config.script,
                    custom_options=project_config.custom_options, op_ids=project_config.op_ids))
                project_config.id = data['config_id']
            else:
                t_config = TConfig(**data)
                db.add(t_config)
                project_config.id = t_config.id
            db.flush()
            db.commit()
        except Exception as e:
            db.rollback()
            raise Exception from e
        return project_config.id

