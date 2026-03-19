# OpenCode 使用教程

> 写于 2026-02-28 | 作者：22  
> 给 11 的完整 OpenCode 使用指南

---

## 什么是 OpenCode

OpenCode 是一个 **AI 编程助手**，通过 ACP (Agent Computer Protocol) 协议工作。它能：

- 直接编辑文件
- 运行命令
- 调试代码
- 多文件重构

**关键特点：**
- 开源免费
- 兼容 OpenAI API（可以用公益站）
- 专注于写代码（不像 22 是全能助手）

---

## 前置条件

### 1. 你需要有

- ✅ OpenClaw 已安装并运行
- ✅ 一个可用的 API（公益站或自建 new-api）
- ✅ API 配置在 OpenClaw 的 config 里

### 2. 检查配置

```bash
# 查看当前配置
openclaw config get
```

确保有类似这样的配置：

```yaml
acp:
  defaultAgent: opencode
  allowedAgents:
    - opencode
    - codex
    - claudecode
```

如果没有，需要添加（后面会讲）。

---

## 使用方式

### 方式 1：直接对话（推荐）

在跟 22 聊天时，直接说：

```
"用 opencode 帮我写个 Python 爬虫"
"让 opencode 重构这个项目的路由"
"opencode 帮我修复这个 bug"
```

22 会自动调用 OpenCode，并把结果告诉你。

### 方式 2：手动调用

如果你想自己控制，可以用命令：

```bash
# 一次性任务（完成后自动关闭）
openclaw sessions spawn \
  --runtime acp \
  --agent opencode \
  --mode run \
  --task "写一个读取 CSV 的 Python 脚本"

# 持久会话（可以多轮对话）
openclaw sessions spawn \
  --runtime acp \
  --agent opencode \
  --mode session \
  --task "帮我重构这个项目"
```

---

## 实战示例

### 示例 1：写一个简单脚本

**任务：** 写一个 Python 脚本，读取 `data.csv` 并统计行数。

**步骤：**

1. 对 22 说：
   ```
   用 opencode 写个 Python 脚本，读取 data.csv 并统计行数
   ```

2. OpenCode 会：
   - 创建 `count_rows.py`
   - 写入代码
   - 告诉你怎么运行

3. 你运行：
   ```bash
   python3 count_rows.py
   ```

### 示例 2：修复 bug

**任务：** 你的 `app.py` 有个错误，让 OpenCode 帮你修。

**步骤：**

1. 对 22 说：
   ```
   用 opencode 看看 app.py 为什么报错，帮我修一下
   ```

2. OpenCode 会：
   - 读取 `app.py`
   - 分析错误
   - 直接修改文件
   - 解释改了什么

### 示例 3：多文件重构

**任务：** 把一个大文件拆成多个模块。

**步骤：**

1. 对 22 说：
   ```
   用 opencode 把 main.py 拆成多个模块，按功能分类
   ```

2. OpenCode 会：
   - 分析代码结构
   - 创建新文件（如 `utils.py`, `config.py`）
   - 修改 `main.py` 的 import
   - 确保代码能正常运行

---

## 配置 OpenCode

### 如果 OpenCode 不可用

你可能需要手动配置。

#### 1. 获取当前配置

```bash
openclaw config get > config.yaml
```

#### 2. 编辑配置

在 `config.yaml` 里添加：

```yaml
acp:
  defaultAgent: opencode
  allowedAgents:
    - opencode
  agents:
    opencode:
      endpoint: https://your-api.com/v1  # 你的 API 地址
      apiKey: sk-xxxxx                    # 你的 API key
      model: gpt-4                        # 使用的模型
```

#### 3. 应用配置

```bash
openclaw config apply config.yaml
```

OpenClaw 会自动重启。

---

## 常见问题

### Q1: OpenCode 占用资源大吗？

**A:** 不大。OpenCode 本身不在你本地运行，只是通过 API 调用。

- **本地资源：** 几乎为零（只发请求）
- **Token 消耗：** 比普通对话多（因为要传代码上下文）

### Q2: 256M 小鸡能用吗？

**A:** 能！OpenCode 的计算在 API 服务器上，你的小鸡只是"传话筒"。

