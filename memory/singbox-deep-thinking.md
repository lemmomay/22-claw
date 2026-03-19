# Sing-box 模块化脚本 - 深度思考优化方案

> 思考日期：2026-03-01  
> 版本：v5.0（深度思考模式）

---

## 🧠 深度思考过程

### 第一层思考：问题本质

**核心问题：** 为什么现有脚本都会变臃肿？

**深层原因分析：**

1. **功能耦合** - 所有功能写在一个脚本里
2. **数据混乱** - 配置、状态、临时数据混在一起
3. **职责不清** - 一个函数做多件事
4. **扩展困难** - 加新功能必须改旧代码

**根本矛盾：**
```
轻量化需求 ←→ 功能丰富需求
```

**解决思路：**
- 不是"功能少 = 轻量"
- 而是"架构好 = 轻量"

---

### 第二层思考：架构设计的哲学

**Unix 哲学：**
1. 做一件事，做好它
2. 程序之间通过简单接口协作
3. 文本流是通用接口

**应用到我们的设计：**

```
❌ 错误思路：
一个大脚本 → 包含所有功能 → 越来越臃肿

✅ 正确思路：
多个小脚本 → 各司其职 → 通过数据协作
```

**关键洞察：**
- 模块不是"功能分类"
- 模块是"职责分离"

---

### 第三层思考：数据流设计

**传统脚本的问题：**
```bash
# 所有数据混在一起
config.json = {
  nodes: [...],
  settings: {...},
  temp_data: {...}
}
```

**优化思路：**
```
数据分层：
1. 元数据层（nodes.yaml）- 用户可编辑
2. 配置层（config/*.json）- 程序生成
3. 状态层（state/）- 运行时状态
4. 临时层（/tmp/）- 临时文件
```

**为什么这样设计？**
- 元数据 = 真相的唯一来源（Single Source of Truth）
- 配置 = 从元数据派生
- 状态 = 运行时信息
- 临时 = 可随时删除

---

### 第四层思考：配置生成的本质

**问题：** 为什么 fscarmen 的配置分片这么好用？

**深层原因：**

1. **增量更新** - 只改变化的部分
2. **并行安全** - 不同文件不冲突
3. **易于调试** - 每个文件独立
4. **符合 sing-box 设计** - `-C` 参数加载目录

**进一步优化：**

```bash
# fscarmen 的做法
config/
├── 11_xtls-reality_inbounds.json
├── 12_hysteria2_inbounds.json
└── ...

# 问题：多个节点同协议怎么办？
# 如果有 10 个 vless-reality 节点，都写在 11_xtls-reality_inbounds.json 里？

# 我们的优化
config/inbounds/
├── vless-reality-node001.json  ← 每个节点独立
├── vless-reality-node002.json
├── hysteria2-node003.json
└── ...

# 好处：
# 1. 添加节点 = 新增文件
# 2. 删除节点 = 删除文件
# 3. 修改节点 = 修改单个文件
# 4. 不影响其他节点
```

---

### 第五层思考：模块间通信

**问题：** 模块怎么通信才最优雅？

**方案对比：**

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|---------|
| 函数调用 | 简单直接 | 耦合严重 | 单脚本 |
| 文件锁 + YAML | 解耦 | 并发复杂 | 多脚本 |
| 消息队列 | 异步解耦 | 太重 | 大型系统 |
| 事件驱动 | 灵活 | 复杂 | 复杂场景 |

**我们的选择：文件 + 接口**

```bash
# 模块不直接操作文件
# 而是调用接口

# ❌ 错误做法
yq eval -i '.nodes += [...]' nodes.yaml

# ✅ 正确做法
node_add "$node_data"  # 接口处理并发、验证、日志
```

**为什么？**
- 简单（不需要消息队列）
- 安全（接口处理并发）
- 可控（接口可以加验证、日志）

---

### 第六层思考：证书管理的深层问题

**问题：** 证书管理为什么重要？

**深层分析：**

1. **Reality 不需要证书** - 但 TLS 需要
2. **自签证书够用吗？** - 大部分场景够用
3. **Let's Encrypt 必要吗？** - 看使用场景

**场景分析：**

```
场景 1：Reality 协议（推荐）
- 不需要证书
- 不需要域名
- 最简单

场景 2：TLS 协议 + 自签证书
- 需要证书
- 不需要域名
- 客户端跳过验证

场景 3：TLS 协议 + Let's Encrypt
- 需要证书
- 需要域名
- 客户端正常验证
```

**优化策略：**

