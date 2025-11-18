#  Copyright (c) 2025 Huawei Technologies Co., Ltd.
#
#  This source code is licensed under the MIT license found in the
#  LICENSE file in the root directory of this source tree.
#  ==============================================================================
import json
import os
import time
from pathlib import Path

from configs.log import app_logger


def get_current_user():
    """获取当前进程的用户"""
    return os.getenv('USER') or os.getenv('USERNAME')


def register_extension(extension_publisher, extension_name, extension_version):
    try:
        if not all([extension_publisher, extension_name, extension_version]):
            app_logger.error('Missing required parameters: extension_publisher, extension_name, extension_version')
            return False

        # 获取当前用户
        user = get_current_user()
        if not user:
            app_logger.error('Could not determine current user')
            return False

        # 构建文件路径
        extensions_dir = Path(f'/home/{user}/.vscode-server/extensions')
        extensions_json_path = extensions_dir / 'extensions.json'

        # 确保目录存在
        extensions_dir.mkdir(parents=True, exist_ok=True)

        # 读取或初始化extensions.json
        if extensions_json_path.exists():
            try:
                with open(extensions_json_path, 'r', encoding='utf-8') as f:
                    extensions_list = json.load(f)
                if not isinstance(extensions_list, list):
                    extensions_list = []
            except (json.JSONDecodeError, Exception):
                extensions_list = []
        else:
            extensions_list = []

        # 构建插件定义
        extension_id = f"{extension_publisher}.{extension_name}"
        fs_path = f"/home/{user}/.vscode-server/extensions/{extension_id}-{extension_version}"

        extension_definition = {
            "identifier": {
                "id": extension_id
            },
            "extension_version": extension_version,
            "location": {
                "$mid": 1,
                "fsPath": fs_path,
                "path": fs_path,
                "external": f"file://{fs_path}",
                "scheme": "file"
            },
            "relativeLocation": f"{extension_id}-{extension_version}",
            "metadata": {
                "installedTimestamp": int(time.time() * 1000),  # 毫秒时间戳
                "source": "vsix"
            }
        }

        # 检查是否已存在相同ID的插件
        existing_index = -1
        for i, ext in enumerate(extensions_list):
            if ext.get('identifier', {}).get('id') == extension_id:
                existing_index = i
                break

        # 更新或添加插件定义
        if existing_index >= 0:
            if extensions_list[existing_index].get('extension_version', '') == extension_version:
                app_logger.info('Extension already registered')
                return True
            extensions_list[existing_index] = extension_definition
        else:
            extensions_list.append(extension_definition)

        # 写回文件
        with open(extensions_json_path, 'w', encoding='utf-8') as f:
            json.dump(extensions_list, f, indent=2, ensure_ascii=False) # type: ignore

        return True

    except Exception as e:
        app_logger.error(f'Register extension failed: {e}')
        return False