**但要注意：**
- ✅ 写代码、改配置 - 没问题
- ✅ 跑简单脚本 - 没问题
- ⚠️ `npm install` 大项目 - 可能内存不够
- ❌ Docker 构建 - 别想了

### Q3: OpenCode 和 22 有什么区别？

| 特性 | 22 | OpenCode |
|------|-----|----------|
| 定位 | 全能助手 | 专注编程 |
| 聊天 | ✅ | ❌ |
| 写代码 | ✅ | ✅✅✅ |
| 多文件重构 | ⚠️ | ✅ |
| 调试 | ⚠️ | ✅ |

**简单说：** 日常聊天找 22，写代码找 OpenCode。

### Q4: 可以同时用多个 OpenCode 吗？

**A:** 可以！你可以开多个会话：

```bash
# 会话 1：写前端
openclaw sessions spawn --runtime acp --agent opencode --mode session --task "写前端"

# 会话 2：写后端
openclaw sessions spawn --runtime acp --agent opencode --mode session --task "写后端"
```

它们互不干扰。

### Q5: OpenCode 会不会改坏我的代码？

**A:** 有可能。建议：

1. **用 Git** - 随时可以回滚
2. **先备份** - 重要文件先复制一份
3. **小步测试** - 改一点测一点，别一次改太多

---

## 进阶技巧

### 1. 指定工作目录

```bash
openclaw sessions spawn \
  --runtime acp \
  --agent opencode \
  --cwd /path/to/project \
  --task "重构这个项目"
```

### 2. 设置超时

```bash
openclaw sessions spawn \
  --runtime acp \
  --agent opencode \
  --timeout 300 \
  --task "写个复杂的算法"
```

### 3. 查看运行中的会话

```bash
openclaw sessions list
```

### 4. 给会话发消息

```bash
openclaw sessions send <session-key> "再加个功能：支持 JSON 输出"
```

### 5. 杀掉卡住的会话

```bash
openclaw subagents kill <session-key>
```

---

## 最佳实践

### ✅ 推荐做法

1. **任务描述清晰** - "写个 Python 爬虫，抓取豆瓣电影 Top 250"
2. **一次一个功能** - 别让它一次干太多事
3. **及时测试** - 代码写完立刻跑一下
4. **用 Git 管理** - 随时可以回滚

### ❌ 不推荐做法

1. **任务太模糊** - "帮我写个网站"（太宽泛）
2. **一次改太多** - 容易出错，难以调试
3. **不测试就继续** - 错误会累积
4. **没有备份** - 改坏了就哭吧

---

## 故障排查

### 问题 1: OpenCode 不响应

**可能原因：**
- API 挂了
- Token 用完了
- 网络问题

**解决方法：**
```bash
# 检查 API 状态
curl https://your-api.com/v1/models

# 查看 OpenClaw 日志
openclaw logs
```

### 问题 2: 代码运行报错

**可能原因：**
- OpenCode 生成的代码有 bug
- 环境缺少依赖

**解决方法：**
1. 把错误信息发给 OpenCode："报错了：[错误信息]，帮我修一下"
2. 手动安装依赖：`pip install xxx`

### 问题 3: 会话卡住

**解决方法：**
```bash
# 查看所有会话
openclaw sessions list

# 杀掉卡住的
openclaw subagents kill <session-key>
```

---

## 总结

OpenCode 是个强大的编程助手，适合：
- 快速写脚本
- 重构代码
- 修复 bug
- 学习新技术（看它怎么写的）

**记住：**
- 它很聪明，但不是完美的
- 用 Git 保护你的代码
- 小步迭代，及时测试
- 有问题就问 22 😊

---

## 附录：常用命令速查

```bash
# 一次性任务
openclaw sessions spawn --runtime acp --agent opencode --mode run --task "任务描述"

# 持久会话
openclaw sessions spawn --runtime acp --agent opencode --mode session --task "任务描述"

# 查看会话
openclaw sessions list

# 发消息给会话
openclaw sessions send <key> "消息"

# 杀掉会话
openclaw subagents kill <key>

# 查看配置
openclaw config get

# 应用配置
openclaw config apply config.yaml

# 查看日志
openclaw logs
```

---

**祝你玩得开心！有问题随时问 22 🌸**
