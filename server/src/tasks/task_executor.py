#  Copyright (c) 2025 Huawei Technologies Co., Ltd.
#  #
#  This source code is licensed under the MIT license found in the
#  LICENSE file in the root directory of this source tree.
#  ==============================================================================
import importlib
import os.path
import pkgutil
from abc import ABC, abstractmethod
from typing import Dict, Any, Type


class Task(ABC):
    @abstractmethod
    def get_name(self) -> str:
        pass

    @abstractmethod
    def add_task_parser(self, task_subparsers):
        pass

    @abstractmethod
    def collect_task_args(self, task_args) -> dict[str, Any]:
        pass

    @abstractmethod
    def execute(self, **kwargs) -> Dict[str, Any]:
        pass

    def database_required(self) -> bool:
        return True


_task_registry: Dict[str, Type[Task]] = {}

def register_task(task_cls: Type[Task]):
    task_instance = task_cls()
    task_name = task_instance.get_name()
    _task_registry[task_name] = task_cls
    return task_cls


class TaskExecutor:
    def __init__(self):
        self.tasks: Dict[str, Any] = {}
        self._register_modules = set()

    def _ensure_tasks_loaded(self):
        self._discover_tasks()
        for task_name, task_cls in _task_registry.items():
            if task_name not in self.tasks:
                self.register_task(task_cls())

    def _discover_tasks(self):
        try:
            impl_package = 'tasks.impl'
            impl_module = importlib.import_module(impl_package)
            impl_path = os.path.dirname(impl_module.__file__)
            for _, module_name, _ in pkgutil.iter_modules([impl_path]):
                full_name = f'{impl_package}.{module_name}'
                if full_name in self._register_modules:
                    continue
                try:
                    _ = importlib.import_module(full_name)
                    self._register_modules.add(full_name)
                except Exception as e:
                    print(e)
        except Exception as e:
            print(e)

    def register_task(self, task: Task):
        self.tasks[task.get_name()] = task

    def execute_task(self, task_name: str, task_args) -> Dict[str, Any]:
        if task_name not in self.tasks:
            return {
                'code': -1,
                'data': None,
                'message': 'Task not found'
            }
        task = self.tasks[task_name]
        if task.database_required():
            from configs.db import init_database
            if not init_database():
                print("数据库初始化失败，任务执行失败")
                return {
                    'code': -1,
                    'data': "数据库初始化失败，任务执行失败",
                    'message': "数据库初始化失败，任务执行失败"
                }
        args_dict = task.collect_task_args(task_args)
        return task.execute(**args_dict)

    def get_available_tasks(self) -> Dict[str, Task]:
        self._ensure_tasks_loaded()
        return self.tasks

task_executor = TaskExecutor()
