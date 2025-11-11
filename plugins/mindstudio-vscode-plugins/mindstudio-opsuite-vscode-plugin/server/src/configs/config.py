import os
import sys

from pydantic.v1 import BaseSettings


env_file = f"envs/.env,{os.getenv('PUBLISH_TYPE', 'pro')}"

def get_resource_path(relative_path):
    """获取资源文件的绝对路径，兼容开发环境和PyInstaller打包环境"""
    try:
        # PyInstaller创建临时文件夹存储资源文件
        base_path = sys._MEIPASS
    except Exception:
        # 开发环境使用当前目录
        base_path = os.path.abspath("..")

    return os.path.join(base_path, relative_path)

class DbConfig:
    # 数据库配置
    BASE_DIR = os.path.abspath("..")
    DATABASE_PATH = os.path.join(BASE_DIR, "build", 'data', 'plugin.db')
    DATABASE_URI = f'sqlite:///{DATABASE_PATH}'

class ServerSettings(BaseSettings):

    class Config:
        env_file = env_file
        env_file_encoding = 'utf-8'


config = ServerSettings()
