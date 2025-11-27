#  Copyright (c) 2025 Huawei Technologies Co., Ltd.
#
#  This source code is licensed under the MIT license found in the
#  LICENSE file in the root directory of this source tree.
#  ==============================================================================
import argparse
import sys


def start_server(server_args):
    """启动服务器"""
    from wsgiref.simple_server import make_server
    from app import app
    from configs.db import init_database
    from configs.log import app_logger
    from configs.config import settings

    try:
        app_logger.info(f"启动 VSCode 本地服务...,当前环境为：{settings.environment}")
        # 初始化数据库
        if not init_database():
            app_logger.error("服务启动失败：数据库初始化错误")
            return
        port = server_args.port if getattr(server_args, 'port', None) else 5000
        app_logger.info(f"服务地址: http://127.0.0.1:{port}")
        plugin_server = make_server('127.0.0.1', port, app)
        plugin_server.serve_forever()
    except Exception as e:
        app_logger.error(f"启动服务失败: {e}")
        sys.exit(1)


def execute_task(args):
    from configs.log import app_logger
    from tasks.task_executor import task_executor

    try:
        result = task_executor.execute_task(args.task_name, args)
        print(result)
        return result['code'] == 0
    except Exception as e:
        app_logger.error(f"任务执行失败：{e}")
        print({"code": -1, "data": str(e), "message": "任务执行失败"})
        return False


def setup_common_parser(parser):
    parser.add_argument('--extension_publisher', type=str, default='mindstudio', help='插件发布商')
    parser.add_argument('--extension_name', type=str, default='mindstudio-opsuite-vscode-plugin', help='插件名')
    parser.add_argument('--extension_version', type=str, default='0.0.1', help='插件版本')


def setup_server_parser(parser):
    parser.add_argument('--port', '-p', type=int, default=5000)


def setup_task_parser(parser):
    from tasks.task_executor import task_executor
    task_subparsers = parser.add_subparsers(dest='task_name', help='可用任务')
    for task in task_executor.get_available_tasks().values():
        task.add_task_parser(task_subparsers)


def setup_command_parser(parser):
    subparsers = parser.add_subparsers(dest='command', help='可用命令')
    subparsers.default = 'server'

    server_parser = subparsers.add_parser('server', help='启动服务')
    setup_server_parser(server_parser)

    task_parser = subparsers.add_parser('task', help='执行任务')
    setup_task_parser(task_parser)


def main():
    parser = argparse.ArgumentParser(description="插件服务")
    setup_common_parser(parser)
    setup_command_parser(parser)

    args = parser.parse_args()
    if args.command == 'server':
        from utils.extension import register_extension
        from configs.log import app_logger

        app_logger.info("注册插件中")
        if not register_extension(args.extension_publisher, args.extension_name, args.extension_version):
            sys.exit(1)
        app_logger.info("注册插件已完成")
        start_server(args)
    elif args.command == 'task':
        if not hasattr(args, 'task_name') or args.task_name is None:
            task_parser = next(
                subparser for subparser in parser._subparsers._group_actions[0].choices.values() if
                subparser.prog.endswith('task'))
            task_parser.print_help()
            sys.exit(1)
        success = execute_task(args)
        sys.exit(0 if success else 1)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == '__main__':
    main()
