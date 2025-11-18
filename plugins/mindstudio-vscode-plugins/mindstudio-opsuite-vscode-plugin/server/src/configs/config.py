#  Copyright (c) 2025 Huawei Technologies Co., Ltd.
#
#  This source code is licensed under the MIT license found in the
#  LICENSE file in the root directory of this source tree.
#  ==============================================================================
import os
import sys
from functools import lru_cache

from pydantic.v1 import BaseSettings

def get_resource_path(relative_path):
    """获取资源文件的绝对路径，兼容开发环境和PyInstaller打包环境"""
    try:
        # PyInstaller创建临时文件夹存储资源文件
        base_path = sys._MEIPASS
    except Exception:
        # 开发环境使用当前目录
        base_path = os.path.abspath("..")

    return os.path.join(base_path, relative_path)

env_file = get_resource_path(f"envs/{os.getenv('RUNNING_ENV', 'pro')}.env")

class DbConfig:
    # 数据库配置
    BASE_DIR = os.path.abspath("..")
    DATABASE_PATH = os.path.join(BASE_DIR, "build", 'data', 'plugin.db')
    DATABASE_URI = f'sqlite:///{DATABASE_PATH}'

class EnvironmentSettings(BaseSettings):
    # 环境类型
    environment: str = "production"
    log_level: str = "INFO"
    ascend_env = True

    class Config:
        env_file = env_file
        env_file_encoding = 'utf-8'


@lru_cache
def get_settings():
    return EnvironmentSettings()

settings = get_settings()
