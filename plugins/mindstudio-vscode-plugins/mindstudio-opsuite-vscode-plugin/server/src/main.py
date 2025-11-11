#  Copyright (c) 2025, Huawei Technologies.
#  All Rights Reserved.
#  #
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#  #
#      http://www.apache.org/licenses/LICENSE-2.0
#  #
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
#  ==============================================================================

import argparse
import sys
from wsgiref.simple_server import make_server

from app import app
from configs.db import init_database
from configs.log import app_logger
from utils.extension import register_extension



def start_server(server_args):
    """启动服务器"""
    try:
        app_logger.info("启动 VSCode 本地服务...")
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
