#  Copyright (c) 2025 Huawei Technologies Co., Ltd.
#  #
#  This source code is licensed under the MIT license found in the
#  LICENSE file in the root directory of this source tree.
#  ==============================================================================
import os
import re
import subprocess
from pathlib import Path

from configs.log import app_logger
from configs.config import settings


ascend_soc_map = {
    "910C": "ascend910_93",
    "910c": "ascend910_93",
    "910B": "ascend910b",
    "910b": "ascend910b",
    "310P": "ascend310p",
    "310p": "ascend310p",
    "910A": "ascend910",
    "910a": "ascend910",
}

def chmod_recursive_standard(path, mode):
    """
    使用标准库递归修改文件夹及文件权限

    :param path: 目标路径
    :param mode: 权限模式，八进制数 (如 0o755) 或 stat常量组合
    """
    try:
        os.chmod(path, mode)
        for root, dirs, files in os.walk(path):
            for item in dirs + files:
                full_path = os.path.join(root, item)
                os.chmod(full_path, mode)
    except Exception as e:
        app_logger.warn(f"Exception while chmod: {e}")

class AscendUtil:
    def __init__(self):
        self.soc_version = None
        self.ascend_env_script = None
        self.cann_env = None
        self.refresh_util()

    def set_soc_version(self, soc_version):
        self.soc_version = soc_version

    def set_ascend_env_script(self, ascend_env_script):
        self.ascend_env_script = ascend_env_script
        self.refresh_ascend_env()

    def get_default_ascend_env_script(self):
        user_path = Path(f"{os.path.expanduser('~')}")
        root_path = Path("/usr/local")
        toolkit_script = "Ascend/ascend-toolkit/set_env.sh"
        ascend_script = "Ascend/set_env.sh"
        script_path_list = [user_path/toolkit_script, user_path/ascend_script, root_path/toolkit_script, root_path/ascend_script]
        for script_path in script_path_list:
            if not script_path.exists():
                continue
            self.ascend_env_script = str(script_path.absolute())
            return self.ascend_env_script

    def refresh_util(self):
        self.get_default_ascend_env_script()
        if settings.ascend_env:
            self.refresh_ascend_env()
            self.refresh_soc_version()

    def get_env_from_script(self, ascend_env_script):
        """
        在 Ascend 环境下运行命令
        """
        env_cmd = f"source {ascend_env_script} && env"
        env_result = subprocess.run(env_cmd, shell=True, executable="/bin/bash",
                       capture_output=True, text=True)
        # 解析环境变量
        env_vars = {}
        for line in env_result.stdout.splitlines():
            if '=' in line:
                key, value = line.split('=', 1)
                env_vars[key] = value

        # 使用获取的环境变量执行目标命令
        current_env = os.environ.copy()
        current_env.update(env_vars)
        return current_env

    def refresh_ascend_env(self):
        self.cann_env = self.get_env_from_script(self.ascend_env_script)

    def refresh_soc_version(self):
        """
        通过 npu-smi info 命令获取昇腾芯片的Name信息
        返回格式例如: 'ascend910A' (具体值取决于你的硬件)
        """
        try:
            # 执行 npu-smi info 命令
            result = subprocess.run(['npu-smi', 'info'],
                                    capture_output=True,
                                    text=True,
                                    check=True)
            output = result.stdout
            names = []
            lines = output.split('\n')
            for line in lines:
                match = re.match(r'^\|\s*(\d+)\s+(\w+)\s+\|', line)
                if match:
                    npu_id = match.group(1)
                    name = match.group(2)
                    names.append((npu_id, name))
            if len(names) > 0:
                self.soc_version = self._get_soc_from_core_name(names[0][1])
                app_logger.info(f"soc_version: {self.soc_version}")
            else:
                raise Exception('soc_version does not match in npu-smi info')
            return names[0]
        except subprocess.CalledProcessError as e:
            app_logger.error(f"执行npu-smi命令失败，错误码: {e.returncode}")
            app_logger.error(f"错误输出: {e.stderr}")
            return None
        except FileNotFoundError:
            app_logger.error("未找到npu-smi命令，请确保已安装昇腾驱动并正确设置环境变量")
            return None
        except Exception as e:
            app_logger.error(f"使用npu-smi命令时出错: {e}")
            return None

    def _get_soc_from_core_name(self, core_name):
        if not core_name:
            return "ascend910b"
        for key, value in ascend_soc_map.items():
            if key in core_name:
                return value
        return "ascend910b"

ascend_util = AscendUtil()