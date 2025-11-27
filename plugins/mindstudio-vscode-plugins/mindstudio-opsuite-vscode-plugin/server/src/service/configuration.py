#  Copyright (c) 2025 Huawei Technologies Co., Ltd.
#
#  This source code is licensed under the MIT license found in the
#  LICENSE file in the root directory of this source tree.
#  ==============================================================================
from abc import ABC, abstractmethod
from typing import Dict, Type

from sqlalchemy import select, update, and_
from sqlalchemy.orm import Session

from common.exception import InValidRequestException
from configs.db import get_db
from models.models import TConfig
from utils import op_util
from utils.ascend_util import ascend_util


class BaseConfiguration(ABC):
    @abstractmethod
    def get_name(self) -> str:
        pass

    def get_config(self, project_id, config_type, op=None):
        db: Session = next(get_db())
        conditions = [TConfig.project_id == project_id, TConfig.config_type == config_type]
        if op is not None:
            conditions.append(TConfig.op == op)
        project_configs = db.scalars(select(TConfig).where(and_(*conditions))).all()
        return [
            {"config_id": project_config.id, "config_name": project_config.config_name, "op": project_config.op,
             "script": project_config.script, "config_type": config_type, "user_options": project_config.user_options,
             "custom_options": project_config.custom_options, "target_file": project_config.target_file,
             "target_dir": project_config.target_dir} for project_config in project_configs]

    @staticmethod
    def get_config_by_id(config_id):
        db: Session = next(get_db())
        project_config = db.scalars(
            select(TConfig).where(TConfig.id == config_id)).first()
        return project_config

    def post_config(self, data_list: list):
        process_data_list = []
        for process_data in data_list:
            if 'user_options' not in process_data:
                raise InValidRequestException("user_options is required")
            user_options = process_data['user_options']
            extracted_fields = self._process_extracted_fields(user_options)
            process_data.update(extracted_fields)
            custom_options_parts = self._process_custom_options(process_data)
            process_data['custom_options'] = ' '.join(custom_options_parts)
            process_data_list.append(process_data)
        db: Session = next(get_db())
        results = []
        try:
            for data in process_data_list:
                operation = "update" if data.get('config_id') else "create"
                if data.get('config_id'):
                    db.execute(
                        update(TConfig)
                        .where(TConfig.id == data['config_id'])
                        .values(
                            script=data.get('script'),
                            custom_options=data.get('custom_options'),
                            user_options=data.get('user_options'),
                            op=data.get('op'),
                            target_file=data.get('target_file'),
                            target_dir=data.get('target_dir'),
                            config_name=data.get('config_name'),
                        )
                    )
                    config_id = data['config_id']
                else:
                    t_config = TConfig(**data)
                    db.add(t_config)
                    db.flush()  # 立即刷新以获取新ID
                    config_id = t_config.id

                results.append({
                    "config_id": config_id,
                    "operation": operation,
                    "status": "success"
                })
            db.commit()
        except Exception as e:
            db.rollback()
            raise Exception(f"批量处理配置失败: {str(e)}") from e
        return results

    def default_config(self, project, op, config_type=None) -> list[dict]:
        script_path, target_dir, target_op, target_example = op_util.get_default_path(project, op)
        default_data = [{
            'config_type': config_type,
            "project_id": project.id,
            'user_options': {
                'op': op.op_name,
                'script': script_path,
                'config_name': op.op_name,
                'target_dir': target_dir,
                'target_file': target_op if config_type == 'build_op' else target_example if config_type == 'build_example' else None
            }
        }]
        return default_data

    def _process_extracted_fields(self, user_options):
        extracted_fields = {}
        field_mappings = {
            'op': 'op',
            'target_file': 'target_file',
            'target_dir': 'target_dir',
            'config_name': 'config_name',
            'script': 'script',
        }
        for key, value in field_mappings.items():
            if key in user_options:
                extracted_fields[key] = user_options[key]
            if key == 'op' and isinstance(user_options[key], list):
                extracted_fields[key] = (','.join(user_options[key]))
        return extracted_fields

    @abstractmethod
    def _process_custom_options(self, process_data) -> list:
        pass

    def _merge_config(self, *configs_list):
        # 创建一个字典来按照 config_name 合并配置
        merged_configs = {}
        for configs in configs_list:
            for config in configs:
                config_name = config.get('config_name')
                if config_name in merged_configs:
                    merged_configs[config_name].append(config)
                else:
                    merged_configs[config_name] = [config]
        return merged_configs


config_process_registry: Dict[str, BaseConfiguration] = {}
def register_config_process(config_process: Type[BaseConfiguration]):
    process_instance = config_process()
    config_process_registry[process_instance.get_name()] = process_instance
    return process_instance


