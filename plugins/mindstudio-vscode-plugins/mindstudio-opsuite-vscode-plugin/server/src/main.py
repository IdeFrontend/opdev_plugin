#  Copyright (c) 2025 Huawei Technologies Co., Ltd.
#
#  This source code is licensed under the MIT license found in the
#  LICENSE file in the root directory of this source tree.
#  ==============================================================================

import argparse
import sys
from wsgiref.simple_server import make_server

from app import app
from configs.db import init_database
from configs.log import app_logger
from configs.config import settings
from utils.extension import register_extension



def start_server(server_args):
    """启动服务器"""
    try:
        app_logger.info(f"启动 VSCode 本地服务...,当前环境为：{settings.environment}")
        # 初始化数据库
        if not init_database():
            app_logger.error("服务启动失败：数据库初始化错误")
            return
        app_logger.info(f"服务地址: http://127.0.0.1:{server_args.port}")
        plugin_server = make_server('127.0.0.1', server_args.port, app)
        plugin_server.serve_forever()
    except Exception as e:
        app_logger.error(f"启动服务失败: {e}")
        sys.exit(1)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="插件服务")
    parser.add_argument('--port', '-p', type=int, default=5000)
    parser.add_argument('--extension_publisher', type=str, default='mindstudio')
    parser.add_argument('--extension_name', type=str, default='mindstudio-opsuite-vscode-plugin')
    parser.add_argument('--extension_version', type=str, default='0.0.1')
    args = parser.parse_args()

    app_logger.info("注册插件中")
    if not register_extension(args.extension_publisher, args.extension_name, args.extension_version):
        sys.exit(1)
    app_logger.info("注册插件已完成")

    start_server(args)
