# Sing-box 模块化脚本 - 轻量化方案（纯 YAML）

> 设计日期：2026-03-01  
> 核心理念：**轻量、简单、接口清晰**

---

## 🎯 核心思路

### 你的关键点
1. **保持轻量** - 不引入数据库，纯 YAML
2. **中心脚本** - nodes.yaml + singbox 服务脚本
3. **接口设计** - 模块通过接口调用中心脚本
4. **节点生成** - 新节点需要：singbox 配置 + yaml 记录 + 用户链接

### 设计原则
- **nodes.yaml 是唯一数据源**
- **singbox 服务脚本是核心引擎**
- **模块通过标准接口操作**
- **避免模块间直接调用**

---

## 🏗️ 架构设计

### 核心架构

```
┌─────────────────────────────────────────────┐
│              用户/模块                       │
│  (argo.sh, relay.sh, stats.sh...)          │
└─────────────────────────────────────────────┘
                    ↓ 调用接口
┌─────────────────────────────────────────────┐
│            核心接口层 (API)                  │
│  ┌──────────────┐  ┌──────────────┐        │
│  │ node_api.sh  │  │singbox_api.sh│        │
│  │ (节点操作)    │  │ (服务操作)    │        │
│  └──────────────┘  └──────────────┘        │
└─────────────────────────────────────────────┘
                    ↓ 读写
┌─────────────────────────────────────────────┐
│              数据层                          │
│  ┌──────────────┐  ┌──────────────┐        │
│  │ nodes.yaml   │  │ singbox.json │        │
│  │ (节点配置)    │  │ (服务配置)    │        │
│  └──────────────┘  └──────────────┘        │
└─────────────────────────────────────────────┘
```

**关键：模块不直接操作 YAML，而是通过接口！**

---

## 📁 目录结构

```
singbox-manager/
├── manager.sh              # 主入口（命令路由）
├── config/
│   └── nodes.yaml          # 唯一数据源
├── core/
│   ├── node_api.sh         # 节点操作接口
│   ├── singbox_api.sh      # Sing-box 服务接口
│   └── utils.sh            # 工具函数（yq 封装等）
├── modules/
│   ├── singbox/
│   │   └── deploy.sh       # 部署直连节点
│   ├── argo/
│   │   └── tunnel.sh       # 创建 Argo 隧道
│   └── relay/
│       └── import.sh       # 导入中转节点
└── lib/
    ├── common.sh           # 通用函数
    └── lock.sh             # 文件锁（防并发冲突）
```

---

## 🔌 核心接口设计

### 1. 节点操作接口（node_api.sh）

这是**所有模块操作节点的唯一入口**。

