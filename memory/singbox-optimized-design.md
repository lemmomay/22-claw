# Sing-box 模块化脚本 - 深度思考与优化方案

> 迭代日期：2026-02-28  
> 版本：v2.0（经过深度思考优化）

---

## 🧠 核心设计哲学的反思

### 问题 1：数据驱动真的够吗？

**初版设计：** 所有模块通过 `nodes.yaml` 通信

**深度思考：**
- ✅ 优点：解耦、简单
- ❌ 问题：
  - 并发写入冲突（多个模块同时写 YAML）
  - 性能瓶颈（频繁读写文件）
  - 事务性缺失（写入一半失败怎么办？）
  - 实时性差（轮询 vs 事件驱动）

**优化方案：引入轻量级数据库**

```
数据层架构：
┌─────────────────────────────────────┐
│  SQLite (state.db)                  │  ← 运行时状态（快速读写）
│  - 节点状态                          │
│  - 模块状态                          │
│  - 统计数据                          │
└─────────────────────────────────────┘
         ↕ 定期同步
┌─────────────────────────────────────┐
│  YAML (nodes.yaml)                  │  ← 持久化配置（人类可读）
│  - 节点配置                          │
│  - 用户编辑                          │
└─────────────────────────────────────┘
```

**为什么 SQLite？**
- 单文件，无需服务器
- 支持事务（ACID）
- 并发安全
- 查询快速
- 64M 小鸡也能跑

**数据流：**
1. 用户编辑 `nodes.yaml`
2. 脚本加载到 SQLite
3. 模块读写 SQLite（快速）
4. 定期同步回 YAML（持久化）

---

### 问题 2：模块独立性 vs 代码复用

**初版设计：** 每个模块完全独立

**深度思考：**
- ✅ 优点：解耦、易维护
- ❌ 问题：
  - 大量重复代码（日志、错误处理、配置读取）
  - 模块间共享逻辑难以复用
  - 公共库（lib/）会越来越臃肿

**优化方案：分层架构**

```
┌─────────────────────────────────────┐
│  应用层 (Modules)                    │
│  - 业务逻辑                          │
│  - 模块特定功能                      │
└─────────────────────────────────────┘
         ↓ 调用
┌─────────────────────────────────────┐
│  服务层 (Services)                   │  ← 新增！
│  - NodeService (节点操作)            │
│  - ConfigService (配置管理)          │
│  - LogService (日志服务)             │
│  - EventService (事件总线)           │
└─────────────────────────────────────┘
         ↓ 调用
┌─────────────────────────────────────┐
│  基础层 (Lib)                        │
│  - 通用工具函数                      │
│  - 数据库操作                        │
│  - YAML 操作                         │
└─────────────────────────────────────┘
```

**示例：NodeService**

```bash
# lib/services/node_service.sh

# 节点服务（封装所有节点操作）
class NodeService {
    # 添加节点
    add_node() {
        local node_data="$1"
        
        # 1. 验证
        validate_node "$node_data" || return 1
        
        # 2. 写入数据库
        db_insert "nodes" "$node_data"
        
        # 3. 发出事件
        emit_event "node.created" "$node_data"
        
        # 4. 同步到 YAML
        sync_to_yaml
    }
    
    # 获取节点
    get_node() {
        local node_id="$1"
        db_query "SELECT * FROM nodes WHERE id='$node_id'"
    }
    
    # 更新节点状态
    update_status() {
        local node_id="$1"
        local status="$2"
        
        db_update "nodes" "status='$status'" "id='$node_id'"
        emit_event "node.status_changed" "$node_id:$status"
    }
}
```

**模块使用：**

```bash
# modules/singbox/deploy.sh

# 不再直接操作 YAML，而是调用服务
source lib/services/node_service.sh

deploy_node() {
    local node_id="$1"
    
    # 通过服务获取节点
    local node=$(NodeService.get_node "$node_id")
    
    # 生成配置
    generate_config "$node"
    
    # 启动服务
    systemctl start sing-box
    
    # 更新状态
    NodeService.update_status "$node_id" "active"
}
```

