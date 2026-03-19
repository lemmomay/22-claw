# Sing-box 模块化脚本 - 核心流程与职责划分

> 设计日期：2026-03-01  
> 核心理念：**职责清晰、流程简单**

---

## 🎯 核心理解

### 你的关键点（完全正确）

1. **singbox 脚本负责全面管理 singbox**
   - 维护 singbox 服务
   - 生成 singbox 配置文件（JSON）
   - 根据 nodes.yaml 生成可用的节点配置

2. **nodes.yaml 是中间层**
   - 方便用户查看和编辑
   - 方便其他模块读取和写入
   - 统一的数据格式

3. **真正的节点配置是 singbox JSON**
   - singbox 脚本读取 nodes.yaml
   - 转换成 singbox 需要的 JSON 格式
   - 写入 `/etc/sing-box/config.json`

4. **其他模块的职责**
   - 实现自己的核心功能（创建隧道、导入订阅等）
   - 把生成的节点信息写入 nodes.yaml
   - 调用 singbox 脚本重新生成配置

---

## 🔄 完整数据流

```
┌─────────────────────────────────────────────────────────┐
│  用户/模块操作                                           │
│  - 部署直连节点                                          │
│  - 创建 Argo 隧道                                        │
│  - 导入中转订阅                                          │
└─────────────────────────────────────────────────────────┘
                         ↓ 写入
┌─────────────────────────────────────────────────────────┐
│  nodes.yaml (中间层)                                     │
│  - 统一格式                                              │
│  - 人类可读                                              │
│  - 模块间通信                                            │
│                                                          │
│  nodes:                                                  │
│    - id: node-001                                        │
│      name: "香港-01"                                     │
│      type: vless                                         │
│      server: hk1.example.com                             │
│      port: 443                                           │
│      uuid: xxx-xxx-xxx                                   │
│      ...                                                 │
└─────────────────────────────────────────────────────────┘
                         ↓ 读取并转换
┌─────────────────────────────────────────────────────────┐
│  singbox 脚本 (核心引擎)                                 │
│  - 读取 nodes.yaml                                       │
│  - 转换为 singbox JSON 格式                              │
│  - 生成完整配置                                          │
└─────────────────────────────────────────────────────────┘
                         ↓ 写入
┌─────────────────────────────────────────────────────────┐
│  /etc/sing-box/config.json (真正的配置)                  │
│  {                                                       │
│    "inbounds": [...],                                    │
│    "outbounds": [...],                                   │
│    "route": {...}                                        │
│  }                                                       │
└─────────────────────────────────────────────────────────┘
                         ↓ 加载
┌─────────────────────────────────────────────────────────┐
│  sing-box 服务                                           │
│  - 运行节点                                              │
│  - 提供代理服务                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 📦 核心模块职责

### 1. singbox 脚本（核心引擎）

**职责：**
- ✅ 管理 sing-box 服务（启动/停止/重启）
- ✅ 读取 nodes.yaml
- ✅ 转换为 sing-box JSON 配置
- ✅ 写入配置文件
- ✅ 重载服务

**不负责：**
- ❌ 创建节点（由其他模块负责）
- ❌ 直接操作 nodes.yaml（通过 node_api）

**核心函数：**
```bash
# 生成配置
singbox_generate_config() {
    # 1. 读取 nodes.yaml 中所有节点
    local all_nodes=$(yq eval '.nodes[]' nodes.yaml)
    
    # 2. 转换为 sing-box JSON
    local config=$(convert_to_singbox_json "$all_nodes")
    
    # 3. 写入配置文件
    echo "$config" > /etc/sing-box/config.json
}

# 重载服务
singbox_reload() {
    singbox_generate_config
    systemctl reload sing-box
}
```

---

### 2. nodes.yaml（数据中心）

**职责：**
- ✅ 存储所有节点信息
- ✅ 提供统一的数据格式
- ✅ 方便用户查看和编辑
- ✅ 模块间通信的桥梁

**格式：**
```yaml
nodes:
  # 每个节点包含：
  - id: "唯一标识"
    name: "显示名称"
    type: "节点类型（vless/vmess/trojan）"
    module: "管理模块（singbox/argo/relay）"
    server: "服务器地址"
    port: 端口
    uuid: "UUID"
    # ... 其他配置