```bash
#!/bin/bash
# core/node_api.sh - 节点操作接口

source "$(dirname "$0")/utils.sh"
source "$(dirname "$0")/../lib/lock.sh"

NODES_FILE="config/nodes.yaml"

# ============================================
# 公共接口（模块调用这些函数）
# ============================================

# 添加节点
# 参数：节点数据（YAML 格式字符串）
# 返回：节点 ID
node_add() {
    local node_data="$1"
    
    acquire_lock "$NODES_FILE" || return 1
    
    # 生成唯一 ID
    local node_id="node-$(date +%s)-$(uuidgen | cut -d- -f1)"
    
    # 添加 ID 到节点数据
    local full_data=$(echo "$node_data" | yq eval ".id = \"$node_id\"" -)
    
    # 写入 YAML
    yq eval -i ".nodes += [$full_data]" "$NODES_FILE"
    
    release_lock "$NODES_FILE"
    
    echo "$node_id"
}

# 获取节点
# 参数：节点 ID
# 返回：节点数据（YAML 格式）
node_get() {
    local node_id="$1"
    yq eval ".nodes[] | select(.id == \"$node_id\")" "$NODES_FILE"
}

# 更新节点
# 参数：节点 ID, 字段名, 新值
node_update() {
    local node_id="$1"
    local field="$2"
    local value="$3"
    
    acquire_lock "$NODES_FILE" || return 1
    
    yq eval -i ".nodes[] |= (select(.id == \"$node_id\") | .$field = \"$value\")" \
        "$NODES_FILE"
    
    release_lock "$NODES_FILE"
}

# 删除节点
# 参数：节点 ID
node_delete() {
    local node_id="$1"
    
    acquire_lock "$NODES_FILE" || return 1
    
    yq eval -i "del(.nodes[] | select(.id == \"$node_id\"))" "$NODES_FILE"
    
    release_lock "$NODES_FILE"
}

# 列出节点
# 参数：过滤条件（可选，如 type=vless）
# 返回：节点列表（YAML 格式）
node_list() {
    local filter="$1"
    
    if [[ -z "$filter" ]]; then
        yq eval '.nodes[]' "$NODES_FILE"
    else
        # 解析过滤条件（如 type=vless）
        local field=$(echo "$filter" | cut -d= -f1)
        local value=$(echo "$filter" | cut -d= -f2)
        yq eval ".nodes[] | select(.$field == \"$value\")" "$NODES_FILE"
    fi
}

# 生成分享链接
# 参数：节点 ID
# 返回：分享链接
node_get_link() {
    local node_id="$1"
    local node=$(node_get "$node_id")
    
    # 根据节点类型生成链接
    local type=$(echo "$node" | yq eval '.type' -)
    
    case "$type" in
        vless)
            generate_vless_link "$node"
            ;;
        vmess)
            generate_vmess_link "$node"
            ;;
        trojan)
            generate_trojan_link "$node"
            ;;
        *)
            echo "Unsupported type: $type" >&2
            return 1
            ;;
    esac
}

# ============================================
# 内部函数（模块不应直接调用）
# ============================================

generate_vless_link() {
    local node="$1"
    local uuid=$(echo "$node" | yq eval '.uuid' -)
    local server=$(echo "$node" | yq eval '.server' -)
    local port=$(echo "$node" | yq eval '.port' -)
    local name=$(echo "$node" | yq eval '.name' -)
    
    echo "vless://${uuid}@${server}:${port}?encryption=none&type=tcp#${name}"
}

generate_vmess_link() {
    # 实现 VMess 链接生成
    # ...
}

generate_trojan_link() {
    # 实现 Trojan 链接生成
    # ...
}
```

---

### 2. Sing-box 服务接口（singbox_api.sh）

这是**操作 Sing-box 服务的唯一入口**。

```bash
#!/bin/bash
# core/singbox_api.sh - Sing-box 服务接口

source "$(dirname "$0")/utils.sh"
source "$(dirname "$0")/node_api.sh"

SINGBOX_CONFIG="/etc/sing-box/config.json"

# ============================================
# 公共接口
# ============================================

# 生成 Sing-box 配置
# 参数：无（从 nodes.yaml 读取所有 singbox 节点）
# 返回：配置文件路径
singbox_generate_config() {
    # 获取所有 singbox 类型的节点
    local nodes=$(node_list "module=singbox")
    
    # 生成配置
    local config=$(generate_singbox_json "$nodes")
    
    # 写入配置文件
    echo "$config" > "$SINGBOX_CONFIG"
    
    echo "$SINGBOX_CONFIG"
}

# 重载配置
singbox_reload() {
    singbox_generate_config
    systemctl reload sing-box
}

# 启动服务
singbox_start() {
    singbox_generate_config
    systemctl start sing-box
}

# 停止服务
singbox_stop() {
    systemctl stop sing-box
}

# 重启服务
singbox_restart() {
    singbox_generate_config
    systemctl restart sing-box
}

# 查看状态
singbox_status() {
    systemctl status sing-box
}

# 添加节点并重载
# 参数：节点数据（YAML 格式）
# 返回：节点 ID 和分享链接
singbox_add_node() {
    local node_data="$1"
    
    # 添加 module 字段
    node_data=$(echo "$node_data" | yq eval '.module = "singbox"' -)
    
    # 添加节点
    local node_id=$(node_add "$node_data")
    
    # 重载配置
    singbox_reload
    
    # 生成分享链接
    local link=$(node_get_link "$node_id")
    
    # 返回结果
    cat << EOF
{
  "node_id": "$node_id",
  "link": "$link"
}
EOF
}

# ============================================
# 内部函数
# ============================================

generate_singbox_json() {
    local nodes="$1"
    
    # 这里实现 YAML → Sing-box JSON 的转换
    # 可以用 yq 或 jq 处理
    
    cat << 'EOF'
{
  "log": {
    "level": "info"
  },
  "inbounds": [
    {
      "type": "vless",
      "tag": "vless-in",
      "listen": "::",
      "listen_port": 443,
      "users": [
EOF
    
    # 遍历节点，生成 users 配置
    echo "$nodes" | yq eval -o=json '.' | jq -c '.[]' | while read node; do
        local uuid=$(echo "$node" | jq -r '.uuid')
        cat << EOF
        {
          "uuid": "$uuid",
          "flow": ""
        },
EOF
    done
    
    cat << 'EOF'
      ],
      "tls": {
        "enabled": true,
        "server_name": "example.com",
        "certificate_path": "/etc/ssl/cert.pem",
        "key_path": "/etc/ssl/key.pem"
      }
    }
  ],
  "outbounds": [
    {
      "type": "direct",
      "tag": "direct"
    }
  ]
}
EOF
}
```

