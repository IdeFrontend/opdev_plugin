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

from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from configs.db import Base

class Project(Base):
    __tablename__ = "t_project"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    project_name = Column(String, nullable=False)
    project_path = Column(String, nullable=False, unique=True)
    create_by = Column(String)
    create_time = Column(DateTime, default=func.now())
    update_by = Column(String)
    update_time = Column(DateTime, default=func.now(), onupdate=func.now())

    # 关系
    operators = relationship("Operator", back_populates="project")
    sanitizers = relationship("Sanitizer", back_populates="project")
    opprofs = relationship("OpProf", back_populates="project")
    configs = relationship("TConfig", back_populates="project")


class TConfig(Base):
    __tablename__ = "t_config"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    config_type = Column(String, nullable=False)
    script = Column(String, nullable=False)
    custom_options = Column(String, nullable=True)
    project_id = Column(Integer, ForeignKey("t_project.id"), nullable=False)
    op_ids = Column(Text)
    create_by = Column(String)
    create_time = Column(DateTime, default=func.now())
    update_by = Column(String)
    update_time = Column(DateTime, default=func.now(), onupdate=func.now())

    # 关系
    project = relationship("Project", back_populates="configs")


class TaskRecord(Base):
    __tablename__ = "t_task_record"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    task_type = Column(String)
    status = Column(Integer, nullable=False)
    task_time = Column(Integer)
    result_message = Column(Text)
    create_by = Column(String)
    create_time = Column(DateTime, default=func.now())
    update_by = Column(String)
    update_time = Column(DateTime, default=func.now(), onupdate=func.now())

    # 关系
    operators = relationship("Operator", back_populates="task")
    sanitizers = relationship("Sanitizer", back_populates="task")
    opprofs = relationship("OpProf", back_populates="task")


class Operator(Base):
    __tablename__ = "t_op"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    task_id = Column(Integer, ForeignKey("t_task_record.id"))
    project_id = Column(Integer, ForeignKey("t_project.id"), nullable=False)
    op_class = Column(String, nullable=False)
    op_name = Column(String, nullable=False)
    examples = Column(Text, nullable=False)
    create_by = Column(String)
    create_time = Column(DateTime, default=func.now())
    update_by = Column(String)
    update_time = Column(DateTime, default=func.now(), onupdate=func.now())

    # 关系
    project = relationship("Project", back_populates="operators")
    task = relationship("TaskRecord", back_populates="operators")


class Sanitizer(Base):
    __tablename__ = "t_sanitizer"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    task_id = Column(Integer, ForeignKey("t_task_record.id"), nullable=False)
    project_id = Column(Integer, ForeignKey("t_project.id"), nullable=False)
    sanitizer_name = Column(String, nullable=False)
    op_ids = Column(Text)
    config = Column(Text)
    output_path = Column(String)
    statistic = Column(Text)
    create_by = Column(String)
    create_time = Column(DateTime, default=func.now())
    update_by = Column(String)
    update_time = Column(DateTime, default=func.now(), onupdate=func.now())

    # 关系
    project = relationship("Project", back_populates="sanitizers")
    task = relationship("TaskRecord", back_populates="sanitizers")
    details = relationship("SanitizerDetail", back_populates="sanitizer")


class SanitizerDetail(Base):
    __tablename__ = "t_sanitizer_detail"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    sanitizer_id = Column(Integer, ForeignKey("t_sanitizer.id"), nullable=False)
    type = Column(String)
    source_file = Column(String)
    source_file_line = Column(Integer)
    description = Column(Text)
    detail = Column(Text)
    create_by = Column(String)
    create_time = Column(DateTime, default=func.now())
    update_by = Column(String)
    update_time = Column(DateTime, default=func.now(), onupdate=func.now())

    # 关系
    sanitizer = relationship("Sanitizer", back_populates="details")


class OpProf(Base):
    __tablename__ = "t_opprof"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    task_id = Column(Integer, ForeignKey("t_task_record.id"), nullable=False)
    project_id = Column(Integer, ForeignKey("t_project.id"), nullable=False)
    opprof_name = Column(String, nullable=False)
    op_ids = Column(Text)
    config = Column(Text)
    output_path = Column(String)
    analysis_type = Column(String)
    create_by = Column(String)
    create_time = Column(DateTime, default=func.now())
    update_by = Column(String)
    update_time = Column(DateTime, default=func.now(), onupdate=func.now())

    # 关系
    project = relationship("Project", back_populates="opprofs")
    task = relationship("TaskRecord", back_populates="opprofs")