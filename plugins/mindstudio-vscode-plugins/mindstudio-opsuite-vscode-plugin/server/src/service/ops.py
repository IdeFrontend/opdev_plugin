#  Copyright (c) 2025 Huawei Technologies Co., Ltd.
#  #
#  This source code is licensed under the MIT license found in the
#  LICENSE file in the root directory of this source tree.
#  ==============================================================================
import json
import subprocess
from pathlib import Path

from pydantic import BaseModel
from sqlalchemy import select, and_

from common.exception import InValidRequestException
from configs.config import settings
from configs.db import with_db_session, safe_db_session
from configs.log import app_logger
from service.configuration import config_process_registry
from service.project import query_project_by_id
from utils.ascend_util import ascend_util, chmod_recursive_standard
from models.models import Operator, TConfig
from utils.op_util import assistant_script_exists, get_python_cmd


class OpsCreateBase(BaseModel):
    project_id: int
    ops_prototype_file: str
    soc_version: str = None


def _read_ops_prototype(ops_prototype_file):
    try:
        with open(ops_prototype_file, "r", encoding='utf-8') as f:
            ops_data = json.load(f)

        if isinstance(ops_data, list) and len(ops_data) > 0:
            op_info = ops_data[0]
        else:
            op_info = ops_data

        op_name = op_info.get("op")
        op_class = op_info.get("op_class")

        if not op_name or not op_class:
            app_logger.error("Invalid op prototype: op_name or op_class is empty")
            raise InValidRequestException("Invalid op prototype: op_name or op_class is empty")

        return op_class, op_name
    except Exception as e:
        app_logger.error(f"Invalid op prototype: {e}")
        raise InValidRequestException("Invalid op prototype: {e}")


def _execute_assistant_script(project_path, op_class, op_name):
    try:
        assistant_script = project_path / "scripts" / "opgen" / "opgen_standalone.py"

        cmd = [
            get_python_cmd(), str(assistant_script),
            f"--op_type={op_class}",
            f"--op_name={op_name}",
            f"--output_path={project_path}",
        ]

        app_logger.debug(f"executing assistant script: {' '.join(cmd)}")
        result = subprocess.run(cmd, cwd=project_path, capture_output=True, text=True, check=True)

        app_logger.debug(f"STDOUT: {result.stdout}")
        return True
    except subprocess.CalledProcessError as e:
        app_logger.error(f"Error executing assistant script: {e.stderr}")
        raise Exception(f"Error executing assistant script: {e.stderr}") from e
    except Exception as e:
        app_logger.error(f"Unexpect error when executing assistant script: {e}")
        raise Exception(f"Unexpect error when executing assistant script: {e}") from e


def _execute_msopgen(ops_create, project, op_class, op_name):
    try:
        op_class_dir = Path(project.project_path) / op_class
        op_class_dir.mkdir(exist_ok=True)
        if settings.environment == 'development':
            return True
        soc_version = ops_create.soc_version if ops_create.soc_version is not None else ascend_util.soc_version
        if project.ascend_env_script:
            cann_env = ascend_util.get_env_from_script(project.ascend_env_script)
        else:
            cann_env = ascend_util.cann_env

        cmd = [
            "msopgen", "gen",
            "-i", str(ops_create.ops_prototype_file),
            "-c", f"ai_core-ascend{soc_version}",
            "-lan", "cpp",
            "-out", op_name
        ]

        app_logger.debug(f"executing msopgen script: {' '.join(cmd)}")
        result = subprocess.run(cmd, cwd=op_class_dir, capture_output=True, text=True, check=True, env=cann_env)

        app_logger.debug(f"STDOUT: {result.stdout}")
        return True
    except subprocess.CalledProcessError as e:
        app_logger.error(f"Error executing msopgen: {e.stderr}")
        raise Exception(f"Error executing msopgen: {e.stderr}") from e
    except Exception as e:
        app_logger.error(f"Unexpect error when executing msopgen: {e}")
        raise Exception("Unexpect error when executing msopgen") from e


def generate_operator_structure(data):
    ops_create = OpsCreateBase(**data)

    project = query_project_by_id(ops_create.project_id)
    if not project:
        app_logger.error(f"Project with id {ops_create.project_id} not found")
        raise InValidRequestException("Project with id {} not found".format(ops_create.project_id))

    project_path = Path(project.project_path)
    chmod_recursive_standard(project_path, 0o755)
    op_class, op_name = _read_ops_prototype(ops_create.ops_prototype_file)
    op_dir = project_path / op_class / op_name
    if is_op_name_exist(ops_create.project_id, op_name) or op_dir.exists():
        app_logger.warn(f"opname is exist: {op_name}")
        raise InValidRequestException(f"opname is exist: {op_name}")

    op = Operator(
        project_id=ops_create.project_id,
        op_name=op_name,
        op_class=op_class
    )
    if assistant_script_exists(project_path):
        _execute_assistant_script(project_path, op_class, op_name)
    else:
        _execute_msopgen(ops_create, project, op_class, op_name)
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
