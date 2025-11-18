#  Copyright (c) 2025 Huawei Technologies Co., Ltd.
#  #
#  This source code is licensed under the MIT license found in the
#  LICENSE file in the root directory of this source tree.
#  ==============================================================================
import json
import os
import subprocess
from pathlib import Path

from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.orm import Session

from common.exception import InValidRequestException
from configs.db import get_db
from configs.log import app_logger
from service.project import query_project_by_id
from utils.ascend_util import ascend_util, chmod_recursive_standard
from models.models import Operator


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
        assistant_script = project_path / "scripts" / "assistant.py"

        cmd = [
            "python", str(assistant_script),
            "opgen",
            f"--op_name={op_name}",
            f"--op_class={op_class}",
        ]

        app_logger.debug(f"executing assistant script: {' '.join(cmd)}")
        result = subprocess.run(cmd, cwd=project_path, capture_output=True, text=True, check=True)

        app_logger.debug(f"STDOUT: {result.stdout}")
        return True
    except subprocess.CalledProcessError as e:
        app_logger.error(f"Error executing assistant script: {e.stderr}")
        raise Exception("Error executing assistant script: {e.stderr}") from e
    except Exception as e:
        app_logger.error(f"Unexpect error when executing assistant script: {e}")
        raise Exception("Unexpect error when executing assistant script: {e}") from e


def _execute_msopgen(ops_create, project_path, op_class, op_name):
    try:
        op_class_dir = project_path / op_class
        op_class_dir.mkdir(exist_ok=True)
        soc_version = ops_create.soc_version if ops_create.soc_version is not None else ascend_util.soc_version
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
    if is_op_name_exist(ops_create.project_id, op_name):
        app_logger.warn(f"opname is exist: {op_name}")
        raise InValidRequestException(f"opname is exist: {op_name}")

    op = Operator(
        project_id=ops_create.project_id,
        op_name=op_name,
        op_class=op_class
    )
    db: Session = next(get_db())
    try:
        db.add(op)
        assistant_script = project_path / "scripts" / "assistant.py"
        if assistant_script.exists():
            op_id = _execute_assistant_script(project_path, op_class, op_name)
        else:
            op_id =  _execute_msopgen(ops_create, project_path, op_class, op_name)
        db.commit()
        return op_id
    except Exception as e:
        db.rollback()
        app_logger.error(f"Error executing assistant script: {e}")
        raise Exception("Error executing assistant script: {e}")


def is_op_name_exist(project_id, op_name):
    db: Session = next(get_db())
    project = db.scalars(
        select(Operator).where(and_(Operator.op_name == op_name, Operator.project_id == project_id))).first()
    return project is not None
