# Sing-box 模块化脚本 - 完整开发流程与模块规划

> 设计日期：2026-02-28  
> 目标：从零到完整的开发路线图

---

## 🎯 项目目标回顾

### 核心需求
1. **模块化架构** - 功能独立，按需加载
2. **资源自适应** - 不同机器运行不同模块
3. **统一节点管理** - Clash YAML 作为数据中心
4. **多功能支持** - Sing-box 直连、Argo 隧道、中转、统计等
5. **永不臃肿** - 核心简单，扩展灵活

---

## 📋 完整模块清单

### 必需模块（Core）

#### 1. core - 核心模块
**职责：**
- 系统初始化
- 环境检查
- 基础服务管理
- 健康检查

**功能：**
- `install` - 安装依赖（yq, jq, curl 等）
- `uninstall` - 卸载清理
- `health` - 健康检查
- `update` - 自更新

**资源需求：**
- 内存：<10MB
- 磁盘：<10MB
- 依赖：bash 4.0+

---

### 基础模块（Essential）

#### 2. nodes - 节点管理模块
**职责：**
- 统一节点配置管理
- 节点增删改查
- 节点状态同步
- 配置格式转换

**功能：**
- `add` - 添加节点
- `delete` - 删除节点
- `list` - 列出节点
- `edit` - 编辑节点
- `import` - 导入配置（Clash/V2Ray/订阅链接）
- `export` - 导出配置（多种格式）
- `sync` - 同步节点状态
- `validate` - 验证节点配置

**数据格式：**
```yaml
# config/nodes.yaml
nodes:
  - id: "node-001"
    name: "香港-01"
    type: "vless"
    server: "hk1.example.com"
    port: 443
    uuid: "xxx"
    tls: true
    module: "singbox"
    status: "active"
    tags: ["direct", "hk", "low-latency"]
    created_at: "2026-02-28T20:00:00Z"
    updated_at: "2026-02-28T20:00:00Z"
```

**资源需求：**
- 内存：<20MB
- 磁盘：<20MB
- 依赖：yq, jq

---

#### 3. singbox - Sing-box 部署模块
**职责：**
- 部署 Sing-box 直连节点
- 配置生成与管理
- 服务启停控制

**功能：**
- `deploy` - 部署节点
- `config` - 生成配置
- `start` - 启动服务
- `stop` - 停止服务
- `restart` - 重启服务
- `status` - 查看状态
- `logs` - 查看日志

**配置生成：**
- 读取 nodes.yaml 中 `module: "singbox"` 的节点
- 转换为 Sing-box JSON 配置
- 支持多协议（VLESS, VMess, Trojan, Hysteria2）

**资源需求：**
- 内存：32MB
- 磁盘：50MB
- 依赖：sing-box

---

### 扩展模块（Optional）

#### 4. argo - Argo 隧道模块
**职责：**
- 创建和管理 Cloudflare Argo 隧道
- 隧道节点部署
- 隧道状态监控

**功能：**
- `create` - 创建隧道
- `delete` - 删除隧道
- `list` - 列出隧道
- `start` - 启动隧道
- `stop` - 停止隧道
- `status` - 隧道状态
- `logs` - 隧道日志

**工作流程：**
1. 创建 Cloudflare 隧道
2. 获取隧道 token
3. 写入 nodes.yaml
4. 启动 cloudflared 服务

**资源需求：**
- 内存：64MB
- 磁盘：100MB
- 依赖：cloudflared

---

#### 5. relay - 中转模块
**职责：**
- 导入第三方订阅
- 本地端口转发
- 中转节点管理

**功能：**
- `import` - 导入订阅链接
- `parse` - 解析节点信息
- `forward` - 启动端口转发
- `stop` - 停止转发
- `list` - 列出中转节点
- `test` - 测试节点可用性

**工作流程：**
1. 下载订阅链接
2. 解析节点信息（Base64/YAML/JSON）
3. 为每个节点分配本地端口
4. 启动 socat/gost 转发
5. 写入 nodes.yaml