```bash
# 智能证书管理
cert_get_or_create() {
    local protocol="$1"
    local domain="$2"
    
    case "$protocol" in
        *reality*)
            # Reality 不需要证书
            echo "none"
            ;;
        *tls*)
            if [[ -n "$domain" && "$domain" != "example.com" ]]; then
                # 有真实域名，尝试 Let's Encrypt
                cert_request_letsencrypt "$domain" || cert_generate_self_signed "$domain"
            else
                # 没有域名，使用自签
                cert_generate_self_signed "default"
            fi
            ;;
    esac
}
```

---

### 第七层思考：中转的本质

**问题：** 中转到底是什么？

**本质分析：**

```
中转 = 本地 inbound + 远程 outbound

┌─────────────────────────────────────┐
│  中转机                              │
│  ┌──────────┐      ┌──────────┐    │
│  │ inbound  │  →   │ outbound │    │
│  │ (监听)    │      │ (连接)    │    │
│  └──────────┘      └──────────┘    │
└─────────────────────────────────────┘
                        ↓
                   ┌─────────┐
                   │ 落地机   │
                   └─────────┘
```

**关键洞察：**
- 中转不是新功能
- 中转是 inbound + outbound 的组合
- 所以不需要单独的"中转模块"
- 只需要"组合配置"的能力

**优化设计：**

```yaml
# nodes.yaml
nodes:
  # 落地节点
  - id: "landing-001"
    name: "落地-香港"
    type: "landing"
    protocol: "vless-tcp"
    server: "hk.example.com"
    port: 443
    uuid: "xxx"
    
  # 中转节点
  - id: "relay-001"
    name: "中转-美国"
    type: "relay"
    protocol: "vless-reality"  # 入站协议
    port: 10443
    
    # 关键：指向落地节点
    upstream: "landing-001"
```

**配置生成：**

```bash
# 生成中转配置
generate_relay_config() {
    local relay_node="$1"
    local landing_node="$2"
    
    # 1. 生成 inbound（中转入站）
    generate_inbound_config "$relay_node"
    
    # 2. 生成 outbound（连接落地）
    generate_outbound_config "$relay_node" "$landing_node"
    
    # 3. 生成 route（路由规则）
    generate_route_config "$relay_node" "$landing_node"
}
```

---

### 第八层思考：订阅系统的必要性

**问题：** 订阅系统真的需要吗？

**场景分析：**

```
场景 1：个人使用
- 节点少（1-3 个）
- 手动导入节点链接
- 不需要订阅

场景 2：多设备使用
- 节点多（5+ 个）
- 需要订阅
- 但可以用简单方案

场景 3：分享给他人
- 需要订阅
- 需要完整功能
```

**优化策略：**

```bash
# 方案 1：静态文件（最简单）
generate_subscription() {
    # 生成 Clash YAML
    yq eval '.nodes[]' nodes.yaml | convert_to_clash > /var/www/html/clash.yaml
    
    # 生成 Base64 订阅
    yq eval '.nodes[]' nodes.yaml | convert_to_links | base64 > /var/www/html/sub.txt
}

# 方案 2：nginx（fscarmen 的做法）
# 需要安装 nginx，但更灵活

# 方案 3：内置 HTTP 服务器（可选）
# 使用 Python/Node.js 提供订阅服务
```

**我们的选择：**
- MVP：静态文件（不需要 nginx）
- V1.0：可选 nginx
- V1.1+：可选内置服务器

---

### 第九层思考：端口管理

**问题：** 端口冲突怎么办？

**深层分析：**

```
问题场景：
1. 多个节点想用 443
2. NAT 机器端口有限
3. 端口跳跃（Hysteria2）
```

**解决方案：**

```bash
# 1. 端口分配策略
allocate_port() {
    local preferred_port="$1"
    
    # 检查端口是否被占用
    if port_is_free "$preferred_port"; then
        echo "$preferred_port"
    else
        # 自动分配空闲端口
        find_free_port 10000 20000
    fi
}

# 2. 端口冲突检测
check_port_conflict() {
    local port="$1"
    
    # 检查系统占用
    ss -tuln | grep -q ":$port " && return 1
    
    # 检查 nodes.yaml 中的占用
    yq eval ".nodes[].listen.port == $port" nodes.yaml | grep -q true && return 1
    
    return 0
}

# 3. 端口跳跃（Hysteria2）
# 应用层多端口监听（singbox-lite 的做法）
generate_hysteria2_config() {
    local base_port="$1"
    local port_range="$2"  # 如 "50000:51000"
    
    # 生成多个监听端口
    local ports=()
    for port in $(seq ${port_range/:/ }); do
        ports+=("$port")
    done
    
    # 写入配置
    jq -n --argjson ports "$(printf '%s\n' "${ports[@]}" | jq -R . | jq -s .)" \
        '{listen_ports: $ports}'
}
```

