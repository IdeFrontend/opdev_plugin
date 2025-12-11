# service/op_generators.py
# 专门负责不同类型的算子生成逻辑

import abc
import json
import os
import subprocess
import zipfile
from pathlib import Path

from common.exception import InValidRequestException, ServerException
from configs.config import settings, get_resource_path
from configs.log import app_logger
from utils.ascend_util import ascend_util


# --- 1. 抽象基类 (接口定义) ---
class BaseOpGenerator(abc.ABC):
    def __init__(self, params, project):
        self.project_path = Path(project.project_path)
        self.params = params  # OpsCreateBase 对象
        self.project = project
        self.op_path = Path(params.op_path)
        self.op_name = None

    @abc.abstractmethod
    def parse_meta(self):
        """解析并返回 (op_class, op_name)"""
        pass

    @abc.abstractmethod
    def execute_generation(self):
        """执行具体的生成动作 (拷贝或运行脚本)"""
        pass

    def _rename_files(self, template_name='add_custom'):
        """重命名文件和目录中的占位符"""
        for root, dirs, files in os.walk(self.op_path, topdown=False):
            for name in files + dirs:
                if template_name not in name:
                    continue
                old_path = os.path.join(root, name)
                new_name = name.replace(template_name, self.op_name)
                new_path = os.path.join(root, new_name)
                try:
                    os.rename(old_path, new_path)
                except OSError as e:
                    raise OSError(f"重命名 '{old_path}' 到 '{new_path}' 失败: {e}") from e

    def _replace_content_in_file(self, file_path, replacements):
        """Helper to replace content in a single file."""
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
        except (IOError, OSError) as e:
            app_logger.warning(f"读取文件 '{file_path}' 失败: {e}")
            return
        original_content = content
        for old, new in replacements.items():
            content = content.replace(old, new)

        if content == original_content:
            return
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
        except (IOError, OSError) as e:
            app_logger.warning(f"写入文件 '{file_path}' 失败: {e}")

    def _replace_content(self, template_name='add_custom'):
        """替换文件内容中的占位符"""
        op_name_capitalized = ''.join(word.capitalize() for word in self.op_name.split('_'))
        template_name_capitalized = ''.join(word.capitalize() for word in template_name.split('_'))

        replacements = {
            template_name.upper(): self.op_name.upper(),
            template_name_capitalized: op_name_capitalized,
            template_name: self.op_name,
        }
        for root, _, files in os.walk(self.op_path):
            for file in files:
                if file.endswith(('.pyc', '.pyo')):
                    continue
                file_path = os.path.join(root, file)
                self._replace_content_in_file(file_path, replacements)


class AscendOpGenerator(BaseOpGenerator):
    def parse_meta(self):
        ops_prototype_file = self.params.ops_prototype_file
        self.template_name = self.params.template_name or 'add_custom'
        if not ops_prototype_file:
            return self.project.project_name
        try:
            with open(ops_prototype_file, "r", encoding='utf-8') as f:
                ops_data = json.load(f)
            op_info = ops_data[0] if isinstance(ops_data, list) else ops_data
            self.op_name = op_info.get("op") or self.project.project_name
            return self.op_name
        except Exception as e:
            app_logger.error(f"Invalid op prototype: {e}")
            raise InValidRequestException(f"Invalid op prototype: {e}")

    def execute_generation(self):
        zip_file_path = Path(get_resource_path(f'resource/code_template/ascend_template/{self.template_name}.zip'))
        if not zip_file_path.exists():
            raise FileNotFoundError(f"找不到zip文件: {zip_file_path}")
        self.op_path.mkdir(exist_ok=True)
        with zipfile.ZipFile(zip_file_path, 'r') as zip_ref:
            zip_ref.extractall(self.op_path)
        self._rename_files(self.template_name)
        self._replace_content(self.template_name)


class MindStudoOpGenerator(BaseOpGenerator):
    def parse_meta(self):
        ops_prototype_file = self.params.ops_prototype_file
        if not ops_prototype_file:
            raise InValidRequestException("Ascend type requires ops_prototype_file")

        try:
            with open(ops_prototype_file, "r", encoding='utf-8') as f:
                ops_data = json.load(f)
            op_info = ops_data[0] if isinstance(ops_data, list) else ops_data
            self.op_name = op_info.get("op")

            if not self.op_name:
                raise ValueError("op_name or op_class is empty in JSON")
            return self.op_name
        except Exception as e:
            app_logger.error(f"Invalid op prototype: {e}")
            raise InValidRequestException(f"Invalid op prototype: {e}")

    def execute_generation(self):
        try:
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
            # 直接在目标路径下执行命令
            result = subprocess.run(cmd, cwd=self.op_path.parent, capture_output=True, text=True, check=True, env=cann_env)
            app_logger.debug(f"STDOUT: {result.stdout}")
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
        self.op_name = self.params.op_name or self.project.project_name
        self.template_name = self.params.template_name or 'hello_world'
        return self.op_name

    def execute_generation(self):
        try:
            template_source = Path(get_resource_path(f'resource/code_template/cann_template/{self.template_name}.zip'))
            if not template_source.exists():
                raise ServerException(f"Template source not found: {self.template_name}")
            target_dir = self.op_path
            with zipfile.ZipFile(template_source, 'r') as zip_ref:
                zip_ref.extractall(self.op_path)
            app_logger.info(f"Successfully copied CANN template to {target_dir}")
            self._rename_files(self.template_name)
            self._replace_content(self.template_name)
            return True
        except Exception as e:
            app_logger.error(f"Error copying CANN template: {e}")
            raise Exception(f"Error copying CANN template: {e}")


# --- 4. 工厂类 (统一入口) ---
class OpGeneratorFactory:
    _strategies = {
        'ascend': AscendOpGenerator,
        'cann': CannOpGenerator,
        'msOpGen': MindStudoOpGenerator
    }

    @classmethod
    def get_generator(cls, params, project):
        op_type = params.op_type.lower() if params.op_type else 'ascend'
        if op_type not in cls._strategies:
            return MindStudoOpGenerator(params, project)
        return cls._strategies[op_type](params, project)