**资源需求：**
- 内存：128MB
- 磁盘：100MB
- 依赖：socat 或 gost

---

#### 6. stats - 统计模块
**职责：**
- 流量统计
- 速度测试
- 节点延迟监控
- 使用报告

**功能：**
- `traffic` - 流量统计
- `speed` - 速度测试
- `ping` - 延迟测试
- `report` - 生成报告
- `export` - 导出数据

**数据存储：**
```yaml
# config/stats.yaml
traffic:
  node-001:
    upload: 1024000000    # bytes
    download: 5120000000
    last_reset: "2026-02-28T00:00:00Z"
    
latency:
  node-001:
    avg: 50    # ms
    min: 30
    max: 100
    last_check: "2026-02-28T20:00:00Z"
```

**资源需求：**
- 内存：64MB
- 磁盘：50MB
- 依赖：iftop, speedtest-cli

---

#### 7. monitor - 监控模块
**职责：**
- 节点健康检查
- 自动故障切换
- 告警通知

**功能：**
- `check` - 健康检查
- `watch` - 持续监控
- `failover` - 故障切换
- `alert` - 发送告警

**监控策略：**
- 定期 ping 检查（每 5 分钟）
- 连接测试（TCP/HTTP）
- 自动禁用故障节点
- 可选：Telegram/邮件告警

**资源需求：**
- 内存：32MB
- 磁盘：20MB
- 依赖：curl, ping

---

#### 8. webui - Web 管理界面
**职责：**
- 提供 Web 管理界面
- 可视化节点管理
- 实时状态监控

**功能：**
- 节点管理（增删改查）
- 配置编辑
- 状态监控
- 日志查看
- 统计图表

**技术栈：**
- 后端：简单的 HTTP 服务器（Python/Node.js/Go）
- 前端：纯 HTML/CSS/JS（无需构建）
- API：RESTful 接口

**资源需求：**
- 内存：256MB
- 磁盘：50MB
- 依赖：python3 或 node

---

#### 9. backup - 备份恢复模块
**职责：**
- 配置备份
- 自动备份
- 恢复功能

**功能：**
- `backup` - 创建备份
- `restore` - 恢复备份
- `list` - 列出备份
- `delete` - 删除备份
- `auto` - 自动备份（定时任务）

**备份内容：**
- nodes.yaml
- profile.yaml
- 模块配置
- 服务配置

**资源需求：**
- 内存：<10MB
- 磁盘：100MB（备份空间）
- 依赖：tar, gzip

---

#### 10. security - 安全模块
**职责：**
- 配置加密
- 访问控制
- 安全审计

**功能：**
- `encrypt` - 加密敏感配置
- `decrypt` - 解密配置
- `auth` - 访问认证
- `audit` - 安全审计日志

**安全特性：**
- 敏感信息加密（UUID, Token）
- Web UI 密码保护
- API 访问控制
- 操作日志记录

**资源需求：**
- 内存：<10MB
- 磁盘：<10MB
- 依赖：openssl

---

#### 11. update - 更新模块
**职责：**
- 脚本自更新
- 模块更新
- 依赖更新

**功能：**
- `check` - 检查更新
- `update` - 执行更新
- `rollback` - 回滚版本
- `changelog` - 查看更新日志

**更新策略：**
- 从 GitHub 拉取最新版本
- 增量更新（只更新变化的模块）
- 自动备份旧版本
- 更新失败自动回滚

**资源需求：**
- 内存：<20MB
- 磁盘：<20MB
- 依赖：git 或 curl

---

## 🏗️ 开发流程

### Phase 1: 基础框架（第 1-3 天）

#### 目标
搭建核心架构，验证设计可行性

#### 任务清单
1. **目录结构**
   - [ ] 创建项目目录
   - [ ] 设计配置文件格式
   - [ ] 编写 README

2. **核心调度器（manager.sh）**
   - [ ] 命令行参数解析
   - [ ] 模块发现与注册
   - [ ] 命令路由
   - [ ] 错误处理