---

### 第十层思考：错误处理和恢复

**问题：** 脚本出错怎么办？

**深层分析：**

```
错误类型：
1. 配置错误（用户输入）
2. 系统错误（依赖缺失）
3. 网络错误（下载失败）
4. 运行时错误（服务崩溃）
```

**优化策略：**

```bash
# 1. 配置验证（事前检查）
validate_node_config() {
    local node_data="$1"
    
    # 检查必需字段
    [[ -z "$(echo "$node_data" | yq eval '.protocol' -)" ]] && {
        error "Missing protocol"
        return 1
    }
    
    # 检查端口范围
    local port=$(echo "$node_data" | yq eval '.listen.port' -)
    [[ $port -lt 1 || $port -gt 65535 ]] && {
        error "Invalid port: $port"
        return 1
    }
    
    return 0
}

# 2. 原子操作（事务）
atomic_add_node() {
    local node_data="$1"
    
    # 1. 验证
    validate_node_config "$node_data" || return 1
    
    # 2. 备份
    cp nodes.yaml nodes.yaml.bak
    
    # 3. 添加
    if ! node_add "$node_data"; then
        # 回滚
        mv nodes.yaml.bak nodes.yaml
        return 1
    fi
    
    # 4. 生成配置
    if ! generate_inbound_config "$node_id"; then
        # 回滚
        node_delete "$node_id"
        mv nodes.yaml.bak nodes.yaml
        return 1
    fi
    
    # 5. 重载服务
    if ! singbox_reload; then
        # 回滚
        rm "config/inbounds/*-$node_id.json"
        node_delete "$node_id"
        mv nodes.yaml.bak nodes.yaml
        return 1
    fi
    
    # 6. 清理备份
    rm nodes.yaml.bak
    return 0
}

# 3. 自动恢复
auto_recover() {
    # 检查服务状态
    if ! systemctl is-active sing-box; then
        log_error "sing-box service is down"
        
        # 尝试重启
        systemctl restart sing-box
        
        # 如果还是失败，回滚到上一个可用配置
        if ! systemctl is-active sing-box; then
            restore_last_good_config
        fi
    fi
}
```

---

### 第十一层思考：性能优化

**问题：** 64M 小鸡够用吗？

**内存占用分析：**

```
组件                占用
sing-box 服务       20-30MB
bash 脚本           5-10MB
临时文件            <5MB
系统开销            20-30MB
─────────────────────────
总计                50-75MB
```

**优化策略：**

```bash
# 1. 减少依赖
# ❌ 不要安装：nginx, docker, 大型工具
# ✅ 只安装：sing-box, yq, jq, curl

# 2. 及时清理
cleanup_temp_files() {
    # 清理临时文件
    rm -f /tmp/singbox-*
    
    # 清理旧日志
    find /var/log/sing-box/ -name "*.log" -mtime +7 -delete
}

# 3. 配置优化
# sing-box 配置中减少缓存
{
  "experimental": {
    "cache_file": {
      "enabled": false  # 64M 小鸡不需要缓存
    }
  }
}

# 4. 监控内存
monitor_memory() {
    local mem_free=$(free -m | awk '/^Mem:/{print $4}')
    
    if [[ $mem_free -lt 20 ]]; then
        log_warn "Low memory: ${mem_free}MB"
        
        # 清理缓存
        sync && echo 3 > /proc/sys/vm/drop_caches
    fi
}
```

---

## 🎯 最终优化方案

### 核心架构（深度思考后）

```
singbox-manager/
├── manager.sh              # 主入口（极简，只做路由）
├── config/
│   ├── nodes.yaml          # 元数据（唯一真相来源）
│   ├── base/               # 基础配置（不变）
│   │   ├── 00_log.json
│   │   ├── 01_outbounds.json
│   │   ├── 02_dns.json
│   │   └── 03_route.json
│   └── inbounds/           # 入站配置（动态生成）
│       ├── vless-reality-node001.json
│       ├── hysteria2-node002.json
│       └── ...
├── state/                  # 运行时状态（新增）
│   ├── ports.json          # 端口分配记录
│   └── services.json       # 服务状态
├── core/
│   ├── node_api.sh         # 节点操作接口
│   ├── singbox_api.sh      # Sing-box 服务接口
│   ├── cert_api.sh         # 证书管理
│   ├── config_generator.sh # 配置生成器
│   ├── port_manager.sh     # 端口管理（新增）
│   └── validator.sh        # 配置验证（新增）
├── modules/
│   ├── singbox/
│   │   └── deploy.sh       # 部署直连节点
│   ├── argo/
│   │   └── tunnel.sh       # Argo 隧道
│   └── relay/
│       └── setup.sh        # 中转配置（简化）
├── templates/              # 配置模板
│   ├── base/
│   └── inbounds/
└── lib/
    ├── common.sh
    ├── lock.sh
    └── recovery.sh         # 自动恢复（新增）
```

