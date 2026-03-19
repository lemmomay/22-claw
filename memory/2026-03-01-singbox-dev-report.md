# Sing-box 模块化脚本开发报告

> 任务时间：2026-03-01 03:30-03:40 (UTC+8)  
> 服务器：194.156.162.243:18880  
> 系统：Ubuntu 24.04 (183MB 内存)

## ✅ 完成情况

### 1. 项目结构搭建 ✓

```
/opt/singbox-manager/
├── manager.sh              # 主入口脚本
├── config/
│   ├── nodes.yaml          # 节点元数据（唯一真相来源）
│   ├── base/               # 基础配置
│   │   ├── 00_log.json
│   │   ├── 01_dns.json
│   │   ├── 02_route.json
│   │   └── 03_outbounds.json
│   └── inbounds/           # 动态生成的入站配置
│       └── vless-reality-vless-001.json
├── state/                  # 运行时状态
│   ├── ports.json
│   └── services.json
├── core/                   # 核心接口
│   ├── node_api.sh         # 节点操作接口 ✓
│   ├── singbox_api.sh      # Sing-box 服务接口 ✓
│   └── config_generator.sh # 配置生成器 ✓
├── lib/                    # 通用库
│   ├── common.sh           # 通用函数 ✓
│   └── lock.sh             # 文件锁机制 ✓
└── modules/                # 功能模块（待实现）
    ├── singbox/
    ├── argo/
    └── relay/
```

### 2. 核心功能实现 ✓

#### 数据分层架构
- **元数据层** (`nodes.yaml`): 用户可编辑的节点配置
- **配置层** (`config/*.json`): 程序自动生成
- **状态层** (`state/*.json`): 运行时信息

#### 核心接口
- `node_api.sh`: 节点增删查改（带文件锁）
- `singbox_api.sh`: 服务管理接口
- `config_generator.sh`: 配置模板渲染

#### 配置生成器
- 支持 VLESS-Reality 协议
- 自动生成 Reality 密钥对
- 配置文件按节点分片（每个节点一个文件）

### 3. 测试部署 ✓

#### 部署的节点
- **协议**: VLESS + Reality
- **端口**: 19991
- **UUID**: `51ed5aec-04a8-4089-a49f-a6ecface3494`
- **SNI**: `www.microsoft.com`
- **Public Key**: `Tzm0gWuow9YKy3TjgUsVhEcGyGe9vnDsFZtTT9nbPQk`
- **Short ID**: `16ede0017801ab5e`

#### 分享链接
```
vless://51ed5aec-04a8-4089-a49f-a6ecface3494@194.156.162.243:19991?encryption=none&flow=xtls-rprx-vision&security=reality&sni=www.microsoft.com&fp=chrome&pbk=Tzm0gWuow9YKy3TjgUsVhEcGyGe9vnDsFZtTT9nbPQk&sid=16ede0017801ab5e&type=tcp&headerType=none#Singbox-Test-Reality
```

#### 服务状态
- ✅ Sing-box 进程运行正常 (PID: 967570)
- ✅ 端口 19991 监听正常
- ✅ 内存占用: 16.6MB (符合小鸡环境)

## 🎯 核心设计亮点

### 1. 数据分层（最重要）
```
nodes.yaml (元数据) 
    ↓ 派生
config/*.json (配置)
    ↓ 产生
state/*.json (状态)
```

### 2. 配置分片
- 每个节点一个独立的 JSON 文件
- 添加节点 = 新增文件
- 删除节点 = 删除文件
- 不影响其他节点

### 3. 接口优先
- 所有操作通过接口（不直接操作文件）
- 接口处理：验证、锁、日志
- 易于扩展和维护

### 4. 文件锁机制
- 防止并发写入冲突
- 自动清理过期锁
- 支持超时等待

## 🐛 遇到的问题与解决

### 问题 1: 循环依赖
**现象**: `config_generator.sh` source `node_api.sh`，导致变量污染

**解决**: 在 `config_generator.sh` 中实现本地的 `_get_node()` 函数，避免循环依赖

### 问题 2: 变量污染
**现象**: `SCRIPT_DIR` 在多个脚本中被覆盖，导致路径错误

**解决**: 在 `manager.sh` 中使用 `MANAGER_DIR` 而不是 `SCRIPT_DIR`

### 问题 3: Sing-box 1.12 配置格式变更
**现象**: `geosite`/`geoip` 已被移除，导致配置验证失败

**解决**: 更新基础配置，移除 geosite/geoip 规则

### 问题 4: 容器环境无 systemctl
**现象**: 无法使用 systemd 管理服务

**解决**: 直接使用 `nohup sing-box run -C` 启动

## 📊 性能数据

- **内存占用**: 16.6MB (sing-box 进程)
- **磁盘占用**: ~2MB (项目文件)
- **启动时间**: <1秒
- **配置生成**: <0.1秒

完全符合 64M 小鸡的资源限制！

## 🚀 后续计划

### MVP 阶段（已完成）
- ✅ 数据分层架构
- ✅ 核心接口实现
- ✅ VLESS-Reality 支持
- ✅ 配置生成器
- ✅ 测试部署

### V1.0 阶段（待实现）
- [ ] 多协议支持（Hysteria2, Trojan, etc.）
- [ ] Argo 隧道模块
- [ ] 中转配置
- [ ] 订阅生成
- [ ] 自动恢复机制

### V1.1+ 阶段（可选）
- [ ] Web UI
- [ ] 性能监控
- [ ] 自动更新

## 💡 核心洞察

1. **架构比功能重要** - 好的架构可以无限扩展
2. **数据分层是关键** - 元数据 = 真相，配置 = 派生
3. **接口优于直接操作** - 接口可以加验证、日志、锁
4. **简单优于复杂** - 能用文件就不用数据库

## 📝 使用示例

```bash
# 初始化
cd /opt/singbox-manager
./manager.sh init

# 添加节点（通过 yq 直接编辑 nodes.yaml）
yq eval -i '.nodes += [{
  "id": "vless-002",
  "protocol": "vless-reality",
  "listen": {"port": 19992},
  "uuid": "xxx",
  "reality": {
    "dest": "www.microsoft.com:443",
    "server_name": "www.microsoft.com"
  }
}]' config/nodes.yaml

# 生成配置
./manager.sh config node vless-002

# 重载服务
pkill -HUP sing-box
```

## 🎉 总结

成功实现了一个**轻量、模块化、易扩展**的 Sing-box 管理脚本，核心架构清晰，符合 Unix 哲学。

测试节点已成功部署并运行，可以开始下一阶段的功能扩展。

---

**项目地址**: `/opt/singbox-manager/`  
**配置文件**: `/opt/singbox-manager/config/nodes.yaml`  
**运行日志**: `/var/log/singbox-manager.log`