@register_config_process
class BuildConfiguration(BaseConfiguration):
    def get_name(self):
        return "build"

    def get_config(self, project_id, config_type, op=None):
        build_op_configs = super().get_config(project_id, 'build_op', op)
        build_example_configs = super().get_config(project_id, 'build_example', op)
        return self._merge_config(build_example_configs, build_op_configs)

    def post_config(self, data_list: list):
        return super().post_config(data_list)

    def default_config(self, project, op, config_type=None) -> list[dict]:
        temp = super().default_config(project, op, 'build_op')
        default_op_config = temp[0]
        default_example_config = super().default_config(project, op, 'build_example')[0]
        return [default_op_config, default_example_config]

    def _process_custom_options(self, process_data) -> list:
        config_type = process_data.get('config_type', '')
        user_options = process_data.get('user_options', {})
        custom_options_parts = []
        if 'soc' in user_options and user_options['soc']:
            custom_options_parts.append(f"--soc={user_options['soc']}")
        if 'vendor_name' in user_options and user_options['vendor_name']:
            custom_options_parts.append(f"--vendor={user_options['vendor_name']}")
        if 'advanced_param' in user_options and user_options['advanced_param']:
            custom_options_parts.extend(self._process_advanced_param(user_options['advanced_param']))
        if config_type == 'build_example' and 'mode' in user_options and user_options['mode']:
            custom_options_parts.append(f"--mode={user_options['mode']}")
        return custom_options_parts

    def _process_advanced_param(self, advanced_param):
        custom_options_parts = []
        if not advanced_param:
            return custom_options_parts
        if not isinstance(advanced_param, list):
            raise InValidRequestException("advanced_param must be a list")
        for param in advanced_param:
            key = param.get('key')
            value = param.get('value')
            if value:
                custom_options_parts.append(f"--{key}={value}")
            else:
                custom_options_parts.append(f"--{key}")
        return custom_options_parts


@register_config_process
class SanitizerConfiguration(BaseConfiguration):
    def get_name(self) -> str:
        return "sanitizer"

    def get_config(self, project_id, config_type, op=None):
        return self._merge_config(super().get_config(project_id, config_type, op))

    def post_config(self, data_list: list):
        return super().post_config(data_list)

    def default_config(self, project, op, config_type='sanitizer'):
        base_config = super().default_config(project, op, config_type)
        base_config[0]['user_options']['detection'] = {
            'memcheck': 'default'
        }
        return base_config

    def _process_custom_options(self, process_data) -> list:
        user_options = process_data.get('user_options', {})
        custom_options_parts = []
        detection_opts = process_data.get('detection', {})
        for detection_opt, options in detection_opts.items():
            if options is None or options == '':
                continue
            custom_options_parts.append(f"-t {detection_opt}")
            opts = [opt.strip() for opt in options.split(',') if opt.strip()]
            for opt in opts:
                if opt == 'default':
                    continue
                custom_options_parts.append(f"--{opt}=yes")

        if 'log_level' in user_options and user_options['log_level']:
            custom_options_parts.append(f"--log-level={user_options['log_level']}")
        if 'max_debug_size' in user_options and user_options['max_debug_size']:
            custom_options_parts.append(f"--max-debug-size={user_options['max_debug_size']}")
        if 'block-id' in user_options and user_options['block-id']:
            custom_options_parts.append(f"--block-id={user_options['block_id']}")
        return custom_options_parts


@register_config_process
class OpProfConfiguration(BaseConfiguration):
    def get_name(self) -> str:
        return "opprof"

    def get_config(self, project_id, config_type, op=None):
        on_board_configs = super().get_config(project_id, 'on_board', op)
        simulate_configs = super().get_config(project_id, 'simulate', op)
        return self._merge_config(on_board_configs, simulate_configs)

    def post_config(self, data_list: list):
        return super().post_config(data_list)

    def default_config(self, project, op, config_type='opprof'):
        on_board_config = super().default_config(project, op, 'on_board')[0]
        simulate_config = super().default_config(project, op, 'simulate')[0]
        simulate_config['user_options']['soc_version'] = ascend_util.soc_version
        return [on_board_config, simulate_config]

    def _process_custom_options(self, process_data) -> list:
        user_options = process_data.get('user_options', {})
        custom_options_parts = []
        if 'aic_metrics' in user_options and user_options['aic_metrics']:
            custom_options_parts.append(f"--aic-metrics={user_options['aic_metrics']}")
        if 'replay_mode' in user_options and user_options['replay_mode']:
            custom_options_parts.append(f"--replay-mode={user_options['replay_mode']}")
        if 'warm_up' in user_options:
            custom_options_parts.append(f"--warm_up-ip={user_options['warm_up']}")
        if 'soc_version' in user_options and user_options['soc_version']:
            custom_options_parts.append(f"--soc-version={user_options['soc_version']}")
        if 'mstx' in user_options and user_options['mstx'] == 'on':
            custom_options_parts.append(f"--mstx=on")
            if 'mstx_include' in user_options and user_options['mstx_include']:
                custom_options_parts.append(f"--mstx-include={user_options['mstx_include']}")
        if 'dump' in user_options and user_options['dump'] == 'on':
            custom_options_parts.append(f"--dump=on")
        return custom_options_parts
