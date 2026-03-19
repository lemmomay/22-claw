# Sing-box 模块化重构计划

## 📊 fscarmen 脚本分析

### 基本信息
- **文件大小**: 195KB
- **总行数**: 3600+ 行
- **函数数量**: 52 个
- **版本**: v1.3.4 (2026.02.08)

---

## 🔍 函数分类与模块划分

### 1. 工具函数模块 (lib/utils.sh)
```bash
287:warning      # 红色警告输出
288:error        # 红色错误输出并退出
289:info         # 绿色信息输出
290:hint         # 黄色提示输出
291:reading      # 读取用户输入
292:text         # 多语言文本处理
359:asc          # ASCII 计数器
```

**功能**: 基础工具函数，输出格式化、用户交互、文本处理

---

### 2. 检查验证模块 (lib/check.sh)
```bash
295:check_cdn              # 检查 CDN 可用性
304:check_chatgpt          # 检查 ChatGPT 可用性
800:check_root             # 检查 root 权限
805:check_arch             # 检查系统架构
824:check_brutal           # 检查 Brutal 支持
830:check_install          # 检查已安装的组件
1043:check_system_info     # 检查系统信息
1097:get_sing_box_version  # 获取 sing-box 版本
1181:check_port_hopping_nat # 检查端口跳跃 NAT
1200:check_system_ip       # 检查系统 IP
1399:check_dependencies    # 检查依赖
1460:check_nginx           # 检查 nginx
```

**功能**: 系统环境检查、依赖验证、版本检测

---

### 3. 用户交互模块 (lib/input.sh)
```bash
347:select_language        # 选择语言
368:input_cdn              # 输入 CDN 选择
388:change_cdn             # 修改 CDN
607:input_nginx_port       # 输入 nginx 端口
629:input_hopping_port     # 输入端口跳跃范围
660:input_reality_key      # 输入 Reality 密钥
676:input_argo_auth        # 输入 Argo 认证
736:change_argo            # 修改 Argo 配置
1225:input_start_port      # 输入起始端口
3287:change_start_port     # 修改起始端口
3306:change_protocols      # 修改协议
```

**功能**: 用户输入处理、配置修改交互

---

### 4. 配置生成模块 (lib/config.sh)
```bash
1472:export_argo_json_file    # 生成 Argo JSON 配置
1488:ssl_certificate          # 生成 SSL 证书
1538:export_nginx_conf_file   # 生成 nginx 配置
2511:fetch_nodes_value        # 获取节点配置值
2563:fetch_quicktunnel_domain # 获取 Argo 临时域名
2644:export_list              # 生成订阅列表
```

**功能**: 配置文件生成、证书管理、订阅导出

---

### 5. 服务管理模块 (lib/service.sh)
```bash
986:cmd_systemctl             # systemctl 命令封装
2367:depend                   # systemd 依赖定义
2379:start_pre                # 服务启动前钩子
2397:stop_post                # 服务停止后钩子
2410:stop                     # 停止服务
2453:argo_systemd             # Argo systemd 配置
2471:depend                   # Argo 依赖定义
2476:start_pre                # Argo 启动前钩子
```

**功能**: 服务启动/停止、systemd 集成、进程管理

---

### 6. 网络配置模块 (lib/network.sh)
```bash
1116:add_port_hopping_nat     # 添加端口跳跃 NAT 规则
1514:firewall_configuration   # 防火墙配置
```

**功能**: 防火墙规则、NAT 配置、端口管理

---

### 7. Argo 隧道模块 (modules/argo.sh)
```bash
417:create_argo_tunnel        # 创建 Argo 隧道
676:input_argo_auth           # Argo 认证输入
736:change_argo               # 修改 Argo 配置
1472:export_argo_json_file    # 生成 Argo 配置
2453:argo_systemd             # Argo 服务配置
2563:fetch_quicktunnel_domain # 获取临时域名
```

**功能**: Argo 隧道创建、配置、域名获取

---

### 8. 主菜单模块 (manager.sh)
```bash
3275:create_shortcut          # 创建快捷方式
3679:uninstall                # 卸载
3697:version                  # 显示版本
3747:menu_setting             # 设置菜单
3824:menu                     # 主菜单
```

**功能**: 主程序入口、菜单系统、快捷命令

---

## 🎯 核心流程分析

### VLESS-Reality 部署流程

根据 fscarmen 脚本，部署一个 VLESS-Reality 节点需要：

1. **环境检查**
   ```bash
   check_root()           # 检查 root 权限
   check_arch()           # 检查系统架构
   check_dependencies()   # 检查依赖
   check_system_ip()      # 获取 IP 地址
   ```

2. **生成配置**
   ```bash
   # 生成 Reality 密钥对
   sing-box generate reality-keypair
   
   # 生成 UUID
   cat /proc/sys/kernel/random/uuid
   
   # 生成配置文件
   cat > /etc/sing-box/conf/11_vless-reality_inbounds.json << EOF
   {
     "inbounds": [{
       "type": "vless",
       "listen_port": 端口,
       "users": [{"uuid": "UUID"}],
       "tls": {
         "reality": {
           "private_key": "私钥",
           "short_id": [""]
         }
       }
     }]
   }
   EOF
   ```

3. **启动服务**
   ```bash
   cmd_systemctl("restart", "sing-box")
   ```

4. **生成分享链接**
   ```bash
   vless://UUID@IP:PORT?security=reality&sni=SNI&pbk=公钥&type=tcp#节点名
   ```

---

## 📦 模块化目录结构设计

```
/opt/singbox-manager/
├── manager.sh                 # 主入口
├── lib/
│   ├── utils.sh              # 工具函数（输出、文本处理）
│   ├── check.sh              # 检查验证函数
│   ├── input.sh              # 用户交互函数
│   ├── config.sh             # 配置生成函数
│   ├── service.sh            # 服务管理函数
│   └── network.sh            # 网络配置函数
├── protocols/
│   ├── vless-reality.sh      # VLESS-Reality 协议
│   ├── hysteria2.sh          # Hysteria2 协议
│   └── trojan.sh             # Trojan 协议
└── modules/
    └── argo.sh               # Argo 隧道模块（可选）
```

---

## 🚀 MVP 实现计划

### 第一步：最小可用版本（只实现 VLESS-Reality）

**需要的函数：**
```bash
# lib/utils.sh
- info()
- error()
- warning()

# lib/check.sh
- check_root()
- check_arch()
- check_system_ip()

# lib/config.sh
- generate_vless_reality_config()

# lib/service.sh
- restart_service()

# protocols/vless-reality.sh
- deploy_vless_reality()
- generate_share_link()

# manager.sh
- main()
```

**实现步骤：**
1. 从 fscarmen 脚本中提取上述函数
2. 按模块组织到不同文件
3. 实现 manager.sh 主入口
4. 测试部署流程

---

## ✅ 下一步行动

- [x] 分析 fscarmen 脚本函数结构
- [x] 提取核心函数列表
- [x] 绘制函数分类图
- [ ] 开始提取代码到模块文件

**预计完成时间**: 第 2-3 次心跳
