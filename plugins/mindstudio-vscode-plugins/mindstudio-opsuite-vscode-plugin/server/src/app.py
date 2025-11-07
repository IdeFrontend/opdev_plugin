from functools import wraps

from flask import Flask, request, jsonify, make_response

app = Flask(__name__)


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


@app.route('/api/health', methods=['GET'])
@cors_enabled
def health_check():
    """
    健康检查接口
    """
    return jsonify({'code': 0, 'data': {'status': 'healthy', 'service': 'vscode-local-service'}})
