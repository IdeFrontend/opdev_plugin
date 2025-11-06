import sys
from app import app


def start_server():
    """启动服务器"""
    try:
        print("启动 VSCode 本地服务...")

        print(f"服务地址: http://127.0.0.1:5000")
        app.run(host='127.0.0.1', port=5000, debug=False)
    except Exception as e:
        print(f"启动服务失败: {e}")
        sys.exit(1)

if __name__ == '__main__':
    start_server()
