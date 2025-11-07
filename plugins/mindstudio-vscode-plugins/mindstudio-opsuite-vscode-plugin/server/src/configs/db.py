from flask import g
import sqlite3
import os
import sys

from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker, declarative_base

from .config import DbConfig
from .log import app_logger


# 创建引擎和会话
engine = create_engine(DbConfig.DATABASE_URI, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_resource_path(relative_path):
    """获取资源文件的绝对路径，兼容开发环境和PyInstaller打包环境"""
    try:
        # PyInstaller创建临时文件夹存储资源文件
        base_path = sys._MEIPASS
    except Exception:
        # 开发环境使用当前目录
        base_path = os.path.abspath("..")

    return os.path.join(base_path, relative_path)


def init_database():
    """初始化数据库表结构"""
    os.makedirs(os.path.dirname(DbConfig.DATABASE_PATH), exist_ok=True)

    # 检查表是否已初始化
    inspector = inspect(engine)
    tables = inspector.get_table_names()

    required_tables = [
        't_project', 't_task_record', 't_op',
        't_sanitizer', 't_sanitizer_detail', 't_opprof'
    ]

    if all(table in tables for table in required_tables):
        app_logger.info("数据库已初始化，跳过初始化步骤。")
        return True

    sql_file = get_resource_path('resource/db_init_sqlite.sql')
    if not os.path.exists(sql_file):
        app_logger.error(f"SQL文件 {sql_file} 不存在!")
        return False

    app_logger.info("数据库未初始化，开始初始化...")
    # 读取并执行SQL初始化脚本
    with open(sql_file, 'r', encoding='utf-8') as f:
        sql_script = f.read()

    # 使用SQLite连接执行SQL脚本
    conn = sqlite3.connect(DbConfig.DATABASE_PATH)
    cursor = conn.cursor()

    # 执行SQL语句
    try:
        cursor.executescript(sql_script)
        conn.commit()
        app_logger.info("数据库初始化成功!")
    except Exception as e:
        app_logger.error(f"数据库初始化失败: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()
    return True