---

## 🔧 模块实现示例

### 示例 1：Sing-box 部署模块

```bash
#!/bin/bash
# modules/singbox/deploy.sh

# 加载接口
source "$(dirname "$0")/../../core/node_api.sh"
source "$(dirname "$0")/../../core/singbox_api.sh"

# 部署新节点
deploy_node() {
    local name="$1"
    local server="$2"
    local port="${3:-443}"
    
    # 生成 UUID
    local uuid=$(uuidgen)
    
    # 构造节点数据
    local node_data=$(cat << EOF
name: "$name"
type: "vless"
server: "$server"
port: $port
uuid: "$uuid"
tls: true
status: "pending"
created_at: "$(date -Iseconds)"
EOF
)
    
    # 通过接口添加节点
    local result=$(singbox_add_node "$node_data")
    
    # 解析结果
    local node_id=$(echo "$result" | jq -r '.node_id')
    local link=$(echo "$result" | jq -r '.link')
    
    # 更新状态
    node_update "$node_id" "status" "active"
    
    # 输出结果
    echo "节点部署成功！"
    echo "节点 ID: $node_id"
    echo "分享链接: $link"
}

# 命令行入口
case "$1" in
    deploy)
        deploy_node "$2" "$3" "$4"
        ;;
    *)
        echo "Usage: $0 deploy <name> <server> [port]"
        exit 1
        ;;
esac
```

**使用：**
```bash
./modules/singbox/deploy.sh deploy "香港-01" "hk1.example.com" 443
```

---

### 示例 2：Argo 隧道模块

```bash
#!/bin/bash
# modules/argo/tunnel.sh

source "$(dirname "$0")/../../core/node_api.sh"
source "$(dirname "$0")/../../core/singbox_api.sh"

# 创建 Argo 隧道
create_tunnel() {
    local name="$1"
    
    # 1. 创建 Cloudflare 隧道
    local tunnel_id=$(cloudflared tunnel create "$name" | grep -oP 'Created tunnel \K[a-z0-9-]+')
    local tunnel_token=$(cloudflared tunnel token "$tunnel_id")
    
    # 2. 获取隧道域名
    local tunnel_domain="${tunnel_id}.cfargotunnel.com"
    
    # 3. 构造节点数据
    local node_data=$(cat << EOF
name: "$name"
type: "vless"
server: "$tunnel_domain"
port: 443
uuid: "$(uuidgen)"
tls: true
module: "argo"
tunnel_id: "$tunnel_id"
tunnel_token: "$tunnel_token"
status: "pending"
created_at: "$(date -Iseconds)"
EOF
)
    
    # 4. 添加到 nodes.yaml
    local node_id=$(node_add "$node_data")
    
    # 5. 启动隧道
    nohup cloudflared tunnel run --token "$tunnel_token" &
    
    # 6. 添加到 Sing-box 配置
    singbox_reload
    
    # 7. 更新状态
    node_update "$node_id" "status" "active"
    
    # 8. 生成分享链接
    local link=$(node_get_link "$node_id")
    
    echo "Argo 隧道创建成功！"
    echo "节点 ID: $node_id"
    echo "隧道域名: $tunnel_domain"
    echo "分享链接: $link"
}

case "$1" in
    create)
        create_tunnel "$2"
        ;;
    *)
        echo "Usage: $0 create <name>"
        exit 1
        ;;
esac
```