**好处：**
- 模块代码更简洁
- 共享逻辑统一管理
- 易于测试和维护

---

### 问题 3：资源自适应的粒度

**初版设计：** 模块级别的资源控制（启用/禁用整个模块）

**深度思考：**
- ✅ 优点：简单直接
- ❌ 问题：
  - 粒度太粗（比如 relay 模块，可能只想启用导入功能，不想启用转发）
  - 无法动态调整（内存不足时无法自动降级）

**优化方案：功能级别的资源控制**

```yaml
# config/profile.yaml
modules:
  singbox:
    enabled: true
    features:
      deploy: true        # 部署功能
      multi_port: false   # 多端口（需要更多资源）
      
  relay:
    enabled: true
    features:
      import: true        # 导入订阅
      forward: false      # 端口转发（资源不足时禁用）
      
  stats:
    enabled: true
    features:
      traffic: true       # 流量统计
      realtime: false     # 实时监控（资源密集）
      
# 资源策略
resource_policy:
  # 内存不足时的降级策略
  on_low_memory:
    - disable: ["relay.forward", "stats.realtime"]
    - warn: ["webui"]
  
  # 自动调整
  auto_adjust: true
  check_interval: 300  # 每 5 分钟检查一次
```

**动态资源管理：**

```bash
# lib/resource_manager.sh

monitor_resources() {
    while true; do
        local mem_free=$(free -m | awk '/^Mem:/{print $4}')
        
        if [[ $mem_free -lt 50 ]]; then
            # 内存不足，降级
            disable_feature "relay" "forward"
            disable_feature "stats" "realtime"
            log_warn "Low memory, disabled heavy features"
        elif [[ $mem_free -gt 100 ]]; then
            # 内存充足，恢复
            enable_feature "relay" "forward"
            enable_feature "stats" "realtime"
            log_info "Memory recovered, enabled features"
        fi
        
        sleep 300
    done
}
```

---

### 问题 4：配置管理的复杂性

**初版设计：** 单一的 `nodes.yaml` 和 `profile.yaml`

**深度思考：**
- ✅ 优点：简单
- ❌ 问题：
  - 配置文件会越来越大
  - 不同类型的节点混在一起
  - 难以管理和查找

**优化方案：配置分层**

```
config/
├── manager.yaml          # 全局配置
├── profile.yaml          # 运行配置
├── nodes/                # 节点配置（按类型分类）
│   ├── direct.yaml       # 直连节点
│   ├── argo.yaml         # Argo 隧道
│   └── relay.yaml        # 中转节点
├── modules/              # 模块配置
│   ├── singbox.yaml
│   ├── argo.yaml
│   └── relay.yaml
└── state.db              # 运行时状态
```

**配置加载顺序：**
1. `manager.yaml` - 全局配置
2. `profile.yaml` - 运行配置
3. `nodes/*.yaml` - 节点配置（合并）
4. `modules/*.yaml` - 模块配置

**好处：**
- 配置清晰，易于管理
- 可以按需加载（节省内存）
- 支持配置继承和覆盖

---

### 问题 5：错误处理和恢复

**初版设计：** 简单的错误返回

**深度思考：**
- ❌ 问题：
  - 部分失败怎么办？（比如部署 10 个节点，第 5 个失败）
  - 如何回滚？
  - 如何重试？

**优化方案：事务和状态机**

```bash
# lib/transaction.sh

# 事务管理
begin_transaction() {
    local tx_id=$(uuidgen)
    db_exec "BEGIN TRANSACTION"
    echo "$tx_id" > /tmp/tx_current
    log_info "Transaction started: $tx_id"
}

commit_transaction() {
    db_exec "COMMIT"
    rm -f /tmp/tx_current
    log_info "Transaction committed"
}

rollback_transaction() {
    db_exec "ROLLBACK"
    rm -f /tmp/tx_current
    log_warn "Transaction rolled back"
}

# 使用示例
deploy_multiple_nodes() {
    local nodes=("$@")
    
    begin_transaction
    
    for node in "${nodes[@]}"; do
        if ! deploy_node "$node"; then
            log_error "Failed to deploy $node"
            rollback_transaction
            return 1
        fi
    done
    
    commit_transaction
}
```

