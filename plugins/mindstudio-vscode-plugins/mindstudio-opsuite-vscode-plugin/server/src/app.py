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

from functools import wraps

from flask import Flask, request, jsonify, make_response

from routers import configuration, extension, project

app = Flask(__name__)

app.register_blueprint(configuration.configuration_bp, url_prefix='/api/v1/config')
app.register_blueprint(extension.extension_bp, url_prefix='/api/v1/extension')
app.register_blueprint(project.project_bp, url_prefix='/api/v1/projects')


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


@app.route('/api/v1/health', methods=['GET'])
@cors_enabled
def health_check():
    """
    健康检查接口
    """
    return jsonify({'code': 0, 'data': {'status': 'healthy', 'service': 'vscode-local-service'}})
