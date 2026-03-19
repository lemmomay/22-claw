# Sing-box 模块化架构 - 优雅落地方案

> 设计日期：2026-02-28  
> 核心理念：**数据驱动 + 按需加载 + 资源自适应**

---

## 🎯 核心设计思想

### 三大支柱

1. **数据驱动** - 模块通过统一数据源通信，不互相调用
2. **按需加载** - 根据机器资源自动/手动选择模块
3. **资源自适应** - 不同配置的机器运行不同的模块组合

---

## 🏗️ 架构设计

### 整体架构图

```
┌─────────────────────────────────────────────────────┐
│                  配置层 (Config Layer)                │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │ nodes.yaml   │  │ profile.yaml │  │ state.db  │  │
│  │ (节点配置)    │  │ (运行配置)    │  │ (运行状态) │  │
│  └──────────────┘  └──────────────┘  └───────────┘  │
└─────────────────────────────────────────────────────┘
                         ↑ ↓
┌─────────────────────────────────────────────────────┐
│                  核心层 (Core Layer)                  │
│  ┌──────────────────────────────────────────────┐   │
│  │  manager.sh (核心调度器)                      │   │
│  │  - 模块发现与注册                             │   │
│  │  - 依赖检查                                   │   │
│  │  - 资源评估                                   │   │
│  │  - 命令路由                                   │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
                         ↑ ↓
┌─────────────────────────────────────────────────────┐
│                  模块层 (Module Layer)                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ Sing-box │  │   Argo   │  │  Relay   │  ...     │
│  │  (轻量)   │  │  (中等)   │  │  (重量)   │          │
│  └──────────┘  └──────────┘  └──────────┘          │
└─────────────────────────────────────────────────────┘
```

---

## 📁 目录结构

```
singbox-manager/
├── manager.sh                  # 核心调度器（<200 行）
├── config/
│   ├── nodes.yaml              # 节点配置（数据中心）
│   ├── profile.yaml            # 运行配置（哪些模块启用）
│   └── state.db                # 运行状态（SQLite，可选）
├── modules/
│   ├── core/                   # 核心模块（必需，极轻量）
│   │   ├── module.conf         # 模块元信息
│   │   ├── install.sh          # 安装/卸载
│   │   └── health.sh           # 健康检查
│   ├── singbox/                # Sing-box 模块（轻量）
│   │   ├── module.conf         # 元信息：weight=light, mem=32M
│   │   ├── deploy.sh           # 部署直连节点
│   │   ├── config.sh           # 配置生成
│   │   └── service.sh          # 服务管理
│   ├── argo/                   # Argo 模块（中等）
│   │   ├── module.conf         # 元信息：weight=medium, mem=64M
│   │   ├── setup.sh            # 创建隧道
│   │   └── manage.sh           # 管理隧道
│   ├── relay/                  # 中转模块（重量）
│   │   ├── module.conf         # 元信息：weight=heavy, mem=128M
│   │   ├── import.sh           # 导入订阅
│   │   └── forward.sh          # 启动转发
│   ├── stats/                  # 统计模块（可选，中等）
│   │   ├── module.conf         # 元信息：weight=medium, mem=64M
│   │   └── traffic.sh          # 流量统计
│   └── webui/                  # Web UI 模块（可选，重量）
│       ├── module.conf         # 元信息：weight=heavy, mem=256M
│       └── server.sh           # Web 服务器
├── lib/
│   ├── common.sh               # 通用函数
│   ├── yaml.sh                 # YAML 操作（使用 yq）
│   ├── module.sh               # 模块管理
│   └── resource.sh             # 资源检测
└── profiles/                   # 预设配置（可选）
    ├── minimal.yaml            # 最小配置（64M）
    ├── standard.yaml           # 标准配置（256M）
    └── full.yaml               # 完整配置（512M+）
```

---

## 🔧 核心设计

### 1. 模块元信息（module.conf）

每个模块必须有 `module.conf` 描述自己：

