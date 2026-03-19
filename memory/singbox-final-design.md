# Sing-box 模块化脚本 - 深度迭代优化方案

> 迭代日期：2026-03-01  
> 版本：v3.0（经过深度研究和多轮迭代）

---

## 🔍 研究发现

### 1. Sing-box 配置结构

通过查阅官方文档，sing-box 的配置结构：

```json
{
  "log": {},           // 日志配置
  "dns": {},           // DNS 配置
  "inbounds": [],      // 入站配置（服务器监听）
  "outbounds": [],     // 出站配置（客户端连接）
  "route": {}          // 路由规则
}
```

**关键发现：**
- inbounds 是服务器端配置（我们要部署的节点）
- outbounds 是客户端配置（连接到其他服务器）
- 支持多种协议：vless, vmess, trojan, hysteria2 等

---

## 🤔 深度思考后的问题

### 问题 1：配置复杂度被低估了

**初版假设：** 简单的 YAML → JSON 转换

**实际情况：**
```yaml
# nodes.yaml 中的简单配置
nodes:
  - name: "香港-01"
    type: vless
    server: hk1.example.com
    port: 443
    uuid: xxx
```

**需要转换为复杂的 sing-box 配置：**
```json
{
  "inbounds": [{
    "type": "vless",
    "tag": "vless-in",
    "listen": "::",
    "listen_port": 443,
    "users": [{
      "uuid": "xxx",
      "flow": ""
    }],
    "tls": {
      "enabled": true,
      "server_name": "hk1.example.com",
      "certificate_path": "/etc/ssl/cert.pem",
      "key_path": "/etc/ssl/key.pem"
    },
    "transport": {
      "type": "ws",
      "path": "/",
      "headers": {}
    }
  }]
}
```

**问题：**
- TLS 证书路径从哪来？
- WebSocket 路径怎么配置？
- 多个节点怎么处理？（多个 inbound 还是一个 inbound 多个 user？）

---

### 问题 2：节点类型的混淆

**初版混淆：** 把所有节点都当成 inbound

**实际情况：**
- **直连节点** = inbound（服务器监听，用户连接）
- **Argo 隧道** = inbound（通过 cloudflared 暴露）
- **中转节点** = outbound（连接到上游服务器）+ inbound（本地监听）

**正确理解：**
```
直连节点：
  用户 → sing-box inbound → 直接出站

Argo 隧道：
  用户 → Cloudflare → cloudflared → sing-box inbound → 出站

中转节点：
  用户 → sing-box inbound → sing-box outbound → 上游服务器
```

---

### 问题 3：配置模板的必要性

**初版假设：** 动态生成所有配置

**实际问题：**
- 配置项太多（TLS、传输层、路由规则）
- 用户可能需要自定义（WebSocket 路径、伪装域名）
- 每次都生成完整配置太复杂

**优化方案：** 使用配置模板

```
templates/
├── vless-tls-ws.json      # VLESS + TLS + WebSocket
├── vless-reality.json     # VLESS + Reality
├── vmess-ws.json          # VMess + WebSocket
└── trojan-ws.json         # Trojan + WebSocket
```

---

### 问题 4：证书管理被忽略了

**初版没考虑：** TLS 证书从哪来？

**实际需求：**
- 自签证书（测试用）
- Let's Encrypt（生产环境）
- 证书自动续期

**优化方案：** 新增证书管理模块

---

### 问题 5：端口冲突问题

**初版假设：** 所有节点用不同端口

**实际问题：**
- 多个节点监听同一端口会冲突
- 用户可能只有 443 端口可用

**优化方案：**
- 单端口多用户模式（推荐）
- 多端口模式（备选）

---

## 🏗️ 优化后的架构（v3.0）

### 核心改进

```
┌─────────────────────────────────────────────────────────┐
│  用户/模块                                               │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  核心接口层                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ node_api.sh  │  │singbox_api.sh│  │ cert_api.sh  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  配置层                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ nodes.yaml   │  │ templates/   │  │ certs/       │  │
│  │ (节点数据)    │  │ (配置模板)    │  │ (证书)        │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  生成层                                                  │
│  config.json = 模板 + nodes.yaml + 证书                  │
└─────────────────────────────────────────────────────────┘
```

---

## 📁 优化后的目录结构