3. **公共库（lib/）**
   - [ ] common.sh - 通用函数（日志、颜色、错误处理）
   - [ ] yaml.sh - YAML 操作封装（基于 yq）
   - [ ] module.sh - 模块管理（加载、检查、运行）
   - [ ] resource.sh - 资源检测（内存、磁盘、CPU）

4. **配置管理**
   - [ ] nodes.yaml 格式定义
   - [ ] profile.yaml 格式定义
   - [ ] module.conf 格式定义

5. **测试**
   - [ ] 在 64M 小鸡上测试框架
   - [ ] 验证模块加载机制
   - [ ] 验证资源检测

---

### Phase 2: 核心模块（第 4-7 天）

#### 目标
实现必需模块，确保基本功能可用

#### 任务清单

**1. core 模块**
- [ ] install.sh - 安装依赖
- [ ] health.sh - 健康检查
- [ ] update.sh - 自更新
- [ ] 编写 module.conf
- [ ] 测试

**2. nodes 模块**
- [ ] add.sh - 添加节点
- [ ] delete.sh - 删除节点
- [ ] list.sh - 列出节点
- [ ] import.sh - 导入配置
- [ ] export.sh - 导出配置
- [ ] validate.sh - 验证配置
- [ ] 编写 module.conf
- [ ] 测试

**3. singbox 模块**
- [ ] deploy.sh - 部署节点
- [ ] config.sh - 生成配置
- [ ] service.sh - 服务管理
- [ ] 编写 module.conf
- [ ] 在 64M 小鸡上测试

**4. 预设配置**
- [ ] minimal.yaml（64M）
- [ ] standard.yaml（256M）
- [ ] full.yaml（512M+）

**5. 集成测试**
- [ ] 64M 小鸡：core + nodes + singbox
- [ ] 验证节点添加、部署、启动流程
- [ ] 性能测试（内存、CPU 占用）

---

### Phase 3: 扩展模块（第 8-14 天）

#### 目标
实现可选模块，丰富功能

#### 任务清单

**1. argo 模块（2 天）**
- [ ] setup.sh - 创建隧道
- [ ] manage.sh - 管理隧道
- [ ] 编写 module.conf
- [ ] 在 256M 机器上测试

**2. relay 模块（2 天）**
- [ ] import.sh - 导入订阅
- [ ] forward.sh - 启动转发
- [ ] 编写 module.conf
- [ ] 测试

**3. stats 模块（1 天）**
- [ ] traffic.sh - 流量统计
- [ ] speed.sh - 速度测试
- [ ] 编写 module.conf
- [ ] 测试

**4. monitor 模块（1 天）**
- [ ] check.sh - 健康检查
- [ ] watch.sh - 持续监控
- [ ] 编写 module.conf
- [ ] 测试

**5. backup 模块（1 天）**
- [ ] backup.sh - 备份
- [ ] restore.sh - 恢复
- [ ] 编写 module.conf
- [ ] 测试

---

### Phase 4: 高级功能（第 15-21 天）

#### 目标
实现高级功能，提升用户体验

#### 任务清单

**1. webui 模块（3 天）**
- [ ] 后端 API 设计
- [ ] 前端界面开发
- [ ] 集成测试
- [ ] 在 512M+ 机器上测试

**2. security 模块（2 天）**
- [ ] 配置加密
- [ ] 访问控制
- [ ] 测试

**3. update 模块（1 天）**
- [ ] 自更新机制
- [ ] 测试

**4. 文档完善（1 天）**
- [ ] 用户手册
- [ ] 开发文档
- [ ] API 文档
- [ ] 故障排查指南

---

### Phase 5: 测试与优化（第 22-28 天）

#### 目标
全面测试，优化性能，准备发布

#### 任务清单

**1. 功能测试**
- [ ] 64M 小鸡：minimal 配置
- [ ] 256M 机器：standard 配置
- [ ] 512M+ 机器：full 配置
- [ ] 各模块独立测试
- [ ] 模块组合测试

**2. 性能测试**
- [ ] 内存占用测试
- [ ] CPU 占用测试
- [ ] 磁盘 I/O 测试
- [ ] 网络性能测试

