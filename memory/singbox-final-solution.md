# Sing-box 模块化脚本 - 最终方案（基于实战项目分析）

> 分析日期：2026-03-01  
> 版本：v4.0（基于 fscarmen 和 singbox-lite 项目分析）

---

## 🔍 实战项目深度分析

### 项目 1：fscarmen/sing-box（专业级）

**优点：**
1. ✅ **配置管理规范** - 使用 JSON 分片配置（00_log.json, 01_outbounds.json...）
2. ✅ **服务管理完善** - systemd/OpenRC 双支持
3. ✅ **证书管理自动化** - 自签证书自动生成
4. ✅ **订阅系统完整** - nginx + 多客户端适配
5. ✅ **Argo 集成** - 临时/Json/Token 三种模式
6. ✅ **无交互安装** - 支持参数传递快速部署

**核心设计亮点：**
```bash
/etc/sing-box/
├── conf/                    # 配置分片（关键设计）
│   ├── 00_log.json
│   ├── 01_outbounds.json
│   ├── 02_endpoints.json
│   ├── 03_route.json
│   ├── 11_xtls-reality_inbounds.json
│   ├── 12_hysteria2_inbounds.json
│   └── ...
├── cert/                    # 证书目录
├── subscribe/               # 订阅文件
└── nginx.conf              # 订阅服务
```

**关键技术：**
- **配置合并** - sing-box 支持 `-C` 参数加载目录下所有 JSON
- **模块化配置** - 每个协议独立文件，易于管理
- **订阅生成** - 使用 nginx 提供订阅服务

---

### 项目 2：singbox-lite（AI 辅助构建）

**优点：**
1. ✅ **交互友好** - TUI 菜单清晰
2. ✅ **功能丰富** - 中转、第三方导入、Xray 双核心
3. ✅ **批量部署** - 支持批量创建节点
4. ✅ **端口转发** - 利用 sing-box 进行端口转发

**问题（典型的功能堆积）：**
- ❌ 脚本臃肿（多次重构仍然臃肿）
- ❌ 功能耦合（中转、导入、Xray 都在一个脚本）
- ❌ 难以维护（作者自己也承认"过于臃肿"）

---

## 💡 核心启发

### 1. 配置分片是关键

**fscarmen 的做法（值得学习）：**

```bash
# sing-box 支持加载目录下所有 JSON
sing-box run -C /etc/sing-box/conf/

# 配置文件按功能分片
00_log.json          # 日志
01_outbounds.json    # 出站
03_route.json        # 路由
11_*_inbounds.json   # 各协议入站
```

**好处：**
- 每个协议独立文件
- 添加/删除协议只需增删文件
- 不需要重新生成整个配置

**应用到我们的设计：**
```
config/
├── base/
│   ├── 00_log.json
│   ├── 01_outbounds.json
│   ├── 02_dns.json
│   └── 03_route.json
├── inbounds/
│   ├── vless-reality-{node-id}.json
│   ├── hysteria2-{node-id}.json
│   └── ...
└── nodes.yaml  # 节点元数据（我们的设计）
```

---

### 2. 服务管理要规范

**fscarmen 的做法：**
```bash
# systemd service
/etc/systemd/system/sing-box.service

# OpenRC (Alpine)
/etc/init.d/sing-box

# 统一的服务管理接口
systemctl start/stop/restart sing-box
```

**应用到我们的设计：**
- 核心脚本只负责生成配置
- 服务管理交给 systemd/OpenRC
- 不要自己实现守护进程

---

### 3. 证书管理要自动化

**fscarmen 的做法：**
```bash
# 自动生成自签证书
openssl req -x509 -newkey rsa:4096 \
    -keyout /etc/sing-box/cert/private.key \
    -out /etc/sing-box/cert/cert.pem \
    -days 365 -nodes \
    -subj "/CN=example.com"
```

**应用到我们的设计：**
- 首次部署自动生成自签证书
- 支持后续申请 Let's Encrypt
- 证书路径统一管理

---

### 4. 订阅系统可选

**fscarmen 的做法：**
- 使用 nginx 提供订阅服务
- 支持多种客户端格式
- 订阅地址：`http://ip:port/uuid/clash`