```
singbox-manager/
├── manager.sh                # 主入口
├── config/
│   ├── nodes.yaml            # 节点数据
│   ├── manager.yaml          # 全局配置
│   └── generated/            # 生成的配置（不提交到 git）
│       └── config.json
├── templates/                # 配置模板（新增）
│   ├── base.json             # 基础配置
│   ├── inbound/              # 入站模板
│   │   ├── vless-tls-ws.json
│   │   ├── vless-reality.json
│   │   └── vmess-ws.json
│   └── outbound/             # 出站模板
│       └── direct.json
├── certs/                    # 证书管理（新增）
│   ├── self-signed/          # 自签证书
│   └── letsencrypt/          # Let's Encrypt
├── core/
│   ├── node_api.sh           # 节点操作接口
│   ├── singbox_api.sh        # Sing-box 服务接口
│   ├── cert_api.sh           # 证书管理接口（新增）
│   └── template_engine.sh    # 模板引擎（新增）
├── modules/
│   ├── singbox/
│   │   ├── deploy.sh         # 部署直连节点
│   │   └── cert.sh           # 证书管理（新增）
│   ├── argo/
│   │   └── tunnel.sh
│   └── relay/
│       └── import.sh
└── lib/
    ├── common.sh
    ├── lock.sh
    └── validator.sh          # 配置验证（新增）
```

---

## 🔧 核心组件重新设计

### 1. 配置模板系统（新增）

**为什么需要模板？**
- sing-box 配置太复杂
- 用户需要自定义
- 避免硬编码

**模板示例：**

```json
// templates/inbound/vless-tls-ws.json
{
  "type": "vless",
  "tag": "{{TAG}}",
  "listen": "::",
  "listen_port": {{PORT}},
  "users": {{USERS}},
  "tls": {
    "enabled": true,
    "server_name": "{{SERVER_NAME}}",
    "certificate_path": "{{CERT_PATH}}",
    "key_path": "{{KEY_PATH}}"
  },
  "transport": {
    "type": "ws",
    "path": "{{WS_PATH}}",
    "headers": {}
  }
}
```

**模板引擎：**

```bash
# core/template_engine.sh

render_template() {
    local template_file="$1"
    local vars_json="$2"  # JSON 格式的变量
    
    local content=$(cat "$template_file")
    
    # 替换变量
    echo "$vars_json" | jq -r 'to_entries[] | "\(.key)=\(.value)"' | while IFS='=' read key value; do
        content=$(echo "$content" | sed "s/{{$key}}/$value/g")
    done
    
    echo "$content"
}
```

---

### 2. 证书管理接口（新增）

```bash
# core/cert_api.sh

# 生成自签证书
cert_generate_self_signed() {
    local domain="$1"
    local cert_dir="certs/self-signed/$domain"
    
    mkdir -p "$cert_dir"
    
    openssl req -x509 -newkey rsa:4096 \
        -keyout "$cert_dir/key.pem" \
        -out "$cert_dir/cert.pem" \
        -days 365 -nodes \
        -subj "/CN=$domain"
    
    echo "$cert_dir"
}

# 申请 Let's Encrypt 证书
cert_request_letsencrypt() {
    local domain="$1"
    local email="$2"
    local cert_dir="certs/letsencrypt/$domain"
    
    mkdir -p "$cert_dir"
    
    # 使用 acme.sh 或 certbot
    acme.sh --issue -d "$domain" \
        --webroot /var/www/html \
        --cert-file "$cert_dir/cert.pem" \
        --key-file "$cert_dir/key.pem"
    
    echo "$cert_dir"
}

# 获取证书路径
cert_get_path() {
    local domain="$1"
    
    # 优先使用 Let's Encrypt
    if [[ -d "certs/letsencrypt/$domain" ]]; then
        echo "certs/letsencrypt/$domain"
    elif [[ -d "certs/self-signed/$domain" ]]; then
        echo "certs/self-signed/$domain"
    else
        # 自动生成自签证书
        cert_generate_self_signed "$domain"
    fi
}
```

---

### 3. 配置生成逻辑（重新设计）

