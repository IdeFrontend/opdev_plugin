
pip install uv --trusted-host mirrors.huaweicloud.com -i https://mirrors.huaweicloud.com/repository/pypi/simple
uv sync

mv build.spec.template build.spec
pyinstaller build.spec
