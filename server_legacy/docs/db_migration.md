# 数据库 schema 管理工具 yoyo-migrations

1. **引入 yoyo-migrations 作为数据库 schema 管理工具**
   - 在 `server` 子项目中声明依赖 `yoyo-migrations`；
   - 启动本地服务时，自动执行 `yoyo apply`，将数据库结构迁移到**当前代码目录中已存在的最新 migration**。

2. **升级行为说明**

以 migration 序列 `A → B → C → D` 为例：

- **用户从 A 升级到 C**
  - 如果「插件 C 的包里只包含 A/B/C 三个 migration」：
    - 启动时执行 `yoyo apply`；
    - 数据库中只会补执行 B、C；
    - **最终数据库结构停在 C**，不会包含 D。

  - 如果某次打包把 D 也一起带进来了（目录中为 A/B/C/D）：
    - `yoyo apply` 会依次执行 B、C、D；
    - **数据库结构会直接升级到 D**。

即：

> **数据库 schema 永远跟随「当前插件代码中实际包含的 migration 列表」前进，而不是跟随插件版本号。**

这也保证了用户可以从任意旧版本直接升级到新版本，只要中间的 migration 脚本都在，yoyo 会依次补齐执行。

---

# 示例：目录结构与 Migration 编写方式

```
server/
  ├── src
        └── main.py  # 服务主入口
  ├── resource/
        └── migrations/         # migration 存放目录
             ├── 0001_create_meta_table.py
             ├── 0002_add_test_columns.py
             └── ...
```

在插件 `server/` 子项目中约定数据库 schema 的 migration 文件统一放在：

```
server/resource/migrations/
```

每个 migration 文件需要满足 yoyo 的命名规范：

```
<revision>_<description>.py
```

其中 `<revision>` 为有序号的版本号，例如：

```
0001_create_meta_table.py
0002_add_test_columns.py
0003_xxx.py
...
```

> **建议：** 序号使用 4 位数字，保持有序性，避免冲突。

---

# Migration 示例

下面展示两个 migration 文件的示例，并给出推荐写法。

### `0001_create_meta_table.py`

```python
# -*- coding: utf-8 -*-
from yoyo import step

steps = [
    step(
        """
        CREATE TABLE IF NOT EXISTS t_meta (
            id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            key         TEXT NOT NULL UNIQUE,
            value       TEXT
        );
        """,
        """
        DROP TABLE IF EXISTS t_meta;
        """
    )
]
```

要点：

- `step()` 的第一个参数是 **upgrade SQL**。
- 第二个参数（可选）是 **downgrade SQL**；如不需要回退，可传空字符串 `""`。
- 采用 **IF NOT EXISTS** 可增强兼容性。

---

### `0002_add_test_columns.py`

```python
# -*- coding: utf-8 -*-
from yoyo import step

steps = [
    step(
        "ALTER TABLE t_meta ADD COLUMN description TEXT;",
        ""
    ),
    step(
        "ALTER TABLE t_meta ADD COLUMN created_at DATETIME;",
        ""
    ),
    step(
        "ALTER TABLE t_meta ADD COLUMN updated_at DATETIME;",
        ""
    ),
]
```

要点：

- 同一个 migration 文件内可以包含多个 `step()`；
- 文件内的 step 会按顺序执行；
- 典型适用场景：同一批字段的新增、同一类结构调整等。

---

# Migration 管理规范（强烈建议遵守）

为了避免前面提到的风险（误带未来 migration → 被提前执行），建议遵循以下约定。

## 1. “只前进不修改”的原则

一旦 migration 文件已被提交（特别是发布过某个版本），**不要修改历史 migration 内容**，只能追加新的 migration。

## 2. 每次功能改动需要一个 migration 文件

例如：

- 表新增字段：写新的 migration；
- 表结构调整：写新的 migration；
- 初始化数据也可以放在 migration 中，但建议独立文件，比如：

```
0003_init_default_values.py
```

## 3. 严格管理打包内容

发布版本时，确保插件包内的 `resource/migrations/` 目录**只包含本版本必须的 migration 文件**。

---

# 扩展：推荐的 migration 文件风格

建议为每个 migration 文件加上 module docstring：

```python
"""
0003_init_default_values

初始化默认数据：
- t_meta 中插入 default 配置
"""

from yoyo import step

steps = [
    step(
        """
        INSERT INTO t_meta (key, value)
        VALUES ('theme', 'dark');
        """,
        """
        DELETE FROM t_meta WHERE key='theme';
        """
    )
]
```

可读性更强，也方便排查。
