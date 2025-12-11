#  Copyright (c) 2025 Huawei Technologies Co., Ltd.
#
#  This source code is licensed under the MIT license found in the
#  LICENSE file in the root directory of this source tree.
#  ==============================================================================
from abc import ABC, abstractmethod
from typing import Dict, Type

from sqlalchemy import bindparam, select, update, insert, and_, text

from common.exception import InValidRequestException
from configs.db import with_db_session, safe_db_session
from models.models import TConfig
from utils import op_util
from utils.ascend_util import ascend_util


class BaseConfiguration(ABC):
    @abstractmethod
    def get_name(self) -> str:
        pass

    @with_db_session
    def delete_config(self, project_id, config_name, db=None):
        delete_count = db.query(TConfig).filter_by(project_id=project_id, config_name=config_name).delete(synchronize_session=False)
        db.commit()
        return delete_count

    @with_db_session
    def get_config(self, project_id, config_type, op, db=None):
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
    @with_db_session
    def get_config_by_id(config_id, db=None):
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
        return self._batch_upsert_configs(process_data_list)

    def default_config(self, project, op, config_type=None) -> list[dict]:
        op_script_path, example_script_path, target_dir, target_op, target_example = op_util.get_default_path(op)
        script_path = example_script_path if config_type == 'build_example' else op_script_path
        target_file = target_op if config_type == 'build_op' else target_example if config_type == 'build_example' else None
        default_data = [{
            'config_type': config_type,
            "project_id": project.id,
            'user_options': {
                'op': op.op_name,
                'script': f'bash {script_path}',
                'config_name': op.op_name,
                'target_dir': target_dir,
                'target_file': target_file
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

    def _batch_upsert_configs(self, process_data_list):
        results = []
        update_data = []
        insert_objects = []
        insert_indices = []  # 记录插入操作在results中的索引
        for i, data in enumerate(process_data_list):
            operation = "update" if data.get('config_id') else "create"
            results.append({
                "config_id": data.get('config_id'),
                "operation": operation,
                "status": "success"
            })
            if data.get('config_id'):
                data['id'] = data.get('config_id')
                update_data.append(data)
            else:
                t_config = TConfig(**data)
                insert_objects.append(t_config)
                insert_indices.append(i)
        with safe_db_session() as db:
            try:
                # 批量更新
                if update_data:
                    update_stmt = update(TConfig).where(TConfig.id == bindparam('config_id')).values(
                        script=bindparam('script'),
                        custom_options=bindparam('custom_options'),
                        user_options=bindparam('user_options'),
                        op=bindparam('op'),
                        target_file=bindparam('target_file'),
                        target_dir=bindparam('target_dir'),
                        config_name=bindparam('config_name')
                    ).execution_options(synchronize_session=False)
                    db.execute(update_stmt, update_data)

                # 逐个插入以获取准确的ID
                for obj, idx in zip(insert_objects, insert_indices):
                    db.add(obj)
                    db.flush()  # 立即刷新以获取ID
                    results[idx]["config_id"] = obj.id

                db.commit()
                return results
            except Exception as e:
                db.rollback()
                # 如果有异常，将所有操作标记为失败
                for result in results:
                    result["status"] = "failed"
                    result["error"] = str(e)
                return results


class DefaultConfiguration(BaseConfiguration):
    def get_name(self) -> str:
        return "default"

    def _process_custom_options(self, process_data) -> list:
        return []


config_process_registry: Dict[str, BaseConfiguration] = {'default': DefaultConfiguration()}
def register_config_process(config_process: Type[BaseConfiguration]):
    process_instance = config_process()
    config_process_registry[process_instance.get_name()] = process_instance
    return process_instance


@register_config_process
class BuildConfiguration(BaseConfiguration):
    def get_name(self):
        return "build"

    def get_config(self, project_id, config_type, op=None, db=None):
        build_op_configs = super().get_config(project_id, 'build_op', op)
        build_example_configs = super().get_config(project_id, 'build_example', op)
        return self._merge_config(build_example_configs, build_op_configs)

    def post_config(self, data_list: list, db=None):
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

    def get_config(self, project_id, config_type, op=None, db=None):
        return self._merge_config(super().get_config(project_id, config_type, op))

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

    def get_config(self, project_id, config_type, op=None, db=None):
        on_board_configs = super().get_config(project_id, 'on_board', op)
        simulate_configs = super().get_config(project_id, 'simulate', op)
        return self._merge_config(on_board_configs, simulate_configs)

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