```ini
# modules/singbox/module.conf
[module]
name = "singbox"
version = "1.0.0"
description = "Sing-box 直连节点部署"
author = "22"

[requirements]
weight = "light"              # light/medium/heavy
min_memory = 32               # MB
min_disk = 50                 # MB
dependencies = ["core"]       # 依赖的其他模块
commands = ["sing-box"]       # 需要的命令

[capabilities]
provides = ["direct-node"]    # 提供的能力
conflicts = []                # 冲突的模块

[interface]
init = "deploy.sh init"       # 初始化命令
start = "service.sh start"    # 启动命令
stop = "service.sh stop"      # 停止命令
status = "service.sh status"  # 状态检查
```

### 2. 运行配置（profile.yaml）

定义当前机器启用哪些模块：

```yaml
# config/profile.yaml
version: "1.0"

# 机器信息（自动检测或手动设置）
machine:
  memory: 64        # MB
  disk: 2048        # MB
  cpu_cores: 1
  profile: "minimal"  # minimal/standard/full/custom

# 启用的模块
modules:
  enabled:
    - core          # 必需
    - singbox       # 轻量
  disabled:
    - argo          # 资源不足
    - relay         # 资源不足
    - stats         # 不需要
    - webui         # 不需要

# 自动管理（可选）
auto_manage:
  enabled: true
  # 根据资源自动启用/禁用模块
  adaptive: true
  # 资源不足时的策略
  on_low_resource: "disable_heavy"  # disable_heavy/warn/ignore
```

### 3. 节点配置（nodes.yaml）

统一的节点数据源：

```yaml
# config/nodes.yaml
version: "1.0"

# 节点列表
nodes:
  - id: "node-001"
    name: "香港-直连"
    type: "vless"
    module: "singbox"      # 由哪个模块管理
    server: "hk1.example.com"
    port: 443
    uuid: "xxx-xxx-xxx"
    tls: true
    status: "active"       # active/inactive/error
    created_at: "2026-02-28T20:00:00Z"
    updated_at: "2026-02-28T20:00:00Z"
    
  - id: "node-002"
    name: "美国-Argo"
    type: "argo"
    module: "argo"
    tunnel_id: "xxx"
    token: "xxx"
    status: "inactive"     # 模块未启用
    
  - id: "node-003"
    name: "中转-日本"
    type: "relay"
    module: "relay"
    upstream: "https://xxx/sub"
    local_port: 10443
    status: "inactive"     # 模块未启用

# 全局配置
global:
  auto_sync: true          # 自动同步节点状态
  sync_interval: 300       # 同步间隔（秒）
```

---

## 💻 核心调度器（manager.sh）

```bash
#!/bin/bash
# manager.sh - 核心调度器

set -e

# 全局变量
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="$SCRIPT_DIR/config"
MODULES_DIR="$SCRIPT_DIR/modules"
LIB_DIR="$SCRIPT_DIR/lib"

# 加载公共库
source "$LIB_DIR/common.sh"
source "$LIB_DIR/yaml.sh"
source "$LIB_DIR/module.sh"
source "$LIB_DIR/resource.sh"

# 初始化
init() {
    # 检测系统资源
    detect_resources
    
    # 加载配置
    load_profile
    
    # 发现并注册模块
    discover_modules
    
    # 检查依赖
    check_dependencies
}

# 命令路由
route_command() {
    local cmd="$1"
    shift
    
    case "$cmd" in
        # 模块管理
        module)
            module_command "$@"
            ;;
        
        # 节点管理
        node)
            node_command "$@"
            ;;
        
        # 配置管理
        profile)
            profile_command "$@"
            ;;
        
        # 直接调用模块
        *)
            # 查找模块是否有这个命令
            local module=$(find_module_by_command "$cmd")
            if [[ -n "$module" ]]; then
                run_module "$module" "$cmd" "$@"
            else
                error "Unknown command: $cmd"
                show_help
                exit 1
            fi
            ;;
    esac
}

# 主函数
main() {
    init
    route_command "$@"
}

# 运行
main "$@"
```

**关键：核心只做调度和资源管理，不做业务逻辑！**

---

## 🔌 模块接口标准

### 模块必须实现的接口

