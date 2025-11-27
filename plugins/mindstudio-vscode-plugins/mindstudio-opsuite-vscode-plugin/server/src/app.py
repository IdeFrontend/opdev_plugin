#  Copyright (c) 2025 Huawei Technologies Co., Ltd.
#
#  This source code is licensed under the MIT license found in the
#  LICENSE file in the root directory of this source tree.
#  ==============================================================================
import os
from functools import wraps
from configs.log import app_logger
from flask import Flask, request, jsonify, make_response

from common.exception import PluginBaseException
from configs.log import app_logger
from routers import configuration, extension, project, ops_prototype, ops, system_api
from routers import configuration, extension, project, command

app = Flask(__name__)

app.register_blueprint(configuration.configuration_bp, url_prefix='/api/v1/config')
app.register_blueprint(extension.extension_bp, url_prefix='/api/v1/extension')
app.register_blueprint(project.project_bp, url_prefix='/api/v1/projects')
app.register_blueprint(ops_prototype.ops_prototype_bp, url_prefix='/api/v1/ops_prototype')
app.register_blueprint(ops.ops_bp, url_prefix='/api/v1/ops')
app.register_blueprint(system_api.system_bp, url_prefix='/api/v1/sys')

app.register_blueprint(command.command_bp, url_prefix='/api/v1/command')



def add_cors_headers(response):
    """添加 CORS 头到响应"""
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    response.headers['Access-Control-Allow-Credentials'] = 'true'
    return response

def handle_options_request():
    """处理 OPTIONS 预检请求"""
    response = make_response()
    response.headers.add("Access-Control-Allow-Origin", "*")
    response.headers.add("Access-Control-Allow-Headers", "*")
    response.headers.add("Access-Control-Allow-Methods", "*")
    return response

def cors_enabled(decorated_function):
    """CORS 装饰器"""
    @wraps(decorated_function)
    def wrapper(*args, **kwargs):
        if request.method == 'OPTIONS':
            return handle_options_request()
        response = decorated_function(*args, **kwargs)
        return add_cors_headers(response)
    return wrapper


# 在所有响应后添加 CORS 头
@app.after_request
def after_request(response):
    return add_cors_headers(response)


@app.errorhandler(PluginBaseException)
def handle_general_error(error):
    return jsonify({'code': 1, 'data': error.message, 'message': '请求失败'})

@app.errorhandler(Exception)
def handle_general_error(error):
    app_logger.error(f"服务异常：{error}")
    return jsonify({'code': -1, 'data': '服务内部错误', 'message': '服务内部错误'})


@app.route('/api/v1/health', methods=['GET'])
@cors_enabled
def health_check():
    """
    健康检查接口
    """
    return jsonify({'code': 0, 'data': {'status': 'healthy', 'service': 'vscode-local-service', 'user': os.getenv('USER') or os.getenv('USERNAME')}})
