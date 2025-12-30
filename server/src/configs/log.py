#  Copyright (c) 2025 Huawei Technologies Co., Ltd.
#
#  This source code is licensed under the MIT license found in the
#  LICENSE file in the root directory of this source tree.
#  ==============================================================================
import logging
import sys
import os
from logging.handlers import TimedRotatingFileHandler, RotatingFileHandler

from configs.config import settings, user_data_dir


class Logger:
    """
    日志工具类
    支持控制台和文件输出，可配置日志级别、格式和文件轮转
    """

    # 日志级别映射
    LEVELS = {
        'DEBUG': logging.DEBUG,
        'INFO': logging.INFO,
        'WARNING': logging.WARNING,
        'ERROR': logging.ERROR,
        'CRITICAL': logging.CRITICAL
    }

    def __init__(self, name=None, level='INFO', log_file=os.path.join(os.path.abspath(".."), "build", 'log', 'app.log'),
                 console=True, file_mode='a', format_string=None,
                 rotate_when='D', rotate_interval=1, backup_count=7,
                 max_bytes=10 * 1024 * 1024, encoding='utf-8'):
        """
        初始化日志器

        Args:
            name: 日志器名称，默认为模块名
            level: 日志级别，默认为INFO
            log_file: 日志文件路径，None表示不输出到文件
            console: 是否输出到控制台，默认为True
            file_mode: 文件打开模式，默认为追加模式'a'
            format_string: 日志格式字符串
            rotate_when: 时间轮转单位，'S','M','H','D','W0'-'W6'
            rotate_interval: 轮转间隔
            backup_count: 保留的备份文件数量
            max_bytes: 文件大小轮转的最大字节数
            encoding: 文件编码
        """
        self.name = name or self._get_caller_name()
        self.level = self.LEVELS.get(level.upper(), logging.INFO)
        self.log_file = log_file
        self.console = console
        self.file_mode = file_mode
        self.format_string = format_string or self._get_default_format()
        self.rotate_when = rotate_when
        self.rotate_interval = rotate_interval
        self.backup_count = backup_count
        self.max_bytes = max_bytes
        self.encoding = encoding

        self.logger = None
        self._setup_logger()

    def _get_caller_name(self):
        """获取调用者模块名"""
        try:
            import inspect
            frame = inspect.currentframe()
            # 向上追溯两层：当前方法 -> __init__ -> 调用者
            caller_frame = frame.f_back.f_back
            module = inspect.getmodule(caller_frame)
            return module.__name__ if module else 'unknown'
        except:
            return 'unknown'

    def _get_default_format(self):
        """获取默认日志格式"""
        return '%(asctime)s - %(name)s - %(levelname)s - %(filename)s:%(lineno)d - %(message)s'

    def _setup_logger(self):
        """配置日志器"""
        # 创建日志器
        self.logger = logging.getLogger(self.name)
        self.logger.setLevel(self.level)

        # 避免重复添加处理器（防止在重初始化时重复）
        if self.logger.handlers:
            for handler in self.logger.handlers[:]:
                self.logger.removeHandler(handler)

        # 创建格式化器
        formatter = logging.Formatter(self.format_string)

        # 控制台处理器
        if self.console:
            console_handler = logging.StreamHandler(sys.stdout)
            console_handler.setLevel(self.level)
            console_handler.setFormatter(formatter)
            self.logger.addHandler(console_handler)

        # 文件处理器
        if self.log_file:
            # 确保日志目录存在
            log_dir = os.path.dirname(self.log_file)
            if log_dir and not os.path.exists(log_dir):
                os.makedirs(log_dir, exist_ok=True)

            # 创建文件处理器（支持轮转）
            if self.rotate_when:
                # 时间轮转
                file_handler = TimedRotatingFileHandler(
                    filename=self.log_file,
                    when=self.rotate_when,
                    interval=self.rotate_interval,
                    backupCount=self.backup_count,
                    encoding=self.encoding
                )
            else:
                # 文件大小轮转
                file_handler = RotatingFileHandler(
                    filename=self.log_file,
                    maxBytes=self.max_bytes,
                    backupCount=self.backup_count,
                    encoding=self.encoding
                )

            file_handler.setLevel(self.level)
            file_handler.setFormatter(formatter)
            self.logger.addHandler(file_handler)

    def set_level(self, level):
        """设置日志级别"""
        level_value = self.LEVELS.get(level.upper(), logging.INFO)
        self.logger.setLevel(level_value)
        for handler in self.logger.handlers:
            handler.setLevel(level_value)

    def get_logger(self):
        """获取原始logger对象"""
        return self.logger

    # 日志记录方法
    def debug(self, msg, *args, **kwargs):
        self.logger.debug(msg, *args, **kwargs)

    def info(self, msg, *args, **kwargs):
        self.logger.info(msg, *args, **kwargs)

    def warning(self, msg, *args, **kwargs):
        self.logger.warning(msg, *args, **kwargs)

    def error(self, msg, *args, **kwargs):
        self.logger.error(msg, *args, **kwargs)

    def critical(self, msg, *args, **kwargs):
        self.logger.critical(msg, *args, **kwargs)

    def exception(self, msg, *args, **kwargs):
        self.logger.exception(msg, *args, **kwargs)


# 全局默认日志器
app_logger = Logger(
    name='app_logger',
    level=settings.log_level,
    log_file=os.path.join(user_data_dir, 'logs', 'app.log'),
    console=True
).get_logger()


def setup_global_logger(**kwargs):
    """设置全局默认日志器"""
    global app_logger
    app_logger = Logger(**kwargs)
    return app_logger


def get_global_logger():
    """获取全局日志器"""
    global app_logger
    if app_logger is None:
        app_logger = Logger()
    return app_logger


# 便捷函数
def debug(msg, *args, **kwargs):
    get_global_logger().debug(msg, *args, **kwargs)


def info(msg, *args, **kwargs):
    get_global_logger().info(msg, *args, **kwargs)


def warning(msg, *args, **kwargs):
    get_global_logger().warning(msg, *args, **kwargs)


def error(msg, *args, **kwargs):
    get_global_logger().error(msg, *args, **kwargs)


def critical(msg, *args, **kwargs):
    get_global_logger().critical(msg, *args, **kwargs)


def exception(msg, *args, **kwargs):
    get_global_logger().exception(msg, *args, **kwargs)


# 使用示例
if __name__ == "__main__":
    # 示例1：基本使用
    logger = Logger(level='DEBUG', console=True)
    logger.debug("这是一条调试信息")
    logger.info("这是一条普通信息")
    logger.warning("这是一条警告信息")
    logger.error("这是一条错误信息")

    # 示例2：输出到文件
    file_logger = Logger(
        name='file_logger',
        log_file='logs/app.log',
        level='DEBUG',
        console=False
    )
    file_logger.info("这条信息会写入文件")

    # 示例3：使用全局日志器
    setup_global_logger(
        log_file='logs/global.log',
        level='INFO',
        console=True
    )

    info("使用全局日志器 - 普通信息")
    error("使用全局日志器 - 错误信息")

    # 示例4：带轮转的日志
    rotating_logger = Logger(
        log_file='logs/rotating.log',
        rotate_when='D',  # 按天轮转
        backup_count=30,  # 保留30天
        level='DEBUG'
    )

    # 示例5：异常记录
    try:
        1 / 0
    except Exception as e:
        logger.exception("发生了一个异常: %s", e)
