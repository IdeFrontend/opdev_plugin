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
import argparse

class AICoreUtils(object):
    __instance = None

    def __init__(self):
        self.__parser = argparse.ArgumentParser(description='解析自定义参数列表示例')
        # 添加 --soc 参数（字符串类型）
        self.__parser.add_argument('--soc', type=str, help='SOC型号，例如 310p')
        # 添加 --ved_name 参数（字符串类型）
        self.__parser.add_argument('--ved_name', type=str, help='视频名称，例如 xxx')
        # 添加 --debug 参数（开关类型，无需值）
        self.__parser.add_argument('--debug', action='store_true', help='开启调试模式')
        # 添加 --o3 参数（开关类型，无需值）
        self.__parser.add_argument('--o3', action='store_true', help='开启 O3 优化')

    def __new__(cls, *args, **kwargs):
        # 如果实例不存在，则创建；否则直接返回已有实例
        if not cls.__instance:
            cls.__instance = super().__new__(cls, *args, **kwargs)
        return cls.__instance

    def get_soc(self):
        """
            1.执行npu-smi info命令，解析出device name
            2.使用device name使用表格查询出soc
        """
        #TODO:
        return "310p"

    def parse_cmd_options(self, options):
        # 创建参数解析器
        if not options:
            return None
        args_list = options.split(" ")
        # 解析参数列表（而不是命令行输入）
        return self.__parser.parse_args(args_list)

aicore_utils = AICoreUtils()
