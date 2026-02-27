# claw22 - OpenClaw 管理工具

轻量级 OpenClaw Gateway 管理脚本，提供交互式菜单界面。

## 功能特性

### 🎛️ Gateway 管理
- **状态总览** - 查看 Gateway 运行状态和进程
- **启动/停止/重启** - 基础服务控制
- **强制重启** - 清理卡住的进程和端口占用
- **一键急救** - 自动诊断并修复常见问题

### 📝 配置管理
- **查看配置** - 显示配置文件内容
- **编辑配置** - 自动备份 + JSON 验证
- **手动备份** - 创建配置快照

### 🔍 工具集成
- **查看日志** - 显示最近 100 行日志
- **API 模型查询** - 查询 API 支持的模型列表

## 快速开始

### 安装

```bash
# 克隆仓库
git clone https://github.com/lemmomay/22-claw.git
cd 22-claw/tools

# 赋予执行权限
chmod +x claw22

# 安装到系统路径（可选）
sudo cp claw22 /usr/local/bin/
sudo chmod +x /usr/local/bin/claw22
```

### 使用

```bash
# 直接运行
./claw22

# 或者安装后全局使用
claw22
```

## 菜单选项

```
 1) 状态总览                    - 查看 Gateway 状态和进程
 2) 启动 Gateway                - 启动服务
 3) 停止 Gateway                - 停止服务
 4) 重启 Gateway                - 重启服务
 5) 强制重启                    - 清理进程+端口后重启
 6) 一键急救                    - 自动修复常见问题
 7) 查看日志                    - 显示最近 100 行日志
 8) 查看配置                    - 显示配置文件（前 200 行）
 9) 编辑配置                    - 编辑配置（自动备份+验证）
10) 手动备份配置                - 创建配置备份
11) API 模型查询                - 查询 API 支持的模型
12) 安装快捷命令                - 安装到 /usr/local/bin/claw22
 0) 退出
```

## 常见问题

### Gateway 重启超时/卡住

使用 **强制重启** (选项 5) 或 **一键急救** (选项 6)：

```bash
claw22
# 选择 5 或 6
```

这会自动：
1. 清理卡住的进程
2. 释放端口占用
3. 重新启动服务
4. 验证状态

### 配置文件损坏

脚本在编辑配置前会自动备份，备份文件位于：
```
~/.openclaw/openclaw.json.before_edit.YYYYMMDD_HHMMSS
```

恢复备份：
```bash
cp ~/.openclaw/openclaw.json.before_edit.* ~/.openclaw/openclaw.json
```

### 查询 API 支持的模型

使用 **API 模型查询** (选项 11)：

```bash
claw22
# 选择 11
# 输入 Base URL: https://api.example.com/v1
# 输入 API Key: sk-xxxxx
```

## 依赖

- `bash` - Shell 环境
- `openclaw` - OpenClaw CLI
- `jq` - JSON 处理（可选，用于配置验证）
- `lsof` - 端口检查（可选，用于端口清理）
- `journalctl` - 日志查看（可选）

## 环境变量

- `CLAW_CMD` - OpenClaw 命令路径（默认：`openclaw`）

示例：
```bash
CLAW_CMD=/usr/local/bin/openclaw claw22
```

## 配置文件位置

默认配置文件：`~/.openclaw/openclaw.json`

## 开发

### 项目结构

```
22-claw/
├── tools/
│   ├── claw22              # 主脚本
│   └── README.md           # 本文档
└── ...
```

### 贡献

欢迎提交 Issue 和 Pull Request！

## 许可

MIT License

## 作者

- 22 & 11

---

**项目地址：** https://github.com/lemmomay/22-claw  
**相关工具：** [api-model-checker](../../api-model-checker.sh) - API 模型查询工具
