#  Copyright (c) 2025 Huawei Technologies Co., Ltd.
#
#  This source code is licensed under the MIT license found in the
#  LICENSE file in the root directory of this source tree.
#  ==============================================================================
import sqlite3
import os
from contextlib import contextmanager
from smtpd import usage

from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker, declarative_base

from .config import DbConfig, get_resource_path
from .log import app_logger

from yoyo import read_migrations, get_backend

# 创建引擎和会话
engine = create_engine(DbConfig.DATABASE_URI,
                       connect_args={"check_same_thread": False},
                       pool_size=5,
                       max_overflow=5,
                       pool_timeout=60,
                       pool_recycle=3600,
                       pool_pre_ping=True,
                       echo=False
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

MIGRATIONS_DIR = get_resource_path('resource/migrations')

def run_migrations():
    """执行所有尚未执行的 yoyo migrations"""
    if not os.path.exists(MIGRATIONS_DIR):
        app_logger.info(f"未找到 migrations 目录 ({MIGRATIONS_DIR})，跳过数据库迁移。")
        return

    backend = get_backend(DbConfig.DATABASE_URI)
    migrations = read_migrations(MIGRATIONS_DIR)

    with backend.lock():
        to_apply = backend.to_apply(migrations)
        if not to_apply:
            app_logger.info("没有需要执行的数据库迁移。")
            return

        app_logger.info(f"开始执行 {len(to_apply)} 个数据库迁移...")
        backend.apply_migrations(to_apply)
        app_logger.info("数据库迁移完成。")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def close_db_session(db):
    if db:
        try:
            db.close()
        except Exception as e:
            app_logger.error(f"关闭数据库会话失败: {e}")

@contextmanager
def safe_db_session():
    db = None
    try:
        db = SessionLocal()
        yield db
    except Exception as e:
        if db:
            db.rollback()
        app_logger.error(f"数据库操作失败: {e}")
        raise
    finally:
        if db:
            close_db_session(db)


def with_db_session(func):
    def wrapper(*args, **kwargs):
        with safe_db_session() as db:
            kwargs['db'] = db
            return func(*args, **kwargs)
    return wrapper


def init_database():
    """初始化数据库表结构 + 执行迁移"""
    os.makedirs(os.path.dirname(DbConfig.DATABASE_PATH), exist_ok=True)

    # 检查表是否已初始化（这里只检查“最初版本”的必需表）
    inspector = inspect(engine)
    tables = inspector.get_table_names()

    required_tables = [
        't_project', 't_config', 't_task_record', 't_op',
        't_sanitizer', 't_sanitizer_detail', 't_opprof'
    ]

    # 如果基础表都在，说明已经跑过 db_init_sqlite.sql，可以直接进入迁移流程
    if all(table in tables for table in required_tables):
        app_logger.info("检测到数据库已初始化，跳过基础建表，检查是否需要迁移...")
    else:
        # 还没初始化过，执行 db_init_sqlite.sql
        sql_file = get_resource_path('resource/db_init_sqlite.sql')
        if not os.path.exists(sql_file):
            app_logger.error(f"SQL文件 {sql_file} 不存在!")
            return False

        app_logger.info("数据库未初始化，开始执行初始化 SQL 脚本...")
        with open(sql_file, 'r', encoding='utf-8') as f:
            sql_script = f.read()

        conn = sqlite3.connect(DbConfig.DATABASE_PATH)
        cursor = conn.cursor()

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

    # 新增：不论是老用户还是新用户，在这里统一执行迁移
    try:
        run_migrations()
    except Exception as e:
        app_logger.error(f"执行数据库迁移失败: {e}")
        return False

    return True