**状态机：**

```
节点状态转换：
pending → deploying → active
    ↓         ↓          ↓
  error ← error ←  inactive
    ↓
  retry (最多 3 次)
```

---

### 问题 6：模块间依赖和冲突

**初版设计：** 简单的依赖声明

**深度思考：**
- ❌ 问题：
  - 循环依赖怎么办？
  - 版本冲突怎么办？
  - 可选依赖怎么处理？

**优化方案：依赖解析器**

```yaml
# modules/relay/module.conf
[dependencies]
required = ["core>=1.0.0", "nodes>=1.0.0"]
optional = ["stats>=1.0.0"]  # 有 stats 模块时提供更多功能
conflicts = ["singbox<1.0.0"]  # 与旧版本 singbox 冲突
```

```bash
# lib/dependency_resolver.sh

resolve_dependencies() {
    local module="$1"
    local deps=$(read_module_deps "$module")
    
    # 1. 检查循环依赖
    check_circular_deps "$module" || return 1
    
    # 2. 检查版本兼容性
    check_version_compatibility "$deps" || return 1
    
    # 3. 检查冲突
    check_conflicts "$module" || return 1
    
    # 4. 解析依赖顺序（拓扑排序）
    topological_sort "$deps"
}

# 拓扑排序（确保依赖先加载）
topological_sort() {
    # 实现 Kahn 算法
    # ...
}
```

---

### 问题 7：测试和调试

**初版设计：** 没有考虑测试

**深度思考：**
- ❌ 问题：
  - 如何测试模块？
  - 如何模拟不同的资源环境？
  - 如何调试问题？

**优化方案：测试框架**

```
tests/
├── unit/                 # 单元测试
│   ├── test_node_service.sh
│   ├── test_config.sh
│   └── test_resource.sh
├── integration/          # 集成测试
│   ├── test_singbox_deploy.sh
│   └── test_argo_tunnel.sh
├── e2e/                  # 端到端测试
│   └── test_full_workflow.sh
└── fixtures/             # 测试数据
    ├── nodes.yaml
    └── profile.yaml
```

**测试工具：**

```bash
# tests/lib/test_helper.sh

# 模拟资源环境
mock_resources() {
    local mem="$1"
    local disk="$2"
    
    export MOCK_MEMORY="$mem"
    export MOCK_DISK="$disk"
}

# 断言
assert_equals() {
    local expected="$1"
    local actual="$2"
    
    if [[ "$expected" != "$actual" ]]; then
        echo "FAIL: Expected '$expected', got '$actual'"
        return 1
    fi
    echo "PASS"
}

# 使用示例
test_deploy_on_low_memory() {
    mock_resources 64 1024
    
    local result=$(deploy_node "test-node")
    assert_equals "success" "$result"
}
```

**调试模式：**

```bash
# 启用调试
./manager.sh --debug deploy node-001

# 输出详细日志
[DEBUG] Loading module: singbox
[DEBUG] Reading node: node-001
[DEBUG] Generating config...
[DEBUG] Config written to: /etc/sing-box/config.json
[DEBUG] Starting service...
[INFO] Node deployed successfully
```

---

## 🏗️ 优化后的架构

### 完整架构图