**应用到我们的设计：**
- 订阅系统作为可选模块
- 不强制安装 nginx
- 可以只输出节点链接

---

## 🏗️ 最终优化方案

### 核心架构（结合两个项目优点）

```
singbox-manager/
├── manager.sh              # 主入口（极简）
├── config/
│   ├── nodes.yaml          # 节点元数据（我们的核心）
│   ├── base/               # 基础配置（fscarmen 启发）
│   │   ├── 00_log.json
│   │   ├── 01_outbounds.json
│   │   ├── 02_dns.json
│   │   └── 03_route.json
│   └── inbounds/           # 入站配置（动态生成）
│       ├── vless-reality-node001.json
│       ├── hysteria2-node002.json
│       └── ...
├── core/
│   ├── node_api.sh         # 节点操作接口
│   ├── singbox_api.sh      # Sing-box 服务接口
│   ├── cert_api.sh         # 证书管理
│   └── config_generator.sh # 配置生成器（新增）
├── modules/
│   ├── singbox/
│   │   └── deploy.sh       # 部署直连节点
│   ├── argo/
│   │   └── tunnel.sh       # Argo 隧道
│   ├── relay/
│   │   └── import.sh       # 中转模块
│   └── subscribe/          # 订阅模块（可选）
│       └── nginx.sh
└── templates/              # 配置模板
    ├── base/               # 基础配置模板
    └── inbounds/           # 入站配置模板
        ├── vless-reality.json
        ├── hysteria2.json
        └── ...
```

---

## 🔧 核心组件重新设计

### 1. 配置生成器（借鉴 fscarmen）

```bash
# core/config_generator.sh

# 生成单个节点的 inbound 配置
generate_inbound_config() {
    local node_id="$1"
    
    # 1. 从 nodes.yaml 读取节点信息
    local node=$(yq eval ".nodes[] | select(.id == \"$node_id\")" config/nodes.yaml)
    
    # 2. 获取节点类型
    local type=$(echo "$node" | yq eval '.type' -)
    local protocol=$(echo "$node" | yq eval '.protocol' -)
    
    # 3. 选择模板
    local template="templates/inbounds/${protocol}.json"
    
    # 4. 渲染模板
    local config=$(render_template "$template" "$node")
    
    # 5. 写入配置文件
    echo "$config" > "config/inbounds/${protocol}-${node_id}.json"
}

# 重新生成所有配置
regenerate_all_configs() {
    # 1. 清空 inbounds 目录
    rm -f config/inbounds/*.json
    
    # 2. 遍历所有节点
    yq eval '.nodes[].id' config/nodes.yaml | while read node_id; do
        generate_inbound_config "$node_id"
    done
    
    # 3. 重载服务
    systemctl reload sing-box
}
```

**关键优势：**
- 每个节点一个配置文件
- 添加节点 = 生成一个新文件
- 删除节点 = 删除一个文件
- 不需要重新生成整个配置

---

### 2. Sing-box 服务接口（简化）

```bash
# core/singbox_api.sh

# 启动服务
singbox_start() {
    systemctl start sing-box
}

# 停止服务
singbox_stop() {
    systemctl stop sing-box
}

# 重载配置（不中断连接）
singbox_reload() {
    # 检查配置
    sing-box check -C config/
    
    # 重载
    systemctl reload sing-box
}

# 添加节点（完整流程）
singbox_add_node() {
    local node_data="$1"
    
    # 1. 添加到 nodes.yaml
    local node_id=$(node_add "$node_data")
    
    # 2. 生成 inbound 配置
    generate_inbound_config "$node_id"
    
    # 3. 重载服务
    singbox_reload
    
    # 4. 生成分享链接
    local link=$(node_get_link "$node_id")
    
    echo "$link"
}
```

---

### 3. 配置模板（借鉴 fscarmen）