**3. 压力测试**
- [ ] 大量节点测试（100+）
- [ ] 长时间运行测试（7 天）
- [ ] 故障恢复测试

**4. 优化**
- [ ] 代码优化
- [ ] 性能优化
- [ ] 内存优化

**5. 文档**
- [ ] 完善 README
- [ ] 编写 CHANGELOG
- [ ] 准备发布说明

---

## 🎨 设计细节

### 1. 模块间通信协议

#### 数据格式标准
```yaml
# 节点数据格式
node:
  id: string          # 唯一标识
  name: string        # 显示名称
  type: string        # 节点类型（vless/vmess/trojan/argo/relay）
  module: string      # 管理模块
  status: string      # 状态（active/inactive/error）
  config: object      # 节点配置（根据类型不同）
  metadata: object    # 元数据（创建时间、标签等）
```

#### 状态同步机制
```bash
# 模块写入状态
update_node_status() {
    local node_id="$1"
    local status="$2"
    yq eval -i ".nodes[] |= (select(.id == \"$node_id\") | .status = \"$status\")" \
        config/nodes.yaml
}

# 模块读取状态
read_node_status() {
    local node_id="$1"
    yq eval ".nodes[] | select(.id == \"$node_id\") | .status" \
        config/nodes.yaml
}
```

---

### 2. 错误处理策略

#### 错误级别
- **FATAL** - 致命错误，程序退出
- **ERROR** - 错误，功能失败
- **WARN** - 警告，可能有问题
- **INFO** - 信息，正常日志
- **DEBUG** - 调试信息

#### 错误处理流程
```bash
# lib/common.sh
error() {
    echo "[ERROR] $*" >&2
    log_error "$*"
    return 1
}

fatal() {
    echo "[FATAL] $*" >&2
    log_fatal "$*"
    exit 1
}

# 模块中使用
deploy_node() {
    check_dependencies || fatal "Dependencies not met"
    validate_config || error "Invalid config" && return 1
    # ...
}
```

---

### 3. 日志系统

#### 日志格式
```
[2026-02-28 20:00:00] [INFO] [singbox] Node deployed: node-001
[2026-02-28 20:00:01] [ERROR] [argo] Failed to create tunnel: timeout
```

#### 日志文件
```
/var/log/singbox-manager/
├── manager.log          # 主日志
├── singbox.log          # Sing-box 模块日志
├── argo.log             # Argo 模块日志
└── error.log            # 错误日志
```

---

### 4. 配置验证

#### 验证规则
```yaml
# 节点配置验证规则
validation:
  node:
    id:
      type: string
      required: true
      pattern: "^[a-z0-9-]+$"
    name:
      type: string
      required: true
      max_length: 50
    type:
      type: string
      required: true
      enum: ["vless", "vmess", "trojan", "argo", "relay"]
    server:
      type: string
      required: true
      format: "hostname_or_ip"
    port:
      type: integer
      required: true
      min: 1
      max: 65535
```

---

### 5. 性能优化

#### 缓存机制
```bash
# 缓存节点列表（避免频繁读取 YAML）
cache_nodes() {
    local cache_file="/tmp/nodes.cache"
    local cache_ttl=300  # 5 分钟
    
    if [[ -f "$cache_file" ]]; then
        local age=$(($(date +%s) - $(stat -c %Y "$cache_file")))
        if [[ $age -lt $cache_ttl ]]; then
            cat "$cache_file"
            return 0
        fi
    fi
    
    yq eval '.nodes[]' config/nodes.yaml | tee "$cache_file"
}
```

#### 并行处理
```bash
# 并行检查多个节点
check_nodes_parallel() {
    local nodes=("$@")
    for node in "${nodes[@]}"; do
        check_node "$node" &
    done
    wait
}
```

---

## 🤔 需要考虑的问题

### 1. 配置格式选择

**YAML vs JSON vs TOML？**