```
┌─────────────────────────────────────────────────────────┐
│                    用户界面层                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │   CLI    │  │  Web UI  │  │   API    │              │
│  └──────────┘  └──────────┘  └──────────┘              │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│                    核心调度层                            │
│  ┌──────────────────────────────────────────────────┐   │
│  │  manager.sh                                      │   │
│  │  - 命令路由                                       │   │
│  │  - 模块加载                                       │   │
│  │  - 依赖解析                                       │   │
│  │  - 资源管理                                       │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│                    服务层 (新增)                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │  Node    │  │  Config  │  │   Log    │              │
│  │ Service  │  │ Service  │  │ Service  │              │
│  └──────────┘  └──────────┘  └──────────┘              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │  Event   │  │ Resource │  │Transaction│              │
│  │ Service  │  │ Manager  │  │ Manager  │              │
│  └──────────┘  └──────────┘  └──────────┘              │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│                    模块层                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Sing-box │  │   Argo   │  │  Relay   │  ...         │
│  └──────────┘  └──────────┘  └──────────┘              │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│                    数据层                                │
│  ┌──────────────┐  ┌──────────────┐                     │
│  │ SQLite       │  │ YAML Files   │                     │
│  │ (运行时状态)  │  │ (持久化配置)  │                     │
│  └──────────────┘  └──────────────┘                     │
└─────────────────────────────────────────────────────────┘
```

---

### 优化后的目录结构

```
singbox-manager/
├── manager.sh                # 核心调度器
├── config/
│   ├── manager.yaml          # 全局配置
│   ├── profile.yaml          # 运行配置
│   ├── nodes/                # 节点配置（分类）
│   │   ├── direct.yaml
│   │   ├── argo.yaml
│   │   └── relay.yaml
│   ├── modules/              # 模块配置
│   │   ├── singbox.yaml
│   │   ├── argo.yaml
│   │   └── relay.yaml
│   └── state.db              # SQLite 数据库
├── modules/                  # 功能模块
│   ├── core/
│   ├── nodes/
│   ├── singbox/
│   ├── argo/
│   └── relay/
├── lib/
│   ├── core/                 # 核心库
│   │   ├── common.sh
│   │   ├── db.sh             # 数据库操作
│   │   ├── yaml.sh
│   │   └── logger.sh
│   ├── services/             # 服务层（新增）
│   │   ├── node_service.sh
│   │   ├── config_service.sh
│   │   ├── log_service.sh
│   │   ├── event_service.sh
│   │   └── resource_manager.sh
│   └── utils/                # 工具函数
│       ├── validator.sh
│       ├── transaction.sh
│       └── dependency_resolver.sh
├── tests/                    # 测试（新增）
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── fixtures/
├── docs/                     # 文档
│   ├── architecture.md
│   ├── api.md
│   └── development.md
└── scripts/                  # 辅助脚本
    ├── install.sh
    ├── migrate.sh            # 数据迁移
    └── benchmark.sh          # 性能测试
```

---

## 🎯 核心改进点总结

### 1. 数据层优化
- ✅ 引入 SQLite（快速、事务、并发安全）
- ✅ YAML 作为持久化配置（人类可读）
- ✅ 定期同步机制

### 2. 架构优化
- ✅ 新增服务层（封装共享逻辑）
- ✅ 分层清晰（UI → Core → Service → Module → Data）
- ✅ 模块代码更简洁

### 3. 资源管理优化
- ✅ 功能级别的资源控制（更细粒度）
- ✅ 动态资源调整（自动降级/恢复）
- ✅ 资源监控和告警

### 4. 配置管理优化
- ✅ 配置分层（按类型分类）
- ✅ 配置继承和覆盖
- ✅ 按需加载（节省内存）

### 5. 错误处理优化
- ✅ 事务支持（原子操作）
- ✅ 状态机（清晰的状态转换）
- ✅ 自动重试和回滚

### 6. 依赖管理优化
- ✅ 依赖解析器（拓扑排序）
- ✅ 版本兼容性检查
- ✅ 冲突检测

### 7. 测试和调试优化
- ✅ 完整的测试框架
- ✅ 资源环境模拟
- ✅ 调试模式

---

## 🤔 需要权衡的设计决策

### 1. SQLite vs 纯 YAML