```json
// templates/inbounds/vless-reality.json
{
  "type": "vless",
  "tag": "{{TAG}}",
  "listen": "::",
  "listen_port": {{PORT}},
  "users": [
    {
      "uuid": "{{UUID}}",
      "flow": "xtls-rprx-vision"
    }
  ],
  "tls": {
    "enabled": true,
    "server_name": "{{SNI}}",
    "reality": {
      "enabled": true,
      "handshake": {
        "server": "{{SNI}}",
        "server_port": 443
      },
      "private_key": "{{PRIVATE_KEY}}",
      "short_id": ["{{SHORT_ID}}"]
    }
  }
}
```

---

### 4. 节点数据格式（优化）

```yaml
# config/nodes.yaml
version: "1.0"

# 全局配置
global:
  cert_dir: "/etc/sing-box/cert"
  config_dir: "/etc/sing-box/config"

# 节点列表
nodes:
  - id: "node-001"
    name: "香港-Reality"
    protocol: "vless-reality"
    type: "direct"          # direct/argo/relay
    module: "singbox"
    
    # 监听配置
    listen:
      port: 443
      
    # 协议配置
    config:
      uuid: "xxx-xxx-xxx"
      sni: "www.apple.com"
      private_key: "xxx"
      short_id: "xxx"
      
    # 元数据
    status: "active"
    created_at: "2026-03-01T00:00:00+08:00"
    
  - id: "node-002"
    name: "美国-Argo"
    protocol: "vless-reality"
    type: "argo"
    module: "argo"
    
    # Argo 配置
    argo:
      domain: "abc.trycloudflare.com"
      tunnel_id: "xxx"
      
    # 监听配置
    listen:
      port: 8443
      
    # 协议配置
    config:
      uuid: "yyy-yyy-yyy"
      sni: "www.apple.com"
      
    status: "active"
```

---

## 🎯 关键改进点

### 1. 配置分片（借鉴 fscarmen）

**优势：**
- ✅ 每个节点独立配置文件
- ✅ 添加/删除节点不影响其他节点
- ✅ 配置清晰，易于调试

**实现：**
```bash
# sing-box 启动时加载整个目录
sing-box run -C /etc/sing-box/config/

# 目录结构
config/
├── base/
│   ├── 00_log.json
│   ├── 01_outbounds.json
│   └── 03_route.json
└── inbounds/
    ├── vless-reality-node001.json
    ├── hysteria2-node002.json
    └── ...
```

---

### 2. 服务管理规范（借鉴 fscarmen）

**systemd service：**
```ini
[Unit]
Description=sing-box service
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/sing-box run -C /etc/sing-box/config/
ExecReload=/bin/kill -HUP $MAINPID
Restart=on-failure
RestartSec=10s

[Install]
WantedBy=multi-user.target
```

**好处：**
- ✅ 标准的服务管理
- ✅ 支持 reload（不中断连接）
- ✅ 自动重启

---

### 3. 证书管理自动化

```bash
# core/cert_api.sh

# 初始化证书（首次部署）
cert_init() {
    local cert_dir="/etc/sing-box/cert"
    mkdir -p "$cert_dir"
    
    # 生成自签证书
    openssl req -x509 -newkey rsa:4096 \
        -keyout "$cert_dir/private.key" \
        -out "$cert_dir/cert.pem" \
        -days 365 -nodes \
        -subj "/CN=example.com"
    
    echo "$cert_dir"
}

# 获取证书路径（自动检测）
cert_get_path() {
    local domain="$1"
    local cert_dir="/etc/sing-box/cert"
    
    # 检查是否已有证书
    if [[ -f "$cert_dir/cert.pem" ]]; then
        echo "$cert_dir"
    else
        # 自动生成
        cert_init
    fi
}
```

---

### 4. 模块职责清晰

```
┌─────────────────────────────────────┐
│  模块（功能实现）                    │
│  - singbox: 部署直连节点             │
│  - argo: 创建隧道                    │
│  - relay: 中转配置                   │
│  - subscribe: 订阅服务（可选）       │
└─────────────────────────────────────┘
                ↓ 调用接口
┌─────────────────────────────────────┐
│  核心接口（API）                     │
│  - node_api: 节点操作                │
│  - singbox_api: 服务管理             │
│  - cert_api: 证书管理                │
│  - config_generator: 配置生成        │
└─────────────────────────────────────┘
                ↓ 操作
┌─────────────────────────────────────┐
│  数据层                              │
│  - nodes.yaml: 节点元数据            │
│  - config/: sing-box 配置            │
│  - cert/: 证书文件                   │
└─────────────────────────────────────┘
```