| 格式 | 优点 | 缺点 | 推荐 |
|------|------|------|------|
| YAML | 可读性好，支持注释 | 解析稍慢，缩进敏感 | ✅ 推荐 |
| JSON | 解析快，广泛支持 | 不支持注释，可读性差 | ⚠️ 备选 |
| TOML | 简单清晰 | 工具支持少 | ❌ 不推荐 |

**建议：主配置用 YAML，内部通信可用 JSON**

---

### 2. 依赖管理

**必需依赖：**
- bash 4.0+
- yq（YAML 处理）
- jq（JSON 处理）
- curl（网络请求）

**可选依赖：**
- sing-box（singbox 模块）
- cloudflared（argo 模块）
- socat/gost（relay 模块）
- python3/node（webui 模块）

**安装策略：**
- core 模块负责检查和安装必需依赖
- 各模块负责检查自己的可选依赖
- 提供一键安装脚本

---

### 3. 版本兼容性

**模块版本管理：**
```ini
# module.conf
[module]
version = "1.0.0"
min_core_version = "1.0.0"
compatible_modules = ["nodes>=1.0.0", "singbox>=1.0.0"]
```

**兼容性检查：**
- 启动时检查模块版本
- 不兼容时给出警告或拒绝加载
- 提供升级建议

---

### 4. 安全性

**敏感信息保护：**
- UUID、Token 等加密存储
- 配置文件权限控制（600）
- Web UI 密码保护
- API 访问控制

**审计日志：**
- 记录所有配置变更
- 记录所有敏感操作
- 定期清理旧日志

---

### 5. 可扩展性

**插件机制（未来）：**
- 支持第三方模块
- 模块市场/仓库
- 模块签名验证

**API 接口（未来）：**
- RESTful API
- WebSocket 实时通信
- Webhook 通知

---

## 📊 模块优先级

### 必需（MVP）
1. ✅ core - 核心模块
2. ✅ nodes - 节点管理
3. ✅ singbox - Sing-box 部署

### 重要（V1.0）
4. ⭐ argo - Argo 隧道
5. ⭐ relay - 中转模块
6. ⭐ monitor - 监控模块

### 可选（V1.1+）
7. 📊 stats - 统计模块
8. 🌐 webui - Web 界面
9. 🔒 security - 安全模块
10. 💾 backup - 备份模块
11. 🔄 update - 更新模块

---

## 🎯 里程碑

### Milestone 1: MVP（第 1-7 天）
- 核心框架
- core + nodes + singbox 模块
- 在 64M 小鸡上可用

### Milestone 2: V1.0（第 8-14 天）
- argo + relay + monitor 模块
- 在 256M 机器上可用
- 基本功能完整

### Milestone 3: V1.1（第 15-21 天）
- stats + webui + security 模块
- 在 512M+ 机器上可用
- 功能丰富

### Milestone 4: V1.2（第 22-28 天）
- backup + update 模块
- 全面测试优化
- 准备发布

---

## 💭 开放问题

### 需要讨论的设计决策

1. **配置文件位置**
   - 选项 A：`/etc/singbox-manager/`（系统级）
   - 选项 B：`~/.singbox-manager/`（用户级）
   - 选项 C：`./config/`（项目级）
   - **建议：支持多种，优先级 C > B > A**

2. **日志存储**
   - 选项 A：文件日志（`/var/log/`）
   - 选项 B：systemd journal
   - 选项 C：两者都支持
   - **建议：C，默认文件日志**

3. **服务管理**
   - 选项 A：systemd service
   - 选项 B：自己的守护进程
   - 选项 C：两者都支持
   - **建议：A，systemd 更标准**

4. **配置热加载**
   - 是否支持不重启服务更新配置？
   - **建议：支持，通过 SIGHUP 信号**

5. **多实例支持**
   - 是否支持同一台机器运行多个实例？
   - **建议：V2.0 考虑**

---

## 📝 下一步

现在设计已经比较完整了，你觉得：

1. **模块清单** - 还有哪些模块需要补充？
2. **开发流程** - 这个流程合理吗？
3. **设计细节** - 哪些地方需要调整？
4. **开放问题** - 对那些设计决策有什么想法？

我们可以继续细化设计，或者你有其他想法？🌸
