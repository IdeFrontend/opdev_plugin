#  Copyright (c) 2025 Huawei Technologies Co., Ltd.
#  #
#  This source code is licensed under the MIT license found in the
#  LICENSE file in the root directory of this source tree.
#  ==============================================================================
import os
from pathlib import Path

from configs.log import app_logger


def get_files(path, file_type):
    try:
        base_path = Path(path)
        if not base_path.exists():
            app_logger.error(f'{base_path} does not exists')
            return []
        items = []
        for item in base_path.iterdir():
            if item.is_dir():
                items.append({
                    'name': item.name,
                    'path': str(item.absolute()),
                    'type': 'directory'
                })
            elif file_type != 'dir' and (file_type == 'all' or (item.is_file() and item.suffix == f'.{file_type}')):
                items.append({
                    'name': item.name,
                    'path': str(item.absolute()),
                    'type': item.suffix[1:]
                })
        items.sort(key=lambda d: d['name'])
        return items
    except Exception as e:
        app_logger.error(e)
        return []


def get_default_ascend_env_sh_dir():
    try:
        user_name = os.getenv('USER') or os.getenv('USERNAME')
        user_path = Path(f'/home/{user_name}/Ascend/ascend-toolkit/set_env.sh')
        root_path = Path('/usr/local/Ascend/ascend-toolkit/set_env.sh')
        if not root_path.exists() and not user_path.exists():
            app_logger.error(f'{root_path} and {user_path} does not exists')
            return []
        if user_path.exists():
            return get_files(f'/home/{user_name}/Ascend/ascend-toolkit/', 'sh')
        else:
            return get_files('/usr/local/Ascend/ascend-toolkit/', 'sh')
    except Exception as e:
        app_logger.error(e)
        return []