---

## 📊 对比：优化前 vs 最终方案

| 方面 | 初版设计 | 最终方案 |
|------|---------|---------|
| 配置管理 | 单一 JSON | 配置分片（fscarmen） |
| 节点添加 | 重新生成整个配置 | 只生成单个文件 |
| 服务管理 | 自己实现 | systemd/OpenRC |
| 证书管理 | 未考虑 | 自动化 |
| 订阅系统 | 未考虑 | 可选模块 |
| 可维护性 | 中等 | 高 |
| 实际可用性 | 中等 | 高 |

---

## 🚀 实际使用流程

### 场景 1：部署第一个节点

```bash
# 1. 安装脚本
bash <(curl -sSL https://raw.../install.sh)

# 2. 部署节点
./modules/singbox/deploy.sh deploy "香港-Reality" "www.apple.com"

# 内部流程：
# 1. 生成 UUID 和 Reality 密钥
# 2. 添加到 nodes.yaml
# 3. 生成 config/inbounds/vless-reality-node001.json
# 4. 初始化证书（如果不存在）
# 5. 重载 sing-box 服务
# 6. 输出分享链接

# 输出：
# ✓ 节点已添加: node-001
# ✓ 配置已生成: config/inbounds/vless-reality-node001.json
# ✓ 服务已重载
# 
# 分享链接: vless://xxx@server-ip:443?...
```

### 场景 2：添加第二个节点

```bash
# 添加 Hysteria2 节点
./modules/singbox/deploy.sh deploy-hy2 "香港-HY2" 10443

# 内部流程：
# 1. 添加到 nodes.yaml
# 2. 生成 config/inbounds/hysteria2-node002.json
# 3. 重载服务（不影响 node-001）

# 输出：
# ✓ 节点已添加: node-002
# ✓ 配置已生成: config/inbounds/hysteria2-node002.json
# ✓ 服务已重载
# 
# 分享链接: hysteria2://xxx@server-ip:10443?...
```

### 场景 3：删除节点

```bash
# 删除节点
./manager.sh delete node-001

# 内部流程：
# 1. 从 nodes.yaml 删除
# 2. 删除 config/inbounds/vless-reality-node001.json
# 3. 重载服务

# 输出：
# ✓ 节点已删除: node-001
# ✓ 配置已清理
# ✓ 服务已重载
```

---

## 💡 核心优势总结

### 1. 配置分片（关键创新）
- 每个节点独立配置文件
- 添加/删除节点不影响其他节点
- 易于调试和维护

### 2. 服务管理规范
- 使用 systemd/OpenRC
- 支持 reload（不中断连接）
- 自动重启

### 3. 模块化清晰
- 核心接口统一
- 模块职责明确
- 易于扩展

### 4. 轻量化
- 纯 YAML + JSON
- 无数据库
- 依赖少

### 5. 实战验证
- 借鉴 fscarmen 的成熟设计
- 避免 singbox-lite 的臃肿问题
- 结合你的模块化思路

---

## 📝 下一步建议

### MVP 阶段（1 周）
1. ✅ 实现配置分片机制
2. ✅ 实现 node_api 和 singbox_api
3. ✅ 实现 VLESS-Reality 模板
4. ✅ 实现证书自动生成
5. ✅ 在 64M 小鸡上测试

### V1.0 阶段（2 周）
1. ✅ 支持多种协议（Hysteria2, TUIC, Shadowsocks）
2. ✅ 实现 Argo 模块
3. ✅ 实现中转模块
4. ✅ 完整测试

### V1.1+ 阶段（按需）
1. 订阅系统（可选）
2. Web UI（可选）
3. 更多协议支持

---

**这个方案结合了：**
- ✅ fscarmen 的专业设计（配置分片、服务管理）
- ✅ 你的模块化思路（接口清晰、职责分离）
- ✅ 避免 singbox-lite 的臃肿问题

**你觉得这个最终方案怎么样？** 🌸