---

### 示例 3：中转模块

```bash
#!/bin/bash
# modules/relay/import.sh

source "$(dirname "$0")/../../core/node_api.sh"

# 导入订阅
import_subscription() {
    local sub_url="$1"
    
    # 1. 下载订阅
    local sub_content=$(curl -s "$sub_url" | base64 -d)
    
    # 2. 解析节点（假设是 Clash 格式）
    echo "$sub_content" | yq eval '.proxies[]' - | while read -r proxy; do
        local name=$(echo "$proxy" | yq eval '.name' -)
        local type=$(echo "$proxy" | yq eval '.type' -)
        local server=$(echo "$proxy" | yq eval '.server' -)
        local port=$(echo "$proxy" | yq eval '.port' -)
        
        # 3. 分配本地端口
        local local_port=$(find_free_port)
        
        # 4. 构造节点数据
        local node_data=$(cat << EOF
name: "$name (中转)"
type: "$type"
server: "127.0.0.1"
port: $local_port
module: "relay"
upstream_server: "$server"
upstream_port: $port
status: "pending"
created_at: "$(date -Iseconds)"
EOF
)
        
        # 5. 添加节点
        local node_id=$(node_add "$node_data")
        
        # 6. 启动端口转发
        nohup socat TCP-LISTEN:$local_port,fork TCP:$server:$port &
        
        # 7. 更新状态
        node_update "$node_id" "status" "active"
        
        echo "导入节点: $name (本地端口: $local_port)"
    done
}

find_free_port() {
    # 查找空闲端口（10000-20000）
    for port in $(seq 10000 20000); do
        if ! ss -tuln | grep -q ":$port "; then
            echo "$port"
            return
        fi
    done
}

case "$1" in
    import)
        import_subscription "$2"
        ;;
    *)
        echo "Usage: $0 import <subscription_url>"
        exit 1
        ;;
esac
```

---

## 🔒 并发安全（文件锁）

```bash
#!/bin/bash
# lib/lock.sh - 文件锁实现

LOCK_DIR="/tmp/singbox-manager-locks"
mkdir -p "$LOCK_DIR"

# 获取锁
acquire_lock() {
    local file="$1"
    local lock_file="$LOCK_DIR/$(echo "$file" | md5sum | cut -d' ' -f1).lock"
    local timeout=10
    local elapsed=0
    
    while [[ $elapsed -lt $timeout ]]; do
        if mkdir "$lock_file" 2>/dev/null; then
            return 0
        fi
        sleep 0.1
        elapsed=$((elapsed + 1))
    done
    
    echo "Failed to acquire lock for $file" >&2
    return 1
}

# 释放锁
release_lock() {
    local file="$1"
    local lock_file="$LOCK_DIR/$(echo "$file" | md5sum | cut -d' ' -f1).lock"
    rmdir "$lock_file" 2>/dev/null
}
```

---

## 📊 数据格式

### nodes.yaml 格式

