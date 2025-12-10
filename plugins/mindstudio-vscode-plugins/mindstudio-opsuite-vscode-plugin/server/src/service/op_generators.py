# service/op_generators.py
# 专门负责不同类型的算子生成逻辑

import abc
import json
import shutil
import subprocess
import zipfile
from pathlib import Path

from common.exception import InValidRequestException, ServerException
from configs.config import settings, get_resource_path
from configs.log import app_logger
from utils.ascend_util import ascend_util


# --- 1. 抽象基类 (接口定义) ---
class BaseOpGenerator(abc.ABC):
    def __init__(self, project_path, params, project):
        self.project_path = Path(project_path)
        self.params = params  # OpsCreateBase 对象
        self.project = project
        self.op_class = None
        self.op_name = None

    @abc.abstractmethod
    def parse_meta(self):
        """解析并返回 (op_class, op_name)"""
        pass

    @abc.abstractmethod
    def execute_generation(self):
        """执行具体的生成动作 (拷贝或运行脚本)"""
        pass


# --- 2. Ascend 策略实现 ---
class AscendOpGenerator(BaseOpGenerator):
    def parse_meta(self):
        # Ascend 逻辑: 从 JSON 文件解析
        ops_prototype_file = self.params.ops_prototype_file
        if not ops_prototype_file:
            raise InValidRequestException("Ascend type requires ops_prototype_file")

        try:
            with open(ops_prototype_file, "r", encoding='utf-8') as f:
                ops_data = json.load(f)
            op_info = ops_data[0] if isinstance(ops_data, list) else ops_data

            self.op_class = op_info.get("op_class")
            self.op_name = op_info.get("op")

            if not self.op_name or not self.op_class:
                raise ValueError("op_name or op_class is empty in JSON")
            return self.op_class, self.op_name
        except Exception as e:
            app_logger.error(f"Invalid op prototype: {e}")
            raise InValidRequestException(f"Invalid op prototype: {e}")

    def execute_generation(self):
        try:
            op_class_dir = Path(self.project.project_path) / self.op_class
            op_class_dir.mkdir(exist_ok=True)

            zip_file_path = Path(get_resource_path(f'resource/code_template/add_example/AclNNInvocation.zip'))
            examples_dir = op_class_dir / self.op_name / "examples"
            if not zip_file_path.exists():
                raise FileNotFoundError(f"找不到zip文件: {zip_file_path}")

            if settings.environment == 'development':
                return True
            soc_version = self.params.soc_version if self.params.soc_version is not None else ascend_util.soc_version
            if self.project.ascend_env_script:
                cann_env = ascend_util.get_env_from_script(self.project.ascend_env_script)
            else:
                cann_env = ascend_util.cann_env
            cmd = [
                "msopgen", "gen",
                "-i", str(self.params.ops_prototype_file),
                "-c", f"ai_core-{soc_version}",
                "-lan", "cpp",
                "-out", self.op_name
            ]
            app_logger.debug(f"executing msopgen script: {' '.join(cmd)}")
            result = subprocess.run(cmd, cwd=op_class_dir, capture_output=True, text=True, check=True, env=cann_env)
            app_logger.debug(f"STDOUT: {result.stdout}")
            examples_dir.mkdir(exist_ok=True)
            with zipfile.ZipFile(zip_file_path, 'r') as zip_ref:
                zip_ref.extractall(examples_dir)
            return True
        except subprocess.CalledProcessError as e:
            app_logger.error(f"Error executing msopgen: {e.stderr}")
            raise Exception(f"Error executing msopgen: {e.stderr}") from e
        except Exception as e:
            app_logger.error(f"Unexpect error when executing msopgen: {e}")
            raise Exception("Unexpect error when executing msopgen") from e


# --- 3. CANN 策略实现 ---
class CannOpGenerator(BaseOpGenerator):
    def parse_meta(self):
        # CANN 逻辑: 直接从参数获取
        if not self.params.op_name or not self.params.op_class:
            raise InValidRequestException("CANN type requires op_name and op_class")

        self.op_class = self.params.op_class
        self.op_name = self.params.op_name
        self.template_name = self.params.template_name
        return self.op_class, self.op_name

    def execute_generation(self):
        # CANN 逻辑: 拷贝 resource/hello_world
        try:
            template_source = Path(get_resource_path(f'resource/cann_template/{self.template_name}'))
            if not template_source.exists():
                raise ServerException(f"Template source not found: {self.template_name}")
            target_dir = self.project_path / self.op_class / self.op_name
            target_dir.parent.mkdir(parents=True, exist_ok=True)

            if target_dir.exists():
                app_logger.warn(f"Target directory exists: {target_dir}, removing...")
                shutil.rmtree(target_dir)

            shutil.copytree(template_source, target_dir)
            app_logger.info(f"Successfully copied CANN template to {target_dir}")
            return True
        except Exception as e:
            app_logger.error(f"Error copying CANN template: {e}")
            raise Exception(f"Error copying CANN template: {e}")


# --- 4. 工厂类 (统一入口) ---
class OpGeneratorFactory:
    _strategies = {
        'ascend': AscendOpGenerator,
        'cann': CannOpGenerator
    }

    @classmethod
    def get_generator(cls, op_type, project_path, params, project):
        op_type = op_type.lower() if op_type else 'ascend'
        if op_type not in cls._strategies:
            raise InValidRequestException(f"Unsupported op_type: {op_type}")
        return cls._strategies[op_type](project_path, params, project)