```

---

### 3. 其他模块（功能实现）

#### 3.1 singbox 部署模块

**职责：**
- ✅ 部署直连节点
- ✅ 生成 UUID
- ✅ 写入 nodes.yaml
- ✅ 调用 singbox 脚本重载

**流程：**
```bash
deploy_node() {
    # 1. 生成节点信息
    local node_data="
    name: 香港-01
    type: vless
    server: hk1.example.com
    port: 443
    uuid: $(uuidgen)
    module: singbox
    "
    
    # 2. 写入 nodes.yaml（通过 node_api）
    node_id=$(node_add "$node_data")
    
    # 3. 调用 singbox 脚本重载
    singbox_reload
    
    # 4. 生成分享链接
    link=$(node_get_link "$node_id")
    
    echo "部署成功！链接: $link"
}
```

#### 3.2 argo 模块

**职责：**
- ✅ 创建 Cloudflare 隧道
- ✅ 获取隧道域名和 token
- ✅ 写入 nodes.yaml
- ✅ 启动 cloudflared
- ✅ 调用 singbox 脚本重载

**流程：**
```bash
create_tunnel() {
    # 1. 创建 Cloudflare 隧道
    tunnel_id=$(cloudflared tunnel create my-tunnel)
    tunnel_domain="${tunnel_id}.cfargotunnel.com"
    
    # 2. 生成节点信息
    local node_data="
    name: 美国-Argo
    type: vless
    server: $tunnel_domain
    port: 443
    uuid: $(uuidgen)
    module: argo
    tunnel_id: $tunnel_id
    "
    
    # 3. 写入 nodes.yaml
    node_id=$(node_add "$node_data")
    
    # 4. 启动 cloudflared
    cloudflared tunnel run $tunnel_id &
    
    # 5. 调用 singbox 脚本重载
    singbox_reload
    
    # 6. 生成分享链接
    link=$(node_get_link "$node_id")
    
    echo "隧道创建成功！链接: $link"
}
```

#### 3.3 relay 模块

**职责：**
- ✅ 导入第三方订阅
- ✅ 解析节点信息
- ✅ 分配本地端口
- ✅ 启动端口转发
- ✅ 写入 nodes.yaml
- ✅ 调用 singbox 脚本重载

**流程：**
```bash
import_subscription() {
    # 1. 下载订阅
    sub_content=$(curl -s "$sub_url" | base64 -d)
    
    # 2. 解析节点
    echo "$sub_content" | yq eval '.proxies[]' - | while read proxy; do
        # 3. 分配本地端口
        local_port=$(find_free_port)
        
        # 4. 生成节点信息
        local node_data="
        name: 日本-中转
        type: vless
        server: 127.0.0.1
        port: $local_port
        uuid: $(uuidgen)
        module: relay
        upstream_server: jp1.example.com
        upstream_port: 443
        "
        
        # 5. 写入 nodes.yaml
        node_id=$(node_add "$node_data")
        
        # 6. 启动端口转发
        socat TCP-LISTEN:$local_port,fork TCP:jp1.example.com:443 &
    done
    
    # 7. 调用 singbox 脚本重载
    singbox_reload
}
```

---

## 🔧 技术栈

### 必需工具

| 工具 | 用途 | 安装 |
|------|------|------|
| **bash** | 脚本语言 | 系统自带 |
| **yq** | YAML 处理 | `wget https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64 -O /usr/local/bin/yq && chmod +x /usr/local/bin/yq` |
| **jq** | JSON 处理 | `apk add jq` (Alpine) / `apt install jq` (Debian) |
| **curl** | 网络请求 | 系统自带 |
| **sing-box** | 代理服务 | 见官方文档 |

### 可选工具（按模块）

| 模块 | 工具 | 用途 |
|------|------|------|
| **argo** | cloudflared | Cloudflare 隧道 |
| **relay** | socat 或 gost | 端口转发 |
| **stats** | iftop | 流量监控 |

---

## 📝 配置转换示例

### nodes.yaml → sing-box JSON

**输入（nodes.yaml）：**
```yaml
nodes:
  - id: node-001
    name: "香港-01"
    type: vless
    server: hk1.example.com
    port: 443
    uuid: "xxx-xxx-xxx"
    tls: true
    module: singbox
    
  - id: node-002
    name: "美国-Argo"
    type: vless
    server: "abc123.cfargotunnel.com"
    port: 443
    uuid: "yyy-yyy-yyy"
    tls: true
    module: argo