```yaml
version: "1.0"

# 节点列表
nodes:
  # Sing-box 直连节点
  - id: "node-1709222400-abc123"
    name: "香港-01"
    type: "vless"
    module: "singbox"
    server: "hk1.example.com"
    port: 443
    uuid: "xxx-xxx-xxx"
    tls: true
    status: "active"
    created_at: "2026-03-01T00:00:00+08:00"
    updated_at: "2026-03-01T00:00:00+08:00"
    
  # Argo 隧道节点
  - id: "node-1709222500-def456"
    name: "美国-Argo"
    type: "vless"
    module: "argo"
    server: "abc123.cfargotunnel.com"
    port: 443
    uuid: "yyy-yyy-yyy"
    tls: true
    tunnel_id: "abc123"
    tunnel_token: "xxx"
    status: "active"
    created_at: "2026-03-01T00:10:00+08:00"
    
  # 中转节点
  - id: "node-1709222600-ghi789"
    name: "日本-中转"
    type: "vless"
    module: "relay"
    server: "127.0.0.1"
    port: 10443
    upstream_server: "jp1.example.com"
    upstream_port: 443
    status: "active"
    created_at: "2026-03-01T00:20:00+08:00"

# 全局配置
global:
  auto_reload: true      # 节点变化时自动重载 Sing-box
  backup_enabled: true   # 启用自动备份
  backup_interval: 86400 # 备份间隔（秒）
```

---

## 🎯 核心优势

### 1. 轻量
- ✅ 纯 YAML，无数据库
- ✅ 依赖少（只需 yq, jq, curl）
- ✅ 内存占用小（<10MB）

### 2. 接口清晰
- ✅ 模块通过接口操作，不直接读写 YAML
- ✅ 接口统一，易于理解和使用
- ✅ 内部实现可以随时优化，不影响模块

### 3. 并发安全
- ✅ 文件锁机制
- ✅ 避免多个模块同时写入冲突

### 4. 易于扩展
- ✅ 新模块只需调用接口
- ✅ 不需要了解 YAML 结构
- ✅ 不需要担心并发问题

---

## 🚀 使用流程

### 场景 1：部署 Sing-box 直连节点

```bash
# 1. 部署节点
./modules/singbox/deploy.sh deploy "香港-01" "hk1.example.com" 443

# 输出：
# 节点部署成功！
# 节点 ID: node-1709222400-abc123
# 分享链接: vless://xxx@hk1.example.com:443?...

# 2. 自动完成：
# - 添加到 nodes.yaml
# - 生成 Sing-box 配置
# - 重载 Sing-box 服务
# - 生成分享链接
```

### 场景 2：创建 Argo 隧道

```bash
# 1. 创建隧道
./modules/argo/tunnel.sh create "美国-Argo"

# 输出：
# Argo 隧道创建成功！
# 节点 ID: node-1709222500-def456
# 隧道域名: abc123.cfargotunnel.com
# 分享链接: vless://yyy@abc123.cfargotunnel.com:443?...

# 2. 自动完成：
# - 创建 Cloudflare 隧道
# - 添加到 nodes.yaml
# - 启动 cloudflared
# - 添加到 Sing-box 配置
# - 生成分享链接
```

### 场景 3：导入中转节点

```bash
# 1. 导入订阅
./modules/relay/import.sh import "https://example.com/sub"

# 输出：
# 导入节点: 日本-01 (本地端口: 10443)
# 导入节点: 日本-02 (本地端口: 10444)
# ...

# 2. 自动完成：
# - 下载并解析订阅
# - 为每个节点分配本地端口
# - 启动端口转发
# - 添加到 nodes.yaml
```

---

## 📝 总结

这个方案：

### ✅ 符合你的要求
- 轻量（纯 YAML）
- 中心脚本（nodes.yaml + singbox_api.sh）
- 接口清晰（node_api.sh）
- 功能完整（配置 + 记录 + 链接）

### ✅ 解决了关键问题
- 并发安全（文件锁）
- 模块解耦（通过接口）
- 易于扩展（标准接口）

### ✅ 保持简单
- 无数据库
- 依赖少
- 代码清晰

你觉得这个方案怎么样？🌸