**SQLite 优势：**
- ✅ 快速查询
- ✅ 事务支持
- ✅ 并发安全
- ✅ 复杂查询（JOIN, GROUP BY）

**SQLite 劣势：**
- ⚠️ 增加依赖
- ⚠️ 不如 YAML 直观
- ⚠️ 需要数据迁移工具

**建议：** 使用 SQLite，但保持 YAML 作为主配置格式

---

### 2. 服务层的必要性

**服务层优势：**
- ✅ 代码复用
- ✅ 统一接口
- ✅ 易于测试

**服务层劣势：**
- ⚠️ 增加复杂度
- ⚠️ 学习成本

**建议：** 引入服务层，但保持简单

---

### 3. 功能级资源控制 vs 模块级

**功能级优势：**
- ✅ 更灵活
- ✅ 更精细

**功能级劣势：**
- ⚠️ 配置复杂
- ⚠️ 难以理解

**建议：** 提供两种模式：
- 简单模式：模块级（默认）
- 高级模式：功能级（可选）

---

### 4. 测试的投入

**测试优势：**
- ✅ 保证质量
- ✅ 易于重构

**测试劣势：**
- ⚠️ 开发时间增加
- ⚠️ 维护成本

**建议：** 
- MVP 阶段：基础测试
- V1.0 阶段：完整测试

---

## 📊 性能预估

### 64M 小鸡（minimal）

```
内存占用：
- manager.sh: 5MB
- SQLite: 2MB
- core 模块: 3MB
- singbox 模块: 10MB
- sing-box 服务: 20MB
总计: ~40MB（剩余 24MB）
```

### 256M 机器（standard）

```
内存占用：
- 基础: 40MB
- argo 模块: 15MB
- cloudflared: 30MB
- monitor 模块: 10MB
总计: ~95MB（剩余 161MB）
```

### 512M+ 机器（full）

```
内存占用：
- 基础: 95MB
- relay 模块: 20MB
- stats 模块: 15MB
- webui 模块: 50MB
总计: ~180MB（剩余 332MB）
```

---

## 🚀 实施建议

### Phase 1: 核心重构（3-4 天）
1. 引入 SQLite
2. 实现服务层
3. 重构核心调度器
4. 基础测试

### Phase 2: 模块迁移（3-4 天）
1. 迁移 core 模块
2. 迁移 nodes 模块
3. 迁移 singbox 模块
4. 集成测试

### Phase 3: 新功能（4-5 天）
1. 动态资源管理
2. 事务支持
3. 依赖解析
4. 完整测试

### Phase 4: 扩展模块（5-7 天）
1. argo 模块
2. relay 模块
3. 其他模块
4. 全面测试

---

## 💭 开放问题

1. **SQLite 是否必要？**
   - 对于 64M 小鸡，SQLite 会不会太重？
   - 是否可以提供"纯 YAML 模式"作为备选？

2. **服务层的粒度？**
   - 是否需要更多服务（如 DeployService, MonitorService）？
   - 还是保持简单，只有核心服务？

3. **测试的优先级？**
   - MVP 阶段是否需要完整测试？
   - 还是先快速迭代，后期补测试？

4. **向后兼容性？**
   - 如果用户已经有旧版本的配置，如何迁移？
   - 是否需要提供迁移工具？

---

## 📝 总结

这个优化方案相比初版：

**更强大：**
- SQLite 提供更好的性能和并发
- 服务层提供更好的代码复用
- 功能级资源控制更灵活

**更复杂：**
- 架构层次更多
- 学习曲线更陡
- 开发时间更长

**权衡建议：**
- MVP 阶段：保持简单，使用初版设计
- V1.0 阶段：引入 SQLite 和服务层
- V2.0 阶段：完整的优化方案

---

**现在需要你的反馈：**

1. 这个优化方案你觉得怎么样？
2. 哪些优化是必要的？哪些可以延后？
3. 有没有过度设计的地方？
4. 还有什么需要考虑的？

🌸
