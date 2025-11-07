import os
from pydantic.v1 import BaseSettings


env_file = f"envs/.env,{os.getenv('PUBLISH_TYPE', 'pro')}"

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