```bash
#!/bin/bash
# modules/singbox/deploy.sh

# 1. 模块信息（从 module.conf 读取）
MODULE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$MODULE_DIR/module.conf"

# 2. 必需函数
module_init() {
    # 初始化：检查依赖、创建目录等
    check_command "sing-box" || return 1
    mkdir -p /etc/sing-box
    return 0
}

module_start() {
    # 启动：读取 nodes.yaml，生成配置，启动服务
    local nodes=$(read_nodes_by_module "singbox")
    generate_config "$nodes"
    systemctl start sing-box
    update_nodes_status "singbox" "active"
}

module_stop() {
    # 停止：停止服务，更新状态
    systemctl stop sing-box
    update_nodes_status "singbox" "inactive"
}

module_status() {
    # 状态：检查服务状态
    systemctl is-active sing-box
}

module_cleanup() {
    # 清理：卸载时调用
    systemctl stop sing-box
    rm -rf /etc/sing-box
}

# 3. 业务函数（可选）
deploy_node() {
    local node_id="$1"
    # 部署单个节点
    # ...
}

# 4. 命令路由（如果模块支持子命令）
case "$1" in
    init)    module_init ;;
    start)   module_start ;;
    stop)    module_stop ;;
    status)  module_status ;;
    cleanup) module_cleanup ;;
    deploy)  deploy_node "$2" ;;
    *)       echo "Usage: $0 {init|start|stop|status|cleanup|deploy}" ;;
esac
```

---

## 🎛️ 资源自适应

### 自动检测与推荐

```bash
# lib/resource.sh

detect_resources() {
    local mem=$(free -m | awk '/^Mem:/{print $2}')
    local disk=$(df -m / | awk 'NR==2{print $4}')
    local cpu=$(nproc)
    
    # 保存到配置
    yq eval -i ".machine.memory = $mem" config/profile.yaml
    yq eval -i ".machine.disk = $disk" config/profile.yaml
    yq eval -i ".machine.cpu_cores = $cpu" config/profile.yaml
    
    # 推荐配置
    if [[ $mem -lt 128 ]]; then
        echo "minimal"
    elif [[ $mem -lt 512 ]]; then
        echo "standard"
    else
        echo "full"
    fi
}

recommend_modules() {
    local profile="$1"
    
    case "$profile" in
        minimal)
            echo "core singbox"
            ;;
        standard)
            echo "core singbox argo"
            ;;
        full)
            echo "core singbox argo relay stats webui"
            ;;
    esac
}

check_module_requirements() {
    local module="$1"
    local mem_required=$(read_module_conf "$module" "requirements.min_memory")
    local mem_available=$(yq eval '.machine.memory' config/profile.yaml)
    
    if [[ $mem_available -lt $mem_required ]]; then
        return 1
    fi
    return 0
}
```

---

## 📦 预设配置

### minimal.yaml（64M 小鸡）

```yaml
# profiles/minimal.yaml
version: "1.0"

machine:
  profile: "minimal"

modules:
  enabled:
    - core
    - singbox
  disabled:
    - argo
    - relay
    - stats
    - webui

auto_manage:
  enabled: true
  adaptive: true
  on_low_resource: "disable_heavy"
```

### standard.yaml（256M 机器）

```yaml
# profiles/standard.yaml
version: "1.0"

machine:
  profile: "standard"

modules:
  enabled:
    - core
    - singbox
    - argo
  disabled:
    - relay
    - stats
    - webui

auto_manage:
  enabled: true
  adaptive: true
```

### full.yaml（512M+ 机器）

```yaml
# profiles/full.yaml
version: "1.0"

machine:
  profile: "full"

modules:
  enabled:
    - core
    - singbox
    - argo
    - relay
    - stats
    - webui

auto_manage:
  enabled: false
```

---

## 🚀 使用场景

### 场景 1：64M 小鸡（最小配置）

```bash
# 1. 初始化（自动检测资源）
./manager.sh init

# 输出：
# 检测到内存: 64MB
# 推荐配置: minimal
# 已启用模块: core, singbox
# 已禁用模块: argo, relay, stats, webui（资源不足）

# 2. 部署 Sing-box 直连节点
./manager.sh node add --name "香港-01" --type vless --server hk1.example.com

# 3. 启动服务
./manager.sh start

# 4. 查看状态
./manager.sh status
# 输出：
# ✓ core: active
# ✓ singbox: active (1 node)
# ✗ argo: disabled (insufficient memory)
# ✗ relay: disabled (insufficient memory)
```

### 场景 2：256M 机器（标准配置）

