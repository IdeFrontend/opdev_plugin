
pip install uv --trusted-host mirrors.huaweicloud.com -i https://mirrors.huaweicloud.com/repository/pypi/simple
uv sync
source .venv/bin/activate

mv build.spec.template build.spec
pyinstaller build.spec