```bash
# core/singbox_api.sh

singbox_generate_config() {
    # 1. 读取基础配置
    local base_config=$(cat templates/base.json)
    
    # 2. 读取所有节点
    local nodes=$(yq eval '.nodes[]' config/nodes.yaml)
    
    # 3. 按模式生成配置
    local mode=$(yq eval '.global.mode' config/manager.yaml)
    
    case "$mode" in
        "single-port")
            generate_single_port_config "$nodes"
            ;;
        "multi-port")
            generate_multi_port_config "$nodes"
            ;;
    esac
}

# 单端口多用户模式（推荐）
generate_single_port_config() {
    local nodes="$1"
    
    # 1. 提取所有用户
    local users=$(echo "$nodes" | yq eval -o=json '[.[] | {
        name: .name,
        uuid: .uuid,
        flow: ""
    }]' -)
    
    # 2. 获取证书路径
    local domain=$(echo "$nodes" | yq eval '.[0].server' -)
    local cert_dir=$(cert_get_path "$domain")
    
    # 3. 渲染模板
    local vars=$(jq -n \
        --arg tag "vless-in" \
        --arg port "443" \
        --argjson users "$users" \
        --arg server_name "$domain" \
        --arg cert_path "$cert_dir/cert.pem" \
        --arg key_path "$cert_dir/key.pem" \
        --arg ws_path "/" \
        '{
            TAG: $tag,
            PORT: $port,
            USERS: $users,
            SERVER_NAME: $server_name,
            CERT_PATH: $cert_path,
            KEY_PATH: $key_path,
            WS_PATH: $ws_path
        }')
    
    local inbound=$(render_template "templates/inbound/vless-tls-ws.json" "$vars")
    
    # 4. 组装完整配置
    jq -n \
        --argjson base "$(cat templates/base.json)" \
        --argjson inbound "$inbound" \
        '$base | .inbounds = [$inbound]' \
        > config/generated/config.json
}

# 多端口模式
generate_multi_port_config() {
    local nodes="$1"
    local inbounds="[]"
    
    # 为每个节点生成独立的 inbound
    echo "$nodes" | yq eval -o=json -I=0 '.[]' | while read node; do
        local name=$(echo "$node" | jq -r '.name')
        local port=$(echo "$node" | jq -r '.port')
        local uuid=$(echo "$node" | jq -r '.uuid')
        local server=$(echo "$node" | jq -r '.server')
        
        # 获取证书
        local cert_dir=$(cert_get_path "$server")
        
        # 渲染模板
        local vars=$(jq -n \
            --arg tag "vless-$port" \
            --arg port "$port" \
            --argjson users "[{\"name\":\"$name\",\"uuid\":\"$uuid\",\"flow\":\"\"}]" \
            --arg server_name "$server" \
            --arg cert_path "$cert_dir/cert.pem" \
            --arg key_path "$cert_dir/key.pem" \
            --arg ws_path "/" \
            '{
                TAG: $tag,
                PORT: $port,
                USERS: $users,
                SERVER_NAME: $server_name,
                CERT_PATH: $cert_path,
                KEY_PATH: $key_path,
                WS_PATH: $ws_path
            }')
        
        local inbound=$(render_template "templates/inbound/vless-tls-ws.json" "$vars")
        inbounds=$(echo "$inbounds" | jq ". += [$inbound]")
    done
    
    # 组装完整配置
    jq -n \
        --argjson base "$(cat templates/base.json)" \
        --argjson inbounds "$inbounds" \
        '$base | .inbounds = $inbounds' \
        > config/generated/config.json
}
```

---

### 4. 节点数据格式（优化）

```yaml
# config/nodes.yaml
version: "1.0"

# 全局配置
global:
  mode: "single-port"        # single-port | multi-port
  default_port: 443
  default_protocol: "vless"
  default_transport: "ws"
  auto_cert: true            # 自动管理证书

# 节点列表
nodes:
  # 直连节点
  - id: "node-001"
    name: "香港-01"
    type: "vless"
    module: "singbox"
    server: "hk1.example.com"
    port: 443                # 多端口模式时使用
    uuid: "xxx-xxx-xxx"
    
    # 可选配置
    transport: "ws"          # ws | grpc | http
    ws_path: "/"
    tls: true
    cert_type: "letsencrypt" # letsencrypt | self-signed
    
    status: "active"
    created_at: "2026-03-01T00:00:00+08:00"
    
  # Argo 隧道节点
  - id: "node-002"
    name: "美国-Argo"
    type: "vless"
    module: "argo"
    server: "abc123.cfargotunnel.com"
    port: 443
    uuid: "yyy-yyy-yyy"
    
    # Argo 特有配置
    tunnel_id: "abc123"
    tunnel_token: "xxx"
    
    status: "active"
    
  # 中转节点
  - id: "node-003"
    name: "日本-中转"
    type: "relay"
    module: "relay"
    
    # 本地监听
    listen_port: 10443
    
    # 上游服务器
    upstream:
      server: "jp1.example.com"
      port: 443
      protocol: "vless"
      uuid: "zzz-zzz-zzz"
    
    status: "active"
```

---

## 🎯 关键优化点总结

### 1. 配置模板系统
- ✅ 避免硬编码
- ✅ 支持自定义
- ✅ 易于维护

### 2. 证书管理
- ✅ 自动生成自签证书
- ✅ 支持 Let's Encrypt
- ✅ 自动续期

### 3. 单端口多用户
- ✅ 节省端口
- ✅ 易于管理
- ✅ 符合实际使用场景

### 4. 中转节点正确处理
- ✅ 区分 inbound 和 outbound
- ✅ 本地监听 + 上游连接
- ✅ 支持多种协议

