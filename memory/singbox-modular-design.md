# Sing-box 模块化脚本设计

> 设计日期：2026-02-28  
> 设计者：11  
> 核心理念：**纯模块化，永不臃肿**

---

## 🎯 设计目标

### 核心问题
- 现有脚本都是从轻量化开始
- 随着功能增加逐渐臃肿
- 后期维护困难，代码耦合严重

### 解决方案
**纯模块化架构**
- 核心脚本只负责调度
- 每个功能独立模块
- 新功能 = 新模块，不改核心
- 模块可插拔，按需加载

---

## 🏗️ 架构设计

### 目录结构（初步设想）

```
singbox-manager/
├── singbox.sh              # 核心调度脚本（极简）
├── config/
│   ├── settings.conf       # 全局配置
│   └── modules.conf        # 模块启用列表
├── modules/                # 功能模块目录
│   ├── core/               # 核心模块（必需）
│   │   ├── install.sh      # 安装/卸载
│   │   ├── service.sh      # 服务管理
│   │   └── update.sh       # 更新管理
│   ├── config/             # 配置模块
│   │   ├── inbound.sh      # 入站配置
│   │   ├── outbound.sh     # 出站配置
│   │   └── route.sh        # 路由配置
│   ├── user/               # 用户管理模块
│   │   ├── add.sh          # 添加用户
│   │   ├── delete.sh       # 删除用户
│   │   └── list.sh         # 用户列表
│   ├── stats/              # 统计模块（可选）
│   │   ├── traffic.sh      # 流量统计
│   │   └── speed.sh        # 速度测试
│   └── advanced/           # 高级功能（可选）
│       ├── backup.sh       # 备份恢复
│       ├── multi-port.sh   # 多端口
│       └── load-balance.sh # 负载均衡
├── lib/                    # 公共库
│   ├── common.sh           # 通用函数
│   ├── ui.sh               # UI 组件
│   └── validator.sh        # 参数验证
└── README.md
```

---

## 🔧 核心原则

### 1. 模块独立性
- 每个模块是独立的 shell 脚本
- 模块之间通过标准接口通信
- 模块可以单独测试、单独更新

### 2. 按需加载
- 用户可以选择启用哪些模块
- 不需要的功能不加载（保持轻量）
- 模块启用/禁用不影响核心

### 3. 标准化接口
每个模块必须实现：
```bash
# 模块元信息
MODULE_NAME="模块名称"
MODULE_VERSION="1.0.0"
MODULE_DESCRIPTION="模块描述"
MODULE_DEPENDENCIES=("依赖模块1" "依赖模块2")

# 必需函数
module_init()    # 初始化
module_run()     # 执行
module_cleanup() # 清理
module_help()    # 帮助信息
```

### 4. 配置分离
- 配置文件与代码分离
- 支持多配置文件
- 配置热加载（不重启服务）

---

## 💡 核心脚本设计（singbox.sh）

### 职责
- 加载配置
- 发现并注册模块
- 调度模块执行
- 提供统一的 CLI 接口

### 伪代码
```bash
#!/bin/bash

# 1. 加载公共库
source lib/common.sh
source lib/ui.sh

# 2. 加载配置
load_config "config/settings.conf"
load_modules "config/modules.conf"

# 3. 解析命令
case "$1" in
    install)   run_module "core/install" "$@" ;;
    start)     run_module "core/service" "start" ;;
    add-user)  run_module "user/add" "$@" ;;
    stats)     run_module "stats/traffic" "$@" ;;
    *)         show_help ;;
esac
```

**关键：核心脚本永远保持简单，只做调度！**

---

## 🎨 模块示例

### 示例：用户添加模块（modules/user/add.sh）

```bash
#!/bin/bash

MODULE_NAME="user-add"
MODULE_VERSION="1.0.0"
MODULE_DESCRIPTION="添加新用户"
MODULE_DEPENDENCIES=("core/service")

module_init() {
    # 检查依赖
    check_dependency "jq"
    check_dependency "sing-box"
}

module_run() {
    local username="$1"
    local protocol="$2"
    
    # 参数验证
    validate_username "$username" || return 1
    validate_protocol "$protocol" || return 1
    
    # 生成配置
    generate_user_config "$username" "$protocol"
    
    # 重载服务
    reload_service
    
    # 显示结果
    show_user_info "$username"
}

module_cleanup() {
    # 清理临时文件
    rm -f /tmp/user-*.tmp
}

module_help() {
    cat << EOF
用法: singbox.sh add-user <用户名> <协议>

参数:
  用户名    用户标识（字母数字）
  协议      vless/vmess/trojan/hysteria2

示例:
  singbox.sh add-user alice vless
EOF
}

# 如果直接运行模块
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    module_init
    module_run "$@"
    module_cleanup
fi
```

---

## 🚀 优势

### 对比传统脚本

| 特性 | 传统脚本 | 模块化脚本 |
|------|---------|-----------|
| 代码行数 | 2000+ 行 | 核心 <200 行 |
| 添加功能 | 修改主脚本 | 新增模块 |
| 维护难度 | 高（耦合） | 低（独立） |
| 测试 | 全量测试 | 模块测试 |
| 定制化 | 困难 | 容易 |
| 学习曲线 | 陡峭 | 平缓 |

### 长期收益
- ✅ 永远不会臃肿（核心不变）
- ✅ 功能可插拔（按需启用）
- ✅ 易于维护（模块独立）
- ✅ 易于扩展（标准接口）
- ✅ 易于分享（模块可单独分发）

---

## 📋 开发计划

### Phase 1: 核心框架（1-2 天）
- [ ] 核心调度脚本
- [ ] 公共库（common.sh, ui.sh）
- [ ] 模块加载机制
- [ ] 配置管理

### Phase 2: 基础模块（2-3 天）
- [ ] core/install - 安装卸载
- [ ] core/service - 服务管理
- [ ] config/inbound - 入站配置
- [ ] config/outbound - 出站配置

### Phase 3: 用户模块（1-2 天）
- [ ] user/add - 添加用户
- [ ] user/delete - 删除用户
- [ ] user/list - 用户列表
- [ ] user/modify - 修改用户

### Phase 4: 高级功能（按需）
- [ ] stats/traffic - 流量统计
- [ ] advanced/backup - 备份恢复
- [ ] advanced/multi-port - 多端口
- [ ] 更多模块...

---

## 🎯 设计哲学

> "核心永远简单，功能无限扩展"

**三大原则：**
1. **KISS** - Keep It Simple, Stupid（保持简单）
2. **DRY** - Don't Repeat Yourself（不重复）
3. **SOLID** - 单一职责、开闭原则

**一个承诺：**
- 无论加多少功能
- 核心脚本永远 <200 行
- 每个模块永远 <300 行

---

## 📝 待讨论

- [ ] 模块依赖管理机制
- [ ] 模块版本兼容性
- [ ] 模块市场/仓库（未来）
- [ ] 自动更新机制
- [ ] 错误处理和日志

---

## 🌐 参考项目

- **Oh My Zsh** - 插件化 shell 配置
- **Vim-Plug** - 模块化插件管理
- **Docker Compose** - 服务编排

---

**状态：** 设计阶段  
**优先级：** 中等  
**预计开发时间：** 1-2 周  
**GitHub：** https://github.com/lemmomay/22-claw/tree/master/singbox-manager（待创建）

---

_这次一定要做对，不能重蹈覆辙！_ 💪
