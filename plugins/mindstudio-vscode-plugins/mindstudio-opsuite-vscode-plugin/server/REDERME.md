# opsuite server

## 一、 介绍
mindstudio工具一站式开发插件opsuite后端服务

## 二、快速安装

### 1. 相关依赖

  ```
  requires-python = ">=3.11"
  
  dependencies = [
    "flask>=3.1.2",
    "pydantic>=2.11.7",
    "pyinstaller>=6.16.0",
    "sqlalchemy>=2.0.44",
]
  ```

### 2. 安装方式
uv sync不仅安装和更新包，还卸载多余的包，可以使的pyinstaller打包后的可执行文件体积更小
#### uv (推荐)
```shell
  cd plugins/mindstudio-vscode-plugins/mindstudio-opsuite-vscode-plugin/server
```
##### 1.安装uv
```shell
  pip install uv
```
##### 2.创建虚拟环境
```shell
  uv venv
```
##### 3.激活环境
windows
```shell
  .venv/Scripts/activate.bat
```
linux
```shell
  source .venv/bin/activate
```
##### 4.同步环境
```shell
  uv sync
```

### 3. 运行
#### 源码运行
```shell
  python3 ./scr/main.py
```

#### 打包可执行文件
pyinstaller不支持跨平台，所以在哪个平台打包的产物只能在对应平台运行
```shell
  mv build.spec.template build.spec
```

```shell
  pyinstaller build.spec
```
windows
```shell
  ./dist/vscode_local_service.exe
```
linux
```shell
  ./dist/vscode_local_service
```

### 4.贡献
#### 1. fork仓库
#### 2. 基于vscode_plugin分支开发，修改代码后提交到fork的个人仓vscode_plugin分支
#### 3. 在个人仓Pull Requests提交pr，fork/mstt/vscode_plugin -> Ascend/mstt/vscode_plugin
#### 4. 签署cla，通过后评论/check-cla ，生成标签ascend-cla/yes（已签署的可跳过），
#### 5.评论 compile 触发流水线，等待通过后，生成标签ci-pipeline-passed
#### 6. 两个reviewer评论 /lgtm ，生成标签lgtm
#### 7. 一个个committer评论 /approve ，生成标签approved

