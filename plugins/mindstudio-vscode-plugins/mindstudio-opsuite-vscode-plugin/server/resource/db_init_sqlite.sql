/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

-- 项目表
CREATE TABLE IF NOT EXISTS t_project
(
    id           INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,        -- 项目ID，主键自增
    project_name TEXT                              NOT NULL,        -- 项目名称
    project_path TEXT                              NOT NULL UNIQUE, -- 项目存储路径(唯一)
    ascend_env_script TEXT,
    create_by    TEXT,                                              -- 创建人
    create_time  DATETIME DEFAULT CURRENT_TIMESTAMP,                -- 创建时间
    update_by    TEXT,                                              -- 更新人
    update_time  DATETIME DEFAULT CURRENT_TIMESTAMP                 -- 更新时间
);

-- 项目存储路径索引
CREATE INDEX IF NOT EXISTS idx_project_path ON t_project (project_path);

-- 配置表
CREATE TABLE IF NOT EXISTS t_config
(
    id             INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, -- 项目ID，主键自增
    config_name    TEXT    NOT NULL,                           -- 配置名称
    config_type    TEXT    NOT NULL,                           -- 配置类型
    script         TEXT    NOT NULL,                           -- 脚本、可执行文件路径
    custom_options TEXT,                                       -- 脚本参数
    user_options   TEXT,                                       -- 用户选项
    target_dir     TEXT,                                       -- 编译产物位置
    target_file    TEXT,                                       -- 编译产物名
    project_id     INTEGER NOT NULL,                           -- 所属项目ID
    op             TEXT    NOT NULL,                           -- 算子名称
    create_by      TEXT,                                       -- 创建人
    create_time    DATETIME DEFAULT CURRENT_TIMESTAMP,         -- 创建时间
    update_by      TEXT,                                       -- 更新人
    update_time    DATETIME DEFAULT CURRENT_TIMESTAMP,         -- 更新时间
    FOREIGN KEY (project_id) REFERENCES t_project (id)         -- 外键关联项目表
);

-- 任务记录表
CREATE TABLE IF NOT EXISTS t_task_record
(
    id             INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, -- 任务记录ID
    task_type      TEXT,                                       -- 任务类型
    status         INTEGER                           NOT NULL, -- 执行状态:0成功/1失败
    task_time      INTEGER,                                    -- 耗时(毫秒)
    result_message TEXT,                                       -- 执行结果信息
    create_by      TEXT,                                       -- 创建人
    create_time    DATETIME DEFAULT CURRENT_TIMESTAMP,         -- 创建时间
    update_by      TEXT,                                       -- 更新人
    update_time    DATETIME DEFAULT CURRENT_TIMESTAMP          -- 更新时间
);

-- 算子表
CREATE TABLE IF NOT EXISTS t_op
(
    id          INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, -- 算子ID
    task_id     INTEGER,                                    -- 关联任务ID
    project_id  INTEGER                           NOT NULL, -- 所属项目ID
    op_class    TEXT,                                       -- 算子类型
    op_name     TEXT                              NOT NULL, -- 算子名称
    op_type     TEXT DEFAULT 'ascend',                      -- 算子类型，默认为ascend
    ascend_env_script TEXT,
    examples    TEXT,                                       -- examples算子调用所在路径
    create_by   TEXT,                                       -- 创建人
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,         -- 创建时间
    update_by   TEXT,                                       -- 更新人
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP,         -- 更新时间
    FOREIGN KEY (project_id) REFERENCES t_project (id),     -- 外键关联项目表
    FOREIGN KEY (task_id) REFERENCES t_task_record (id)     -- 外键关联任务记录表
);

-- 项目下算子唯一索引（保证同一项目内算子类型和名称唯一）
CREATE UNIQUE INDEX IF NOT EXISTS uk_project_op ON t_op (project_id, op_class, op_name);

-- 检测主表
CREATE TABLE IF NOT EXISTS t_sanitizer
(
    id             INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, -- 检测ID
    task_id        INTEGER                           NOT NULL, -- 关联任务ID
    project_id     INTEGER                           NOT NULL, -- 所属项目ID
    sanitizer_name TEXT                              NOT NULL, -- 检测名称
    op             TEXT                              NOT NULL, -- 算子名称
    config         TEXT,                                       -- 检测配置(JSON格式)
    output_path    TEXT,                                       -- 结果输出路径
    statistic      TEXT,                                       -- 统计结果(JSON格式)
    create_by      TEXT,                                       -- 创建人
    create_time    DATETIME DEFAULT CURRENT_TIMESTAMP,         -- 创建时间
    update_by      TEXT,                                       -- 更新人
    update_time    DATETIME DEFAULT CURRENT_TIMESTAMP,         -- 更新时间
    FOREIGN KEY (project_id) REFERENCES t_project (id),        -- 外键关联项目表
    FOREIGN KEY (task_id) REFERENCES t_task_record (id)        -- 外键关联任务记录表
);

-- 项目任务联合索引
CREATE INDEX IF NOT EXISTS idx_project_task ON t_sanitizer (project_id, task_id);

-- 检测详情表
CREATE TABLE IF NOT EXISTS t_sanitizer_detail
(
    id               INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, -- 详情ID
    sanitizer_id     INTEGER                           NOT NULL, -- 关联检测ID
    type             TEXT,                                       -- 问题类型
    source_file      TEXT,                                       -- 源文件路径
    source_file_line INTEGER,                                    -- 源代码行号
    description      TEXT,                                       -- 问题描述
    detail           TEXT,                                       -- 问题详情
    create_by        TEXT,                                       -- 创建人
    create_time      DATETIME DEFAULT CURRENT_TIMESTAMP,         -- 创建时间
    update_by        TEXT,                                       -- 更新人
    update_time      DATETIME DEFAULT CURRENT_TIMESTAMP,         -- 更新时间
    FOREIGN KEY (sanitizer_id) REFERENCES t_sanitizer (id)       -- 外键关联检测主表
);

-- 检测ID索引
CREATE INDEX IF NOT EXISTS idx_sanitizer_id ON t_sanitizer_detail (sanitizer_id);

-- 性能分析表
CREATE TABLE IF NOT EXISTS t_opprof
(
    id            INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, -- 分析ID
    task_id       INTEGER                           NOT NULL, -- 关联任务ID
    project_id    INTEGER                           NOT NULL, -- 所属项目ID
    opprof_name   TEXT                              NOT NULL, -- 分析名称
    op            TEXT                              NOT NULL, -- 算子名称
    config        TEXT,                                       -- 分析配置(JSON格式)
    output_path   TEXT,                                       -- 结果输出路径
    analysis_type TEXT,                                       -- 分析类型:[roofline,source]
    create_by     TEXT,                                       -- 创建人
    create_time   DATETIME DEFAULT CURRENT_TIMESTAMP,         -- 创建时间
    update_by     TEXT,                                       -- 更新人
    update_time   DATETIME DEFAULT CURRENT_TIMESTAMP,         -- 更新时间
    FOREIGN KEY (project_id) REFERENCES t_project (id),       -- 外键关联项目表
    FOREIGN KEY (task_id) REFERENCES t_task_record (id)       -- 外键关联任务记录表
);

-- 性能分析表项目任务联合索引
CREATE INDEX IF NOT EXISTS idx_project_task_opprof ON t_opprof (project_id, task_id);