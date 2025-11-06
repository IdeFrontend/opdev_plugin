from flask import Flask, request, jsonify

app = Flask(__name__)


@app.route('/api/execute', methods=['POST'])
def execute_code():
    """
    执行代码的接口
    """
    try:
        data = request.get_json()
        code = data.get('code', '')

        # 这里可以添加执行逻辑
        result = f"执行代码: {code}"

        return jsonify({
            'success': True,
            'result': result,
            'error': None
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'result': None,
            'error': str(e)
        })


@app.route('/api/health', methods=['GET'])
def health_check():
    """
    健康检查接口
    """
    return jsonify({'status': 'healthy', 'service': 'vscode-local-service'})