### 5. 配置验证
- ✅ 节点数据验证
- ✅ 配置文件验证
- ✅ 证书有效性检查

---

## 🚀 实际使用流程（优化后）

### 场景 1：部署第一个节点

```bash
# 1. 部署节点（自动生成证书）
./modules/singbox/deploy.sh deploy "香港-01" "hk1.example.com"

# 内部流程：
# 1. 检查证书（不存在则生成自签证书）
# 2. 添加节点到 nodes.yaml
# 3. 使用模板生成 sing-box 配置
# 4. 重载服务
# 5. 生成分享链接

# 输出：
# ✓ 证书已生成: certs/self-signed/hk1.example.com
# ✓ 节点已添加: node-001
# ✓ 配置已生成: config/generated/config.json
# ✓ 服务已重载
# 
# 分享链接: vless://xxx@hk1.example.com:443?encryption=none&type=ws&path=/
```

### 场景 2：添加第二个节点（单端口模式）

```bash
# 2. 添加第二个节点
./modules/singbox/deploy.sh deploy "香港-02" "hk1.example.com"

# 内部流程：
# 1. 检测到同一域名，复用证书
# 2. 添加节点到 nodes.yaml
# 3. 重新生成配置（两个用户共享 443 端口）
# 4. 重载服务

# 输出：
# ✓ 证书已存在: certs/self-signed/hk1.example.com
# ✓ 节点已添加: node-002
# ✓ 配置已更新（2 个用户）
# ✓ 服务已重载
# 
# 分享链接: vless://yyy@hk1.example.com:443?encryption=none&type=ws&path=/
```

### 场景 3：申请正式证书

```bash
# 3. 申请 Let's Encrypt 证书
./modules/singbox/cert.sh request "hk1.example.com" "your@email.com"

# 内部流程：
# 1. 使用 acme.sh 申请证书
# 2. 保存到 certs/letsencrypt/
# 3. 重新生成配置（使用新证书）
# 4. 重载服务

# 输出：
# ✓ 证书申请成功
# ✓ 证书已保存: certs/letsencrypt/hk1.example.com
# ✓ 配置已更新
# ✓ 服务已重载
```

---

## 📊 对比：优化前 vs 优化后

| 方面 | 优化前 | 优化后 |
|------|--------|--------|
| 配置生成 | 硬编码 | 模板系统 |
| 证书管理 | 未考虑 | 自动管理 |
| 端口使用 | 每节点一个端口 | 单端口多用户 |
| 中转节点 | 混淆 inbound/outbound | 正确区分 |
| 配置验证 | 无 | 完整验证 |
| 可扩展性 | 一般 | 强 |
| 实际可用性 | 低 | 高 |

---

## 🤔 仍需考虑的问题

### 1. Reality 协议支持
- Reality 是新的伪装协议
- 不需要证书
- 需要额外的模板

### 2. 多协议支持
- 目前主要考虑 VLESS
- 需要支持 VMess, Trojan, Hysteria2
- 每种协议需要不同的模板

### 3. 路由规则
- 目前只考虑了 inbound/outbound
- 实际可能需要复杂的路由规则
- 需要路由配置模块

### 4. 性能监控
- 需要监控节点流量
- 需要监控连接数
- 需要性能统计

### 5. 备份和恢复
- 配置备份
- 证书备份
- 节点数据备份

---

## 📝 下一步建议

### MVP 阶段（1-2 周）
1. ✅ 实现核心接口（node_api, singbox_api, cert_api）
2. ✅ 实现模板引擎
3. ✅ 实现 VLESS + TLS + WebSocket 模板
4. ✅ 实现自签证书生成
5. ✅ 实现单端口多用户模式
6. ✅ 在 64M 小鸡上测试

### V1.0 阶段（2-3 周）
1. ✅ 支持 Let's Encrypt
2. ✅ 支持多端口模式
3. ✅ 实现 Argo 模块
4. ✅ 实现中转模块
5. ✅ 配置验证
6. ✅ 完整测试

### V1.1+ 阶段（按需）
1. Reality 协议支持
2. 多协议支持（VMess, Trojan）
3. 路由规则配置
4. 性能监控
5. Web UI

---

## 💡 总结

经过深度思考和迭代，主要改进：

1. **配置模板系统** - 解决配置复杂度问题
2. **证书管理** - 自动化证书生成和管理
3. **单端口多用户** - 符合实际使用场景
4. **正确区分节点类型** - inbound vs outbound
5. **配置验证** - 提高可靠性

这个方案更加**切实可行**，考虑了实际部署中会遇到的问题。

---

**你觉得这个优化方案怎么样？还有什么需要调整的吗？** 🌸
