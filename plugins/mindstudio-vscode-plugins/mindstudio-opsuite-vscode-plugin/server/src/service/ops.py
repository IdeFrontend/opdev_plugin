#  Copyright (c) 2025 Huawei Technologies Co., Ltd.
#  #
#  This source code is licensed under the MIT license found in the
#  LICENSE file in the root directory of this source tree.
#  ==============================================================================
from pathlib import Path

from pydantic import BaseModel, Field, model_validator
from typing import Optional, Literal
from sqlalchemy import select, and_

from common.exception import InValidRequestException
from configs.db import with_db_session, safe_db_session
from configs.log import app_logger
from service.configuration import config_process_registry
from service.project import query_project_by_id
from utils.ascend_util import chmod_recursive_standard
from models.models import Operator
from service.op_generators import OpGeneratorFactory


class OpsCreateBase(BaseModel):
    project_id: int
    op_type: Literal['ascend', 'cann'] = 'ascend'  # 使用 Literal 限制可选值

    ops_prototype_file: Optional[str] = Field(default=None)
    op_name: Optional[str] = Field(default='hello_world')
    op_class: Optional[str] = Field(default='FirstProject')
    template_name: str = Field(default='hello_world')
    soc_version: Optional[str] = Field(default=None)

    @model_validator(mode='after')
    def validate_fields(self) -> 'OpsCreateBase':
        errors = []

        if self.op_type == 'ascend':
            if not self.ops_prototype_file:
                errors.append('Ascend type requires ops_prototype_file')
            # 可选的：清理不需要的字段
            self.op_name = None
            self.op_class = None

        elif self.op_type == 'cann':
            if not self.op_name:
                errors.append('CANN type requires op_name')
            if not self.op_class:
                errors.append('CANN type requires op_class')
            # 可选的：清理不需要的字段
            self.ops_prototype_file = None

        if errors:
            raise ValueError('; '.join(errors))

        return self

# 2. 核心入口函数
def generate_operator_structure(data):
    # 2.1 校验基础参数
    ops_create = OpsCreateBase(**data)

    project = query_project_by_id(ops_create.project_id)
    if not project:
        raise InValidRequestException(f"Project {ops_create.project_id} not found")

    project_path = Path(project.project_path)
    chmod_recursive_standard(project_path, 0o755)

    # 2.2 获取生成策略 (Strategy Pattern)
    # 无论是 Ascend 还是 CANN，这里拿到的都是 BaseOpGenerator 的子类
    generator = OpGeneratorFactory.get_generator(
        ops_create.op_type,
        project_path,
        ops_create,
        project
    )

    # 2.3 解析元数据 (多态调用)
    # Ascend 会去读文件，CANN 会直接返回入参
    op_class, op_name = generator.parse_meta()

    app_logger.info(f"Preparing to create operator: {op_name} (Type: {ops_create.op_type})")

    # 2.4 查重逻辑 (通用)
    op_dir = project_path / op_class / op_name
    if is_op_name_exist(ops_create.project_id, op_name) or op_dir.exists():
        app_logger.warn(f"opname is exist: {op_name}")
        raise InValidRequestException(f"算子名称已存在: {op_name}")

    # 2.5 数据库对象准备
    op = Operator(
        project_id=ops_create.project_id,
        op_name=op_name,
        op_class=op_class,
        op_type=ops_create.op_type  # 存入类型
    )

    # 2.6 执行生成 (多态调用)
    # Service 层不需要关心你是拷贝还是运行脚本，只管 execute
    generator.execute_generation()

    # 2.7 事务提交
    with safe_db_session() as db:
        db.add(op)
        db.commit()
        db.refresh(op)
        return op, project

def operator_config(project, op, process_name):
    config = config_process_registry.get(process_name).default_config(project, op)
    config_process_registry.get(process_name).post_config(config)


def generate_operator_config(project, op, process_name):
    config = config_process_registry.get(process_name).default_config(project, op)
    config_process_registry.get(process_name).post_config(config)


def generate_structure(data):
    op, project = generate_operator_structure(data)
    generate_operator_config(project, op, 'build')
    generate_operator_config(project, op, 'sanitizer')
    generate_operator_config(project, op, 'opprof')
    return op.id


@with_db_session
def get_ops(project_id, db=None):
    op_list = db.scalars(
        select(Operator).where(Operator.project_id == project_id)).all()
    return op_list


@with_db_session
def delete_ops(project_id, op_name, db=None):
    delete_count = db.query(Operator).filter_by(project_id=project_id, op_name=op_name).delete(
        synchronize_session=False)
    db.commit()
    return delete_count


def add_exist_op(data):
    op = Operator(**data)
    project = query_project_by_id(op.project_id)
    if not project:
        app_logger.error(f"Project with id {op.project_id} not found")
        raise InValidRequestException("Project with id {} not found".format(op.project_id))
    if is_op_name_exist(op.project_id, op.op_name):
        app_logger.warn(f"opname is exist: {op.op_name}")
        raise InValidRequestException(f"opname is exist: {op.op_name}")
    with safe_db_session() as db:
        db.add(op)
        db.commit()
        db.refresh(op)
    generate_operator_config(project, op, 'build')
    generate_operator_config(project, op, 'sanitizer')
    generate_operator_config(project, op, 'opprof')
    return op.id


@with_db_session
def get_op_by_project_id_and_op_name(project_id, op_name, db=None):
    op = db.scalars(
        select(Operator).where(and_(Operator.op_name == op_name, Operator.project_id == project_id))).first()
    return op


def is_op_name_exist(project_id, op_name):
    return get_op_by_project_id_and_op_name(project_id, op_name) is not None