```bash
# 1. 初始化
./manager.sh init
# 推荐配置: standard
# 已启用模块: core, singbox, argo

# 2. 部署 Sing-box + Argo
./manager.sh node add --name "香港-01" --type vless --server hk1.example.com
./manager.sh argo create my-tunnel

# 3. 启动
./manager.sh start

# 4. 状态
./manager.sh status
# ✓ core: active
# ✓ singbox: active (1 node)
# ✓ argo: active (1 tunnel)
# ✗ relay: disabled (not needed)
```

### 场景 3：512M+ 机器（完整配置）

```bash
# 1. 初始化
./manager.sh init
# 推荐配置: full
# 已启用模块: core, singbox, argo, relay, stats, webui

# 2. 部署所有功能
./manager.sh node add --name "香港-01" --type vless --server hk1.example.com
./manager.sh argo create my-tunnel
./manager.sh relay import https://example.com/sub

# 3. 启动（包括 Web UI）
./manager.sh start

# 4. 访问 Web UI
# http://your-server:8080

# 5. 查看统计
./manager.sh stats traffic
```

---

## 🔄 模块通信

### 通过 nodes.yaml（数据驱动）

```bash
# Sing-box 模块写入节点
yq eval -i '.nodes += [{
    "id": "node-001",
    "name": "香港-01",
    "type": "vless",
    "module": "singbox",
    "status": "active"
}]' config/nodes.yaml

# Argo 模块读取所有节点
yq eval '.nodes[] | select(.module == "argo")' config/nodes.yaml

# Relay 模块更新节点状态
yq eval -i '.nodes[] |= (select(.id == "node-003") | .status = "active")' \
    config/nodes.yaml
```

### 通过事件（可选，高级）

```bash
# lib/events.sh
emit_event() {
    local event="$1"
    local data="$2"
    echo "$(date +%s)|$event|$data" >> /var/log/manager/events.log
}

# Sing-box 模块发出事件
emit_event "node.created" "node-001"

# Stats 模块监听事件
listen_event "node.created" update_stats
```

---

## 📊 优势总结

### 对比传统脚本

| 特性 | 传统脚本 | 模块化架构 |
|------|---------|-----------|
| 资源适配 | 手动裁剪 | 自动检测 |
| 功能扩展 | 修改主脚本 | 添加模块 |
| 配置管理 | 混在代码里 | 独立配置文件 |
| 模块通信 | 函数调用 | 数据驱动 |
| 部署灵活性 | 一刀切 | 按需组合 |
| 维护成本 | 高 | 低 |

### 核心优势

1. **资源自适应**
   - 64M 小鸡：只跑 Sing-box
   - 256M 机器：Sing-box + Argo
   - 512M+ 机器：全功能

2. **完全解耦**
   - 模块通过 YAML 通信
   - 不互相调用
   - 独立开发、测试、部署

3. **灵活组合**
   - 按需启用模块
   - 预设配置快速部署
   - 自定义配置精细控制

4. **易于扩展**
   - 新功能 = 新模块
   - 核心永远简单
   - 模块可独立分发

---

## 🎯 实施计划

### Phase 1: 核心框架（2-3 天）
- [ ] 核心调度器（manager.sh）
- [ ] 公共库（common.sh, yaml.sh, module.sh, resource.sh）
- [ ] 模块发现与注册机制
- [ ] 资源检测与推荐
- [ ] 配置管理（profile.yaml, nodes.yaml）

### Phase 2: 基础模块（2-3 天）
- [ ] core 模块（必需）
- [ ] singbox 模块（轻量）
- [ ] 预设配置（minimal/standard/full）

### Phase 3: 扩展模块（按需）
- [ ] argo 模块（中等）
- [ ] relay 模块（重量）
- [ ] stats 模块（可选）
- [ ] webui 模块（可选）

### Phase 4: 测试与优化（1-2 天）
- [ ] 64M 小鸡测试
- [ ] 256M 机器测试
- [ ] 512M+ 机器测试
- [ ] 文档完善

---

## 📝 下一步

要不要我先搭建一个**最小可用原型**（MVP）？

包括：
- 核心调度器
- 资源检测
- singbox 模块
- minimal 配置

在你的 64M 小鸡上测试，验证架构可行性？🌸

---

**状态：** 设计完成，待实施  
**预计开发时间：** 1-2 周  
**GitHub：** https://github.com/lemmomay/22-claw/tree/master/singbox-manager
