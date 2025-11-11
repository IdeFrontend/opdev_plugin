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
from http.client import HTTPException

from pydantic import BaseModel
from sqlalchemy import select, update, and_
from sqlalchemy.orm import Session

from configs.db import get_db
from models.models import TConfig


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
        project_config = TConfig(**data)
        db: Session = next(get_db())
        try:
            if data.get('config_id'):
                db.scalars(update(TConfig).where(TConfig.id == data['config_id']).values(
                    config_type=project_config.config_type, script=project_config.script,
                    custom_options=project_config.custom_options, op_ids=project_config.op_ids))
                project_config.id = data['config_id']
            else:
                db.add(project_config)
            db.flush()
            db.commit()
        except Exception as e:
            db.rollback()
            raise HTTPException from e
        return project_config.id