---

### 关键设计决策

#### 1. 数据分层（最重要）

```
┌─────────────────────────────────────┐
│  元数据层（nodes.yaml）              │
│  - 用户可编辑                        │
│  - 唯一真相来源                      │
│  - 版本控制友好                      │
└─────────────────────────────────────┘
         ↓ 派生
┌─────────────────────────────────────┐
│  配置层（config/*.json）             │
│  - 程序生成                          │
│  - 可随时重新生成                    │
│  - 不需要备份                        │
└─────────────────────────────────────┘
         ↓ 产生
┌─────────────────────────────────────┐
│  状态层（state/*.json）              │
│  - 运行时信息                        │
│  - 端口分配、服务状态                │
│  - 可随时清理                        │
└─────────────────────────────────────┘
```

#### 2. 配置生成（核心机制）

```bash
# 配置生成的本质：
# 元数据 + 模板 → 配置文件

generate_config() {
    local node_id="$1"
    
    # 1. 读取元数据
    local node=$(yq eval ".nodes[] | select(.id == \"$node_id\")" nodes.yaml)
    
    # 2. 选择模板
    local protocol=$(echo "$node" | yq eval '.protocol' -)
    local template="templates/inbounds/${protocol}.json"
    
    # 3. 渲染模板
    local config=$(render_template "$template" "$node")
    
    # 4. 验证配置
    validate_config "$config" || return 1
    
    # 5. 写入文件
    echo "$config" > "config/inbounds/${protocol}-${node_id}.json"
}
```

#### 3. 模块通信（接口优先）

```bash
# 模块不直接操作数据
# 而是通过接口

# ❌ 错误
echo "$node_data" >> nodes.yaml

# ✅ 正确
node_add "$node_data"  # 接口处理：验证、锁、日志、通知
```

#### 4. 错误处理（原子操作）

```bash
# 所有操作都是原子的
# 要么全成功，要么全回滚

atomic_operation() {
    backup
    try_operation || rollback
    cleanup
}
```

---

## 📊 深度对比

### 与 fscarmen 对比

| 方面 | fscarmen | 我们的方案 | 改进 |
|------|----------|-----------|------|
| 配置分片 | ✅ 按协议分片 | ✅ 按节点分片 | 更细粒度 |
| 元数据 | ❌ 无 | ✅ nodes.yaml | 更清晰 |
| 模块化 | ⚠️ 单脚本 | ✅ 多模块 | 更灵活 |
| 中转 | ❌ 无 | ✅ 支持 | 更完整 |

### 与 singbox-lite 对比

| 方面 | singbox-lite | 我们的方案 | 改进 |
|------|--------------|-----------|------|
| 功能 | ✅ 丰富 | ✅ 丰富 | 相当 |
| 架构 | ❌ 臃肿 | ✅ 清晰 | 更好 |
| 维护性 | ❌ 差 | ✅ 好 | 更好 |
| 扩展性 | ⚠️ 困难 | ✅ 容易 | 更好 |

---

## 💡 核心洞察总结

### 1. 架构比功能重要
- 好的架构可以无限扩展
- 坏的架构功能越多越臃肿

### 2. 数据分层是关键
- 元数据 = 真相
- 配置 = 派生
- 状态 = 临时

### 3. 接口优于直接操作
- 接口可以加验证、日志、锁
- 接口可以随时优化内部实现

### 4. 原子操作保证一致性
- 要么全成功
- 要么全回滚
- 不留中间状态

### 5. 简单优于复杂
- 能用文件就不用数据库
- 能用 systemd 就不自己实现
- 能用模板就不硬编码

---

## 🚀 实施建议

### MVP（1 周）
1. 实现数据分层
2. 实现配置生成器
3. 实现 node_api 和 singbox_api
4. 实现 VLESS-Reality 模板
5. 在 64M 小鸡上测试

### V1.0（2 周）
1. 实现多协议支持
2. 实现 Argo 模块
3. 实现中转配置
4. 实现错误恢复
5. 完整测试

### V1.1+（按需）
1. 订阅系统
2. Web UI
3. 性能监控

---

**这个方案经过深度思考，从本质上解决了臃肿问题。** 🌸