```

**输出（sing-box config.json）：**
```json
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
        {
          "name": "香港-01",
          "uuid": "xxx-xxx-xxx",
          "flow": ""
        },
        {
          "name": "美国-Argo",
          "uuid": "yyy-yyy-yyy",
          "flow": ""
        }
      ],
      "tls": {
        "enabled": true,
        "server_name": "hk1.example.com",
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
```

**转换逻辑（伪代码）：**
```bash
convert_to_singbox_json() {
    local nodes="$1"
    
    # 1. 提取所有用户
    local users=$(echo "$nodes" | yq eval -o=json '[.[] | {
        name: .name,
        uuid: .uuid,
        flow: ""
    }]' -)
    
    # 2. 生成完整配置
    jq -n \
        --argjson users "$users" \
        '{
            log: {level: "info"},
            inbounds: [{
                type: "vless",
                tag: "vless-in",
                listen: "::",
                listen_port: 443,
                users: $users,
                tls: {
                    enabled: true,
                    server_name: "example.com",
                    certificate_path: "/etc/ssl/cert.pem",
                    key_path: "/etc/ssl/key.pem"
                }
            }],
            outbounds: [{
                type: "direct",
                tag: "direct"
            }]
        }'
}
```

---

## 🎯 关键设计点

### 1. 职责分离

```
┌─────────────────────────────────────┐
│  其他模块                            │
│  - 实现自己的功能                    │
│  - 写入 nodes.yaml                   │
│  - 调用 singbox 脚本                 │
└─────────────────────────────────────┘
                ↓
┌─────────────────────────────────────┐
│  singbox 脚本                        │
│  - 读取 nodes.yaml                   │
│  - 转换为 JSON                       │
│  - 管理服务                          │
└─────────────────────────────────────┘
```

**好处：**
- 模块不需要了解 sing-box 配置格式
- sing-box 配置变化不影响模块
- 职责清晰，易于维护

---

### 2. 统一接口

所有模块通过 `node_api.sh` 操作 nodes.yaml：

```bash
# 添加节点
node_add "$node_data"

# 获取节点
node_get "$node_id"

# 更新节点
node_update "$node_id" "status" "active"

# 生成链接
node_get_link "$node_id"
```

**好处：**
- 模块不直接操作 YAML
- 避免并发冲突
- 统一的错误处理

---

### 3. 自动重载

节点变化后自动重载 sing-box：

```bash
# 模块添加节点后
node_id=$(node_add "$node_data")

# 自动触发重载
singbox_reload  # 读取 nodes.yaml → 生成 JSON → 重载服务
```

**好处：**
- 用户无需手动重载
- 配置立即生效
- 减少操作步骤

---

## 🚀 实际使用流程

### 场景 1：部署直连节点

```bash
# 用户执行
./modules/singbox/deploy.sh deploy "香港-01" "hk1.example.com"

# 内部流程：
# 1. 生成 UUID
# 2. 构造节点数据
# 3. 调用 node_add() 写入 nodes.yaml
# 4. 调用 singbox_reload()
#    - 读取 nodes.yaml
#    - 转换为 sing-box JSON
#    - 写入 /etc/sing-box/config.json
#    - 重载 sing-box 服务
# 5. 生成分享链接
# 6. 输出给用户

# 输出：
# 节点部署成功！
# 分享链接: vless://xxx@hk1.example.com:443?...
```

### 场景 2：创建 Argo 隧道

```bash
# 用户执行
./modules/argo/tunnel.sh create "美国-Argo"

# 内部流程：
# 1. 调用 cloudflared 创建隧道
# 2. 获取隧道域名和 token
# 3. 构造节点数据
# 4. 调用 node_add() 写入 nodes.yaml
# 5. 启动 cloudflared 服务
# 6. 调用 singbox_reload()
#    - sing-box 会自动包含这个新节点
# 7. 生成分享链接
# 8. 输出给用户

# 输出：
# Argo 隧道创建成功！
# 隧道域名: abc123.cfargotunnel.com
# 分享链接: vless://yyy@abc123.cfargotunnel.com:443?...
```

---

## 💡 关键理解

### 你的理解完全正确！

1. **singbox 脚本是核心引擎**
   - 负责 sing-box 的一切
   - 读取 nodes.yaml
   - 生成真正的配置（JSON）

2. **nodes.yaml 是中间层**
   - 统一格式
   - 方便读写
   - 模块间通信

3. **其他模块围绕自己的功能**
   - 实现核心功能（创建隧道、导入订阅）
   - 把结果写入 nodes.yaml
   - 让 singbox 脚本生成配置

4. **所有节点最终都由 singbox 生成**
   - 不管是直连、Argo、还是中转
   - 都写入 nodes.yaml
   - 都由 singbox 脚本转换为 JSON
   - 都由 sing-box 服务运行

---

## 📋 下一步

现在方案已经很清晰了，你觉得：

1. **技术栈** - 这些工具够用吗？还需要其他的吗？
2. **配置转换** - sing-box 的配置格式需要回头看文档，这个没问题
3. **模块设计** - 这个职责划分合理吗？
4. **实现细节** - 还有什么需要考虑的吗？

我们可以继续细化设计，或者你有其他想法？🌸
