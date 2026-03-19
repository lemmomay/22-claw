# Sing-box 模块化管理器 - 使用文档

## 🎉 MVP 版本已完成！

基于 fscarmen sing-box.sh 重构的模块化管理器，目前支持 VLESS-Reality 协议。

---

## 📦 安装位置

```bash
/opt/singbox-modular/
```

---

## 🚀 快速开始

### 1. 部署 VLESS-Reality 节点

```bash
cd /opt/singbox-modular
./manager.sh deploy vless 19993
```

**输出示例：**
```
检测到公网 IP: 154.83.85.124
开始部署 VLESS-Reality 节点...
✅ VLESS-Reality 配置已生成
✅ sing-box 服务启动成功

=========================================
节点部署成功！
=========================================
端口: 19993
UUID: 7644b622-0679-4a83-9d41-10309648b11b
Public Key: ecIHnHZQxvR3NNktT-6MYk3fggHm2R0RlmR-oV91hjg
SNI: www.apple.com

分享链接:
vless://...
=========================================
```

### 2. 查看服务状态

```bash
./manager.sh status
```

### 3. 停止服务

```bash
./manager.sh stop
```

### 4. 查看日志

```bash
./manager.sh logs
```

---

## 📁 文件结构

```
/opt/singbox-modular/
├── manager.sh                    # 主入口
├── lib/
│   ├── utils.sh                 # 工具函数（颜色输出、UUID生成等）
│   ├── check.sh                 # 检查验证（权限、IP、端口等）
│   └── service.sh               # 服务管理（启动、停止、状态）
└── protocols/
    └── vless-reality.sh         # VLESS-Reality 协议实现
```

---

## 🎯 核心特性

- ✅ **模块化设计** - 每个功能独立成模块
- ✅ **代码复用** - 直接从 fscarmen 脚本提取成熟代码
- ✅ **简单易用** - 一条命令部署节点
- ✅ **自动配置** - 自动生成 UUID、密钥对、配置文件
- ✅ **服务管理** - 集成 systemd 服务管理

---

## 🔧 技术细节

### 配置文件位置

```bash
/etc/sing-box/conf/
├── 00_log.json                  # 日志配置
├── 01_outbound.json             # 出站配置
└── 11_vless-reality_inbounds.json  # VLESS-Reality 入站配置
```

### Reality 密钥生成

使用 sing-box 内置命令：
```bash
sing-box generate reality-keypair
```

### UUID 生成

使用内核随机源：
```bash
cat /proc/sys/kernel/random/uuid
```

---

## 🎯 下一步计划

- [ ] 添加节点列表功能
- [ ] 添加节点删除功能
- [ ] 支持 Hysteria2 协议
- [ ] 支持 Trojan 协议
- [ ] 添加配置持久化
- [ ] 添加交互式菜单

---

## 📝 与 fscarmen 原脚本的对比

| 特性 | fscarmen 原脚本 | 模块化版本 |
|------|----------------|-----------|
| 文件大小 | 195KB (3600+ 行) | ~1KB × 5 个文件 |
| 代码组织 | 单文件 | 模块化 |
| 功能加载 | 全部加载 | 按需加载 |
| 维护难度 | 高 | 低 |
| 扩展性 | 困难 | 容易 |
| 学习曲线 | 陡峭 | 平缓 |

---

## 🙏 致谢

本项目基于 [fscarmen/sing-box](https://github.com/fscarmen/sing-box) 重构，感谢 fscarmen 的优秀工作！
