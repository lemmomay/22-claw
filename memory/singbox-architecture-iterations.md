# Sing-box 模块化架构设计迭代记录

本文档记录 Sing-box 管理系统的架构设计思考过程，通过分析 fscarmen 的专业实现，逐步构建清晰、易用、可扩展的模块化系统。

---

## 迭代 1 (2026-03-01 17:49)

### 本次分析的模块
**配置文件生成模块 (sing-box_json)**

### fscarmen 的实现方式

**核心设计思路：**
1. **分层配置文件** - 将配置拆分成多个独立的 JSON 文件：
   - `00_log.json` - 日志配置
   - `01_outbounds.json` - 出站规则
   - `02_endpoints.json` - WireGuard 端点配置
   - `03_route.json` - 路由规则
   - `XX_inbounds.json` - 各协议的入站配置（按协议分文件）

2. **目录结构清晰**：
```bash
/etc/sing-box/
├── conf/           # 配置文件目录（模块化 JSON）
├── logs/           # 日志目录
├── subscribe/      # 订阅文件目录
├── sing-box        # 主程序
└── cloudflared     # Argo 程序
```

3. **配置生成逻辑**：
   - 使用 `cat > file << EOF` 生成静态配置
   - 通过变量替换实现动态内容
   - 新安装 vs 修改配置的判断（`IS_CHANGE` 参数）

4. **关键代码片段**：
```bash
sing-box_json() {
  local IS_CHANGE=$1
  mkdir -p ${WORK_DIR}/conf ${WORK_DIR}/logs ${WORK_DIR}/subscribe
  
  if [ "$IS_CHANGE" = 'change' ]; then
    DIR=${WORK_DIR}  # 修改配置时使用工作目录
  else
    DIR=$TEMP_DIR    # 新安装时使用临时目录
    # 生成各个配置文件...
  fi
}
```

### 提炼的设计原则

1. **单一职责** - 每个配置文件只负责一个功能模块
2. **目录分离** - 配置、日志、订阅、程序分开存放
3. **状态感知** - 区分新安装和修改配置两种场景
4. **原子操作** - 先在临时目录生成，验证后再移动到工作目录
5. **可扩展性** - 新增协议只需添加对应的 inbound 配置文件

### 我们的接口设计

```bash
# 配置生成模块接口
generate_config() {
  local mode=$1        # "new" 或 "update"
  local protocol=$2    # 协议类型
  local params=$3      # JSON 格式的参数
  
  # 1. 验证参数
  validate_params "$protocol" "$params" || return 1
  
  # 2. 根据模式选择目标目录
  local target_dir
  [[ "$mode" == "new" ]] && target_dir="$TEMP_DIR" || target_dir="$WORK_DIR"
  
  # 3. 生成配置文件
  generate_base_config "$target_dir"           # 基础配置（log, outbound, route）
  generate_protocol_config "$protocol" "$params" "$target_dir"  # 协议配置
  
  # 4. 验证配置
  validate_config "$target_dir" || {
    rollback_config
    return 1
  }
  
  # 5. 应用配置（仅新安装时）
  [[ "$mode" == "new" ]] && apply_config "$target_dir" "$WORK_DIR"
  
  return 0
}

# 示例调用
generate_config "new" "hysteria2" '{"port": 8881, "password": "xxx"}'
```

**模块化函数设计：**
```bash
# 基础配置生成
generate_base_config() {
  local dir=$1
  mkdir -p "$dir/conf" "$dir/logs" "$dir/subscribe"
  
  generate_log_config "$dir/conf/00_log.json"
  generate_outbound_config "$dir/conf/01_outbounds.json"
  generate_route_config "$dir/conf/03_route.json"
}

# 协议配置生成（可插拔）
generate_protocol_config() {
  local protocol=$1
  local params=$2
  local dir=$3
  
  case "$protocol" in
    hysteria2)
      generate_hysteria2_inbound "$params" "$dir/conf/10_hysteria2_inbounds.json"
      ;;
    reality)
      generate_reality_inbound "$params" "$dir/conf/11_reality_inbounds.json"
      ;;
    # 更多协议...
  esac
}

# 配置验证
validate_config() {
  local dir=$1
  # 使用 sing-box check 命令验证配置
  sing-box check -c "$dir/conf" || return 1
  return 0
}
```

### 关键收获

1. **配置文件编号** - 使用数字前缀控制加载顺序（00, 01, 02...）
2. **临时目录策略** - 先在 `/tmp` 生成，验证无误后再移动到 `/etc`
3. **目录即配置** - sing-box 支持读取整个目录的 JSON 文件并合并
4. **错误处理** - 每个步骤都要有验证和回滚机制

### 下次迭代重点

**服务管理模块 (systemd 集成)**
- 分析 fscarmen 如何生成 systemd service 文件
- 学习服务启动、停止、重启的最佳实践
- 研究服务状态检测和自动恢复机制

---

## 迭代 2 (2026-03-01 17:59)

### 本次分析的模块
**服务管理模块 (systemd/OpenRC 集成)**

### fscarmen 的实现方式

**核心设计思路：**
1. **跨平台服务管理** - 同时支持 systemd (主流 Linux) 和 OpenRC (Alpine)
2. **动态服务文件生成** - 根据配置动态生成守护进程文件
3. **依赖管理** - 处理 Nginx、Argo 等服务的启动顺序
4. **优雅降级** - 启动失败时自动重试，提供详细错误信息

**关键代码片段：**

```bash
# 服务文件路径判断
if [ "$SYSTEM" = 'Alpine' ]; then
  ARGO_DAEMON_FILE='/etc/init.d/argo'
  SINGBOX_DAEMON_FILE='/etc/init.d/sing-box'
else
  ARGO_DAEMON_FILE='/etc/systemd/system/argo.service'
  SINGBOX_DAEMON_FILE='/etc/systemd/system/sing-box.service'
fi

# Sing-box systemd 服务生成
sing-box_systemd() {
  if [ "$SYSTEM" = 'Alpine' ]; then
    # OpenRC 服务脚本
    cat > ${SINGBOX_DAEMON_FILE} << EOF
#!/sbin/openrc-run
name="sing-box"
command="${WORK_DIR}/sing-box"
command_args="run -C ${WORK_DIR}/conf"
pidfile="/var/run/\${RC_SVCNAME}.pid"
command_background="yes"
depend() {
    need net
    after net
}
EOF
    chmod +x ${SINGBOX_DAEMON_FILE}
  else
    # systemd 服务文件
    cat > ${SINGBOX_DAEMON_FILE} << EOF
[Unit]
Description=sing-box service
After=network.target

[Service]
Type=simple
ExecStart=${WORK_DIR}/sing-box run -C ${WORK_DIR}/conf
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
  fi
}

# 服务启动流程
cmd_systemctl enable sing-box
sleep 2
if cmd_systemctl status sing-box &>/dev/null; then
  info "Sing-box 启动成功"
else
  error "Sing-box 启动失败"
  cmd_systemctl restart sing-box  # 失败后重试
fi
```

**服务状态检测：**
```bash
check_install() {
  if [ "$SYSTEM" = 'Alpine' ]; then
    # OpenRC 状态检测
    [ "$(rc-service sing-box status)" = 'started' ] && STATUS[0]='开启'
  else
    # systemd 状态检测
    [ "$(systemctl is-active sing-box)" = 'active' ] && STATUS[0]='开启'
  fi
}
```

### 提炼的设计原则

1. **平台抽象** - 统一的接口，底层根据系统类型选择实现
2. **配置即代码** - 服务文件通过脚本动态生成，而非手动编辑
3. **依赖声明** - 明确服务间的依赖关系（network → sing-box → nginx）
4. **健壮性优先** - 启动失败自动重试，提供清晰的状态反馈
5. **最小权限** - 使用 `NoNewPrivileges=yes` 限制权限提升
6. **日志分离** - 标准输出/错误输出重定向到独立日志文件

### 我们的接口设计

```bash
# 服务管理模块接口
service_manager() {
  local action=$1      # start|stop|restart|status|enable|disable
  local service=$2     # sing-box|argo|nginx
  
  # 1. 检测系统类型
  detect_init_system
  
  # 2. 根据 action 执行对应操作
  case "$action" in
    start|stop|restart|status)
      service_control "$action" "$service"
      ;;
    enable|disable)
      service_autostart "$action" "$service"
      ;;
    install)
      service_install "$service"
      ;;
    uninstall)
      service_uninstall "$service"
      ;;
  esac
}

# 系统检测
detect_init_system() {
  if [ -d /run/systemd/system ]; then
    INIT_SYSTEM="systemd"
    SERVICE_DIR="/etc/systemd/system"
  elif [ -d /etc/init.d ]; then
    INIT_SYSTEM="openrc"
    SERVICE_DIR="/etc/init.d"
  else
    error "不支持的 init 系统"
    return 1
  fi
}

# 服务控制（统一接口）
service_control() {
  local action=$1
  local service=$2
  
  case "$INIT_SYSTEM" in
    systemd)
      systemctl "$action" "$service"
      ;;
    openrc)
      rc-service "$service" "$action"
      ;;
  esac
  
  return $?
}

# 服务安装（生成配置文件）
service_install() {
  local service=$1
  
  case "$service" in
    sing-box)
      generate_singbox_service
      ;;
    argo)
      generate_argo_service
      ;;
    nginx)
      generate_nginx_service
      ;;
  esac
  
  # 重载配置
  [ "$INIT_SYSTEM" = "systemd" ] && systemctl daemon-reload
  [ "$INIT_SYSTEM" = "openrc" ] && chmod +x "$SERVICE_DIR/$service"
}

# Sing-box 服务文件生成（模板化）
generate_singbox_service() {
  local template_file="templates/sing-box.${INIT_SYSTEM}.tpl"
  local output_file="$SERVICE_DIR/sing-box"
  
  # 使用模板引擎替换变量
  sed -e "s|{{WORK_DIR}}|$WORK_DIR|g" \
      -e "s|{{LOG_DIR}}|$LOG_DIR|g" \
      "$template_file" > "$output_file"
  
  # 验证生成的文件
  validate_service_file "$output_file" || {
    error "服务文件生成失败"
    return 1
  }
}

# 服务状态检测（带超时）
service_wait_ready() {
  local service=$1
  local timeout=${2:-10}  # 默认 10 秒超时
  local elapsed=0
  
  while [ $elapsed -lt $timeout ]; do
    if service_is_active "$service"; then
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  
  return 1
}

# 服务健康检查
service_is_active() {
  local service=$1
  
  case "$INIT_SYSTEM" in
    systemd)
      [ "$(systemctl is-active $service)" = "active" ]
      ;;
    openrc)
      rc-service "$service" status | grep -q "started"
      ;;
  esac
}
```

**使用示例：**
```bash
# 安装并启动服务
service_manager install sing-box
service_manager enable sing-box
service_manager start sing-box

# 等待服务就绪
if service_wait_ready sing-box 15; then
  echo "Sing-box 启动成功"
else
  echo "Sing-box 启动超时"
  service_manager restart sing-box  # 重试
fi

# 检查状态
service_manager status sing-box
```

### 关键收获

1. **cmd_systemctl 抽象** - fscarmen 使用统一函数封装不同 init 系统的命令
2. **服务依赖链** - network → sing-box → nginx → argo，通过 `depend()` 或 `After=` 声明
3. **PID 文件管理** - OpenRC 需要手动管理 PID 文件，systemd 自动处理
4. **启动前检查** - `start_pre()` 确保目录存在、权限正确
5. **优雅关闭** - `stop_post()` 处理子进程（如 nginx）的清理
6. **失败重试策略** - `Restart=on-failure` + `RestartSec=10` 自动恢复

### 下次迭代重点

**节点信息导出模块 (订阅链接生成)**
- 分析 fscarmen 如何生成各客户端的订阅链接
- 学习 Base64 编码、JSON 模板、二维码生成
- 研究多协议节点的统一导出格式

---

---

## 迭代 3 (2026-03-01 18:09)

### 本次分析的模块
**节点信息导出模块 (订阅链接生成)**

### fscarmen 的实现方式

**核心设计思路：**
1. **多客户端适配** - 生成 Clash、V2rayN、NekoBox、ShadowRocket、SFI/SFA/SFM 等多种格式
2. **订阅地址统一** - 通过 Nginx 或 Argo 提供 HTTP(S) 订阅服务
3. **动态模板渲染** - 根据已安装协议动态生成订阅内容
4. **Base64 编码** - 标准 URI 格式 + Base64 编码适配不同客户端
5. **证书指纹验证** - 自签证书通过 SHA256/Base64 指纹替代 AllowInsecure

**关键代码片段：**

```bash
export_list() {
  IS_INSTALL=$1
  check_install  # 检测已安装的协议
  
  # IPv6 地址处理
  if [[ "$SERVER_IP" =~ : ]]; then
    SERVER_IP_1="[$SERVER_IP]"      # 用于 URL
    SERVER_IP_2="[[$SERVER_IP]]"    # 用于某些特殊格式
  else
    SERVER_IP_1="$SERVER_IP"
    SERVER_IP_2="$SERVER_IP"
  fi
  
  # 订阅地址选择（Argo 优先）
  [[ "$ARGO_TYPE" = 'is_token_argo' || "$ARGO_TYPE" = 'is_json_argo' ]] && \
    SUBSCRIBE_ADDRESS="https://$ARGO_DOMAIN" || \
    SUBSCRIBE_ADDRESS="http://${SERVER_IP_1}:${PORT_NGINX}"
  
  # 获取自签证书指纹（用于 Hysteria2/Trojan 的 pinnedPeerCertSha256）
  SELF_SIGNED_FINGERPRINT_SHA256=$(openssl x509 -fingerprint -noout -sha256 \
    -in ${WORK_DIR}/cert/cert.pem | awk -F '=' '{print $NF}')
  SELF_SIGNED_FINGERPRINT_BASE64=$(openssl x509 -in ${WORK_DIR}/cert/cert.pem \
    -pubkey -noout | openssl pkey -pubin -outform der | \
    openssl dgst -sha256 -binary | openssl enc -base64)
  
  # 生成 Clash 订阅（YAML 格式）
  local CLASH_SUBSCRIBE='proxies:'
  
  # Reality 节点
  [ -n "$PORT_XTLS_REALITY" ] && CLASH_SUBSCRIBE+="
  - {name: \"${NODE_NAME[11]} ${NODE_TAG[0]}\", 
     type: vless, 
     server: ${SERVER_IP}, 
     port: ${PORT_XTLS_REALITY}, 
     uuid: ${UUID[11]}, 
     network: tcp, 
     tls: true, 
     flow: xtls-rprx-vision,
     servername: ${TLS_SERVER[11]}, 
     client-fingerprint: firefox, 
     reality-opts: {
       public-key: ${REALITY_PUBLIC[11]}, 
       short-id: \"\"
     }
  }"
  
  # Hysteria2 节点（带端口跳跃）
  if [ -n "$PORT_HYSTERIA2" ]; then
    [[ -n "$PORT_HOPPING_START" && -n "$PORT_HOPPING_END" ]] && \
      local CLASH_HOPPING=" ports: ${PORT_HOPPING_START}-${PORT_HOPPING_END}, HopInterval: 60,"
    
    CLASH_SUBSCRIBE+="
  - {name: \"${NODE_NAME[12]} ${NODE_TAG[1]}\", 
     type: hysteria2, 
     server: ${SERVER_IP}, 
     port: ${PORT_HYSTERIA2},
     ${CLASH_HOPPING}
     up: \"200 Mbps\", 
     down: \"1000 Mbps\", 
     password: ${UUID[12]}, 
     sni: ${TLS_SERVER_DEFAULT}, 
     skip-cert-verify: false, 
     fingerprint: ${SELF_SIGNED_FINGERPRINT_SHA256}
  }"
  fi
  
  # 写入订阅文件
  echo "$CLASH_SUBSCRIBE" > ${WORK_DIR}/subscribe/clash.yaml
  
  # 生成 V2rayN URI（Base64 编码）
  local V2RAYN_LINKS=""
  [ -n "$PORT_XTLS_REALITY" ] && V2RAYN_LINKS+="vless://${UUID[11]}@${SERVER_IP}:${PORT_XTLS_REALITY}?encryption=none&flow=xtls-rprx-vision&security=reality&sni=${TLS_SERVER[11]}&fp=firefox&pbk=${REALITY_PUBLIC[11]}&type=tcp#${NODE_NAME[11]}%20${NODE_TAG[0]}\n"
  
  echo -e "$V2RAYN_LINKS" | base64 -w 0 > ${WORK_DIR}/subscribe/v2rayn.txt
}
```

**订阅服务配置（Nginx）：**
```nginx
server {
  listen ${PORT_NGINX};
  root ${WORK_DIR}/subscribe;
  
  location / {
    autoindex on;
    add_header Content-Type 'text/plain; charset=utf-8';
  }
  
  # 自适应订阅（根据 User-Agent 返回不同格式）
  location /sub {
    if ($http_user_agent ~* "clash") {
      rewrite ^/sub$ /clash.yaml last;
    }
    if ($http_user_agent ~* "v2ray") {
      rewrite ^/sub$ /v2rayn.txt last;
    }
    # 默认返回通用格式
    rewrite ^/sub$ /universal.txt last;
  }
}
```

### 提炼的设计原则

1. **客户端检测** - 通过 User-Agent 自动适配订阅格式
2. **证书安全** - 使用 pinnedPeerCertSha256 替代 skip-cert-verify，防御 MITM 攻击
3. **协议隔离** - 每个协议独立生成 URI，便于调试和维护
4. **订阅聚合** - 提供统一订阅地址 `/sub`，自动分发不同格式
5. **IPv6 兼容** - 地址格式化处理（`[::1]` vs `::1`）
6. **端口跳跃支持** - Hysteria2 的 Port Hopping 配置
7. **模板化生成** - 使用变量替换而非硬编码

### 我们的接口设计

```bash
# 订阅生成模块接口
generate_subscription() {
  local output_dir=$1      # 输出目录
  local server_ip=$2       # 服务器 IP
  local protocols=$3       # 已安装协议列表（JSON 数组）
  
  # 1. 初始化订阅目录
  mkdir -p "$output_dir"
  
  # 2. 获取证书指纹
  local cert_sha256=$(get_cert_fingerprint sha256)
  local cert_base64=$(get_cert_fingerprint base64)
  
  # 3. 生成各客户端订阅
  generate_clash_subscription "$output_dir/clash.yaml" "$protocols"
  generate_v2rayn_subscription "$output_dir/v2rayn.txt" "$protocols"
  generate_shadowrocket_subscription "$output_dir/shadowrocket.txt" "$protocols"
  generate_singbox_subscription "$output_dir/singbox.json" "$protocols"
  
  # 4. 生成通用订阅（包含所有节点）
  generate_universal_subscription "$output_dir/universal.txt" "$protocols"
  
  # 5. 配置 Nginx 订阅服务
  configure_nginx_subscription "$output_dir"
  
  # 6. 输出订阅地址
  print_subscription_urls
}

# 证书指纹提取
get_cert_fingerprint() {
  local format=$1  # sha256 或 base64
  local cert_file="${WORK_DIR}/cert/cert.pem"
  
  case "$format" in
    sha256)
      openssl x509 -fingerprint -noout -sha256 -in "$cert_file" | \
        awk -F '=' '{print $NF}'
      ;;
    base64)
      openssl x509 -in "$cert_file" -pubkey -noout | \
        openssl pkey -pubin -outform der | \
        openssl dgst -sha256 -binary | \
        openssl enc -base64
      ;;
  esac
}

# Clash 订阅生成（模板化）
generate_clash_subscription() {
  local output_file=$1
  local protocols=$2  # JSON: [{"type":"reality","port":8881,"uuid":"xxx",...}]
  
  local content="proxies:"
  
  # 遍历协议列表
  echo "$protocols" | jq -c '.[]' | while read -r proto; do
    local type=$(echo "$proto" | jq -r '.type')
    
    case "$type" in
      reality)
        content+=$(generate_clash_reality_node "$proto")
        ;;
      hysteria2)
        content+=$(generate_clash_hysteria2_node "$proto")
        ;;
      vmess-ws)
        content+=$(generate_clash_vmess_node "$proto")
        ;;
      # 更多协议...
    esac
  done
  
  echo "$content" > "$output_file"
}

# Reality 节点生成（Clash 格式）
generate_clash_reality_node() {
  local proto=$1
  local port=$(echo "$proto" | jq -r '.port')
  local uuid=$(echo "$proto" | jq -r '.uuid')
  local sni=$(echo "$proto" | jq -r '.sni')
  local public_key=$(echo "$proto" | jq -r '.public_key')
  
  cat << EOF

  - name: "${NODE_NAME} reality"
    type: vless
    server: ${SERVER_IP}
    port: ${port}
    uuid: ${uuid}
    network: tcp
    tls: true
    flow: xtls-rprx-vision
    servername: ${sni}
    client-fingerprint: firefox
    reality-opts:
      public-key: ${public_key}
      short-id: ""
EOF
}

# V2rayN URI 生成（Base64 编码）
generate_v2rayn_subscription() {
  local output_file=$1
  local protocols=$2
  
  local links=""
  
  echo "$protocols" | jq -c '.[]' | while read -r proto; do
    local type=$(echo "$proto" | jq -r '.type')
    
    case "$type" in
      reality)
        links+=$(generate_v2rayn_reality_uri "$proto")
        ;;
      hysteria2)
        links+=$(generate_v2rayn_hysteria2_uri "$proto")
        ;;
    esac
  done
  
  # Base64 编码
  echo -e "$links" | base64 -w 0 > "$output_file"
}

# Reality URI 生成（V2rayN 格式）
generate_v2rayn_reality_uri() {
  local proto=$1
  local port=$(echo "$proto" | jq -r '.port')
  local uuid=$(echo "$proto" | jq -r '.uuid')
  local sni=$(echo "$proto" | jq -r '.sni')
  local pbk=$(echo "$proto" | jq -r '.public_key')
  
  # URL 编码节点名称
  local node_name_encoded=$(urlencode "${NODE_NAME} reality")
  
  echo "vless://${uuid}@${SERVER_IP}:${port}?encryption=none&flow=xtls-rprx-vision&security=reality&sni=${sni}&fp=firefox&pbk=${pbk}&type=tcp#${node_name_encoded}"
}

# Nginx 订阅服务配置
configure_nginx_subscription() {
  local subscribe_dir=$1
  
  cat > /etc/nginx/conf.d/subscription.conf << EOF
server {
  listen ${PORT_NGINX};
  root ${subscribe_dir};
  
  # 自动索引
  location / {
    autoindex on;
    add_header Content-Type 'text/plain; charset=utf-8';
  }
  
  # 自适应订阅
  location /sub {
    default_type 'text/plain; charset=utf-8';
    
    # Clash 客户端
    if (\$http_user_agent ~* "clash|stash") {
      rewrite ^/sub\$ /clash.yaml last;
    }
    
    # V2rayN 客户端
    if (\$http_user_agent ~* "v2ray") {
      rewrite ^/sub\$ /v2rayn.txt last;
    }
    
    # Sing-box 客户端
    if (\$http_user_agent ~* "sing-box|sfi|sfa|sfm") {
      rewrite ^/sub\$ /singbox.json last;
    }
    
    # 默认返回通用格式
    rewrite ^/sub\$ /universal.txt last;
  }
}
EOF
  
  nginx -s reload
}

# 输出订阅地址
print_subscription_urls() {
  local base_url
  
  # 判断使用 Argo 还是直连
  if [[ "$ARGO_TYPE" =~ ^is_(token|json)_argo$ ]]; then
    base_url="https://${ARGO_DOMAIN}"
  else
    base_url="http://${SERVER_IP}:${PORT_NGINX}"
  fi
  
  echo ""
  echo "========== 订阅地址 =========="
  echo "通用订阅: ${base_url}/sub"
  echo "Clash:    ${base_url}/clash.yaml"
  echo "V2rayN:   ${base_url}/v2rayn.txt"
  echo "Sing-box: ${base_url}/singbox.json"
  echo "=============================="
}
```

**使用示例：**
```bash
# 生成订阅
protocols='[
  {"type":"reality","port":8881,"uuid":"xxx","sni":"addons.mozilla.org","public_key":"yyy"},
  {"type":"hysteria2","port":8882,"uuid":"zzz","hopping":"50000:51000"}
]'

generate_subscription \
  "${WORK_DIR}/subscribe" \
  "1.2.3.4" \
  "$protocols"

# 输出:
# 通用订阅: https://tunnel.example.com/sub
# Clash:    https://tunnel.example.com/clash.yaml
# V2rayN:   https://tunnel.example.com/v2rayn.txt
```

### 关键收获

1. **自签证书指纹** - 通过 `pinnedPeerCertSha256` 替代 `skip-cert-verify`，安全性大幅提升
2. **User-Agent 检测** - Nginx 根据客户端类型自动返回对应格式，用户体验更好
3. **Base64 编码规范** - V2rayN 等客户端要求 `-w 0`（无换行）
4. **IPv6 地址格式** - URL 中需要用 `[::1]`，某些配置需要 `[[::1]]`
5. **端口跳跃配置** - Hysteria2 的 `ports: start-end` + `HopInterval: 60`
6. **订阅目录结构** - 独立的 `subscribe/` 目录，便于 Nginx 直接托管
7. **模板引擎思路** - 使用 `jq` 解析 JSON 协议列表，动态生成订阅内容

### 下次迭代重点

**配置验证与回滚模块**
- 分析 fscarmen 如何验证 sing-box 配置文件
- 学习配置错误时的回滚机制
- 研究服务启动失败的自动恢复策略

---

## 迭代 4 (2026-03-01 18:19)

### 本次分析的模块
**配置验证与回滚模块 (Upgrade & Rollback)**

### fscarmen 的实现方式

**核心设计思路：**
1. **先备份后升级** - 升级前自动备份旧版本到 `.bak` 文件
2. **启动验证** - 升级后检查服务是否成功运行
3. **自动回滚** - 新版本启动失败时自动恢复旧版本
4. **状态反馈** - 每个步骤都有清晰的成功/失败提示
5. **版本检测** - 对比本地和远程版本，避免重复升级

**关键代码片段：**

```bash
# 版本升级流程
version() {
  # 1. 获取远程最新版本
  local ONLINE=$(get_sing_box_version)
  grep -q '.' <<< "$ONLINE" || error " $(text 100) \n"  # 获取失败则退出
  
  # 2. 获取本地版本
  local LOCAL=$(${WORK_DIR}/sing-box version | awk '/version/{print $NF}')
  
  # 3. 版本对比
  info "\n $(text 40) "
  [[ -n "$ONLINE" && "$ONLINE" != "$LOCAL" ]] && \
    reading "\n $(text 9) " UPDATE || \
    info " $(text 41) "  # 已是最新版本
  
  if [ "${UPDATE,,}" = 'y' ]; then
    # 4. 下载新版本到临时目录
    wget --no-check-certificate --continue \
      ${GH_PROXY}https://github.com/SagerNet/sing-box/releases/download/v$ONLINE/sing-box-$ONLINE-linux-$SING_BOX_ARCH.tar.gz \
      -qO- | tar xz -C $TEMP_DIR sing-box-$ONLINE-linux-$SING_BOX_ARCH/sing-box
    
    if [ -s $TEMP_DIR/sing-box-$ONLINE-linux-$SING_BOX_ARCH/sing-box ]; then
      # 5. 停止服务
      cmd_systemctl disable sing-box
      
      # 6. 备份旧版本
      cp ${WORK_DIR}/sing-box ${WORK_DIR}/sing-box.bak
      hint "\n $(text 102) \n"  # "已备份旧版本 sing-box 到 ${WORK_DIR}/sing-box.bak"
      
      # 7. 安装新版本
      chmod +x $TEMP_DIR/sing-box-$ONLINE-linux-$SING_BOX_ARCH/sing-box
      mv $TEMP_DIR/sing-box-$ONLINE-linux-$SING_BOX_ARCH/sing-box ${WORK_DIR}/sing-box
      
      # 8. 启动新版本
      cmd_systemctl enable sing-box
      sleep 2
      
      # 9. 验证新版本是否成功运行
      if cmd_systemctl status sing-box &>/dev/null; then
        # ✅ 新版本运行成功，删除备份
        rm -f ${WORK_DIR}/sing-box.bak
        info "\n $(text 103) \n"  # "新版本 $ONLINE 运行成功，已删除备份文件"
      else
        # ❌ 新版本运行失败，自动回滚
        warning "\n $(text 104) \n"  # "新版本 $ONLINE 运行失败，正在恢复旧版本 $LOCAL ..."
        
        # 10. 恢复旧版本
        mv ${WORK_DIR}/sing-box.bak ${WORK_DIR}/sing-box
        cmd_systemctl enable sing-box
        sleep 2
        
        # 11. 验证回滚是否成功
        if cmd_systemctl status sing-box &>/dev/null; then
          info "\n $(text 105) \n"  # "已成功恢复旧版本 $LOCAL"
        else
          error "\n $(text 106) \n"  # "恢复旧版本 $LOCAL 失败，请手动检查"
        fi
      fi
    else
      error "\n $(text 42) "  # 下载失败
    fi
  fi
}
```

**配置修改时的验证流程：**
```bash
change_protocols() {
  # ... 修改配置 ...
  
  # 1. 停止服务
  cmd_systemctl disable sing-box
  
  # 2. 生成新配置
  sing-box_json change
  
  # 3. 启动服务
  cmd_systemctl enable sing-box
  sleep 3
  
  # 4. 检测状态
  check_install
  case "${STATUS[0]}" in
    "$(text 26)" )  # 未安装
      error "\n Sing-box $(text 28) $(text 38) \n"
      ;;
    "$(text 27)" )  # 已停止
      # 尝试重启
      cmd_systemctl enable sing-box
      cmd_systemctl status sing-box &>/dev/null && \
        info "\n Sing-box $(text 28) $(text 37) \n" || \
        error "\n Sing-box $(text 28) $(text 38) \n"
      ;;
    "$(text 28)" )  # 运行中
      info "\n Sing-box $(text 28) $(text 37) \n"
  esac
}
```

**服务状态检测（跨平台）：**
```bash
check_install() {
  if [ "$SYSTEM" = 'Alpine' ]; then
    # OpenRC 状态检测
    if rc-service sing-box status &>/dev/null; then
      STATUS[0]=$(text 28)  # 运行中
    else
      STATUS[0]=$(text 27)  # 已停止
    fi
  else
    # systemd 状态检测
    if systemctl is-active sing-box &>/dev/null; then
      STATUS[0]=$(text 28)
    else
      STATUS[0]=$(text 27)
    fi
  fi
}
```

### 提炼的设计原则

1. **原子操作** - 先备份 → 修改 → 验证 → 清理/回滚，每步都可逆
2. **失败快速恢复** - 新版本启动失败立即回滚，不留残留状态
3. **双重验证** - 升级后验证，回滚后再次验证，确保系统可用
4. **临时目录隔离** - 下载到 `/tmp`，验证通过后再移动到工作目录
5. **状态机设计** - 明确的状态转换：未安装 → 已停止 → 运行中
6. **用户反馈** - 每个关键步骤都有 info/warning/error 提示
7. **超时等待** - `sleep 2` 给服务启动留出时间，避免误判
8. **备份保留策略** - 成功后删除备份，失败后保留用于回滚

### 我们的接口设计

```bash
# 配置验证与回滚模块接口
config_manager() {
  local action=$1      # validate|backup|restore|upgrade
  local target=$2      # 目标文件或版本
  
  case "$action" in
    validate)
      validate_config "$target"
      ;;
    backup)
      backup_config "$target"
      ;;
    restore)
      restore_config "$target"
      ;;
    upgrade)
      upgrade_with_rollback "$target"
      ;;
  esac
}

# 配置验证（使用 sing-box check）
validate_config() {
  local config_dir=$1
  
  # 1. 检查配置文件是否存在
  if [ ! -d "$config_dir" ]; then
    error "配置目录不存在: $config_dir"
    return 1
  fi
  
  # 2. 使用 sing-box 内置验证
  if ! ${WORK_DIR}/sing-box check -c "$config_dir" 2>&1 | tee /tmp/sing-box-check.log; then
    error "配置验证失败，详细信息:"
    cat /tmp/sing-box-check.log
    return 1
  fi
  
  # 3. 检查端口冲突
  check_port_conflicts "$config_dir" || return 1
  
  # 4. 检查证书有效性
  check_certificates "$config_dir" || return 1
  
  info "配置验证通过"
  return 0
}

# 配置备份（带时间戳）
backup_config() {
  local source=$1
  local backup_dir="${WORK_DIR}/backups"
  local timestamp=$(date +%Y%m%d_%H%M%S)
  local backup_name="backup_${timestamp}"
  
  mkdir -p "$backup_dir"
  
  # 1. 备份配置文件
  cp -r "${WORK_DIR}/conf" "${backup_dir}/${backup_name}_conf"
  
  # 2. 备份二进制文件
  cp "${WORK_DIR}/sing-box" "${backup_dir}/${backup_name}_binary"
  
  # 3. 备份服务文件
  cp "$SINGBOX_DAEMON_FILE" "${backup_dir}/${backup_name}_service"
  
  # 4. 记录备份元数据
  cat > "${backup_dir}/${backup_name}_meta.json" << EOF
{
  "timestamp": "$timestamp",
  "version": "$(${WORK_DIR}/sing-box version | awk '/version/{print $NF}')",
  "protocols": $(list_installed_protocols),
  "backup_reason": "$source"
}
EOF
  
  info "配置已备份到: ${backup_dir}/${backup_name}"
  echo "$backup_name"  # 返回备份名称
}

# 配置恢复
restore_config() {
  local backup_name=$1
  local backup_dir="${WORK_DIR}/backups"
  
  # 1. 检查备份是否存在
  if [ ! -d "${backup_dir}/${backup_name}_conf" ]; then
    error "备份不存在: $backup_name"
    return 1
  fi
  
  # 2. 停止服务
  service_control stop sing-box
  
  # 3. 恢复配置文件
  rm -rf "${WORK_DIR}/conf"
  cp -r "${backup_dir}/${backup_name}_conf" "${WORK_DIR}/conf"
  
  # 4. 恢复二进制文件
  cp "${backup_dir}/${backup_name}_binary" "${WORK_DIR}/sing-box"
  chmod +x "${WORK_DIR}/sing-box"
  
  # 5. 恢复服务文件
  cp "${backup_dir}/${backup_name}_service" "$SINGBOX_DAEMON_FILE"
  [ "$INIT_SYSTEM" = "systemd" ] && systemctl daemon-reload
  
  # 6. 启动服务
  service_control start sing-box
  
  # 7. 验证恢复结果
  if service_wait_ready sing-box 10; then
    info "配置恢复成功: $backup_name"
    return 0
  else
    error "配置恢复后服务启动失败"
    return 1
  fi
}

# 带回滚的升级流程
upgrade_with_rollback() {
  local new_version=$1
  local backup_name
  
  # 1. 获取当前版本
  local current_version=$(${WORK_DIR}/sing-box version | awk '/version/{print $NF}')
  
  # 2. 版本对比
  if [ "$new_version" = "$current_version" ]; then
    info "已是最新版本: $current_version"
    return 0
  fi
  
  # 3. 自动备份
  backup_name=$(backup_config "upgrade_from_${current_version}_to_${new_version}")
  
  # 4. 下载新版本
  local temp_binary="/tmp/sing-box-${new_version}"
  if ! download_singbox_binary "$new_version" "$temp_binary"; then
    error "下载新版本失败"
    return 1
  fi
  
  # 5. 停止服务
  service_control stop sing-box
  
  # 6. 替换二进制文件
  mv "$temp_binary" "${WORK_DIR}/sing-box"
  chmod +x "${WORK_DIR}/sing-box"
  
  # 7. 启动新版本
  service_control start sing-box
  sleep 3
  
  # 8. 验证新版本
  if service_is_active sing-box; then
    # ✅ 升级成功
    info "升级成功: $current_version → $new_version"
    
    # 清理旧备份（保留最近 5 个）
    cleanup_old_backups 5
    return 0
  else
    # ❌ 升级失败，自动回滚
    warning "新版本启动失败，正在回滚到 $current_version ..."
    
    if restore_config "$backup_name"; then
      info "已成功回滚到 $current_version"
      return 1
    else
      error "回滚失败，请手动恢复: ${WORK_DIR}/backups/${backup_name}"
      return 2
    fi
  fi
}

# 端口冲突检测
check_port_conflicts() {
  local config_dir=$1
  local ports=$(jq -r '.. | .listen_port? // empty' "$config_dir"/*.json 2>/dev/null)
  
  for port in $ports; do
    if netstat -tuln | grep -q ":${port} "; then
      local process=$(lsof -i ":${port}" | awk 'NR==2{print $1}')
      if [ "$process" != "sing-box" ]; then
        error "端口 $port 已被占用: $process"
        return 1
      fi
    fi
  done
  
  return 0
}

# 证书有效性检查
check_certificates() {
  local config_dir=$1
  local cert_file="${WORK_DIR}/cert/cert.pem"
  
  if [ ! -f "$cert_file" ]; then
    warning "证书文件不存在，跳过检查"
    return 0
  fi
  
  # 检查证书是否过期
  local expiry_date=$(openssl x509 -enddate -noout -in "$cert_file" | cut -d= -f2)
  local expiry_epoch=$(date -d "$expiry_date" +%s)
  local now_epoch=$(date +%s)
  
  if [ $expiry_epoch -lt $now_epoch ]; then
    error "证书已过期: $expiry_date"
    return 1
  fi
  
  # 检查证书是否即将过期（30 天内）
  local days_left=$(( ($expiry_epoch - $now_epoch) / 86400 ))
  if [ $days_left -lt 30 ]; then
    warning "证书将在 $days_left 天后过期"
  fi
  
  return 0
}

# 清理旧备份
cleanup_old_backups() {
  local keep_count=$1
  local backup_dir="${WORK_DIR}/backups"
  
  # 按时间排序，删除最旧的备份
  ls -t "$backup_dir" | grep "^backup_" | tail -n +$((keep_count + 1)) | while read -r old_backup; do
    rm -rf "${backup_dir}/${old_backup}"
    info "已删除旧备份: $old_backup"
  done
}
```

**使用示例：**
```bash
# 场景 1: 修改配置前验证
generate_config "update" "hysteria2" '{"port": 8881}'
if validate_config "${WORK_DIR}/conf"; then
  service_control restart sing-box
else
  error "配置验证失败，未应用更改"
fi

# 场景 2: 手动备份
backup_name=$(backup_config "before_major_change")
echo "备份已创建: $backup_name"

# 场景 3: 升级 sing-box
upgrade_with_rollback "1.8.0"
# 输出:
# 配置已备份到: /etc/sing-box/backups/backup_20260301_181900
# 下载新版本...
# 升级成功: 1.7.5 → 1.8.0

# 场景 4: 手动回滚
restore_config "backup_20260301_181900"
```

### 关键收获

1. **备份即保险** - 每次重大操作前自动备份，失败时可快速恢复
2. **验证驱动** - 不依赖"希望它能工作"，而是主动验证服务状态
3. **超时策略** - `sleep 2-3` 给服务启动留出时间，避免误判
4. **状态检测** - 使用 `systemctl is-active` 或 `rc-service status` 而非 `ps` 命令
5. **元数据记录** - 备份时记录版本、协议、时间等信息，便于追溯
6. **备份清理** - 自动删除旧备份，避免磁盘占用过多
7. **错误分级** - 区分"可恢复错误"（自动回滚）和"严重错误"（需人工介入）
8. **原子性保证** - 先在临时目录操作，验证通过后再移动到工作目录

### 下次迭代重点

**依赖管理模块 (Nginx/Argo 协同)**
- 分析 fscarmen 如何处理 Nginx 和 Argo 的启动顺序
- 学习服务间依赖关系的声明和管理
- 研究 Nginx 配置动态生成和热重载机制

---

---

## 迭代 5 (2026-03-01 18:29)

### 本次分析的模块
**依赖管理模块 (Nginx/Argo 协同)**

### fscarmen 的实现方式

**核心设计思路：**
1. **服务分层架构** - Sing-box (核心) → Nginx (订阅服务) → Argo (隧道)
2. **状态检测三元组** - 使用数组 `STATUS[0/1/2]` 分别追踪 sing-box/argo/nginx 状态
3. **条件依赖** - Nginx 和 Argo 是可选组件，仅在需要订阅服务时安装
4. **后台静默下载** - 检测到缺失组件时，后台异步下载，不阻塞主流程
5. **跨平台服务管理** - 统一的 `cmd_systemctl` 函数封装 systemd/OpenRC 差异

**关键代码片段：**

```bash
# 状态检测函数（三元组：sing-box/argo/nginx）
check_install() {
  local PS_LIST=$(ps -eo pid,args | grep -E "$WORK_DIR.*([s]ing-box|[c]loudflared|[n]ginx)" | sed 's/^[ ]\+//g')
  
  # 检测 sing-box 状态
  if [ "$SYSTEM" = 'Alpine' ]; then
    # OpenRC 检测
    if [ -s ${SINGBOX_DAEMON_FILE} ]; then
      rc-service sing-box status &>/dev/null && STATUS[0]=$(text 28) || STATUS[0]=$(text 27)
    else
      STATUS[0]=$(text 26)  # 未安装
    fi
  else
    # systemd 检测
    if [ -s ${SINGBOX_DAEMON_FILE} ]; then
      [ "$(systemctl is-active sing-box)" = 'active' ] && STATUS[0]=$(text 28) || STATUS[0]=$(text 27)
    else
      STATUS[0]=$(text 26)
    fi
  fi
  
  # 检测 Argo 状态（可选组件）
  STATUS[1]=$(text 26) && IS_ARGO=no_argo
  [ -s ${ARGO_DAEMON_FILE} ] && IS_ARGO=is_argo && STATUS[1]=$(text 27)
  cmd_systemctl status argo &>/dev/null && STATUS[1]=$(text 28)
  
  # 检测 Nginx 状态（可选组件）
  if [ ! -x "$(type -p nginx)" ]; then
    STATUS[2]=$(text 26)
  elif [ -s ${WORK_DIR}/nginx.conf ]; then
    # 检测 Nginx 进程是否运行
    grep -q 'nginx' <<< "$PS_LIST" && STATUS[2]=$(text 28) || STATUS[2]=$(text 27)
  else
    STATUS[2]=$(text 26)
  fi
}

# 后台静默下载（非阻塞）
check_install() {
  # ... 状态检测 ...
  
  # 如果 sing-box 未安装，后台下载
  if [ "${STATUS[0]}" = "$(text 26)" ] && [ ! -s ${WORK_DIR}/sing-box ]; then
    {
      local ONLINE=$(get_sing_box_version)
      wget --no-check-certificate --continue \
        ${GH_PROXY}https://github.com/SagerNet/sing-box/releases/download/v$ONLINE/sing-box-$ONLINE-linux-$SING_BOX_ARCH.tar.gz \
        -qO- | tar xz -C $TEMP_DIR sing-box-$ONLINE-linux-$SING_BOX_ARCH/sing-box >/dev/null 2>&1
      [ -s $TEMP_DIR/sing-box-$ONLINE-linux-$SING_BOX_ARCH/sing-box ] && \
        mv $TEMP_DIR/sing-box-$ONLINE-linux-$SING_BOX_ARCH/sing-box $TEMP_DIR
    }&  # 后台执行，不阻塞主流程
  fi
  
  # 如果 Argo 未安装，后台下载
  if [[ "${STATUS[1]}" = "$(text 26)" ]] && [ ! -s ${WORK_DIR}/cloudflared ]; then
    {
      wget --no-check-certificate -qO $TEMP_DIR/cloudflared \
        ${GH_PROXY}https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$ARGO_ARCH \
        >/dev/null 2>&1 && chmod +x $TEMP_DIR/cloudflared >/dev/null 2>&1
    }&
  fi
}

# 统一的服务控制函数（跨平台）
cmd_systemctl() {
  local ACTION=$1
  local SERVICE=$2
  
  if [ "$SYSTEM" = 'Alpine' ]; then
    # OpenRC 命令映射
    case "$ACTION" in
      enable)
        rc-service "$SERVICE" start
        rc-update add "$SERVICE" default
        ;;
      disable)
        rc-service "$SERVICE" stop
        rc-update del "$SERVICE" default
        ;;
      status)
        rc-service "$SERVICE" status
        ;;
      restart)
        rc-service "$SERVICE" restart
        ;;
    esac
  else
    # systemd 命令
    systemctl "$ACTION" "$SERVICE"
  fi
}

# Nginx 配置生成（依赖 Argo 域名）
export_nginx_conf_file() {
  # 订阅服务端口
  local PORT_NGINX=${PORT_NGINX:-8080}
  
  cat > ${WORK_DIR}/nginx.conf << EOF
user root;
worker_processes auto;
pid ${WORK_DIR}/nginx.pid;

events {
  worker_connections 1024;
}

http {
  include /etc/nginx/mime.types;
  default_type application/octet-stream;
  
  server {
    listen ${PORT_NGINX};
    root ${WORK_DIR}/subscribe;
    
    # 自动索引
    location / {
      autoindex on;
      add_header Content-Type 'text/plain; charset=utf-8';
    }
    
    # 自适应订阅（根据 User-Agent）
    location /sub {
      default_type 'text/plain; charset=utf-8';
      
      if (\$http_user_agent ~* "clash|stash") {
        rewrite ^/sub\$ /clash.yaml last;
      }
      
      if (\$http_user_agent ~* "v2ray") {
        rewrite ^/sub\$ /v2rayn.txt last;
      }
      
      if (\$http_user_agent ~* "sing-box|sfi|sfa|sfm") {
        rewrite ^/sub\$ /singbox.json last;
      }
      
      rewrite ^/sub\$ /universal.txt last;
    }
  }
}
EOF
  
  # 启动 Nginx
  nginx -c ${WORK_DIR}/nginx.conf
}

# Argo 隧道配置（依赖 Nginx 端口）
input_argo_auth() {
  local IS_CHANGE_ARGO=$1
  
  # 读取 Argo 域名和认证信息
  reading "\n $(text 87) " ARGO_DOMAIN
  
  if [ -z "$ARGO_DOMAIN" ]; then
    # 使用临时隧道（Try Cloudflare）
    ARGO_RUNS="${WORK_DIR}/cloudflared tunnel --edge-ip-version auto --no-autoupdate --url http://localhost:$PORT_NGINX"
  else
    # 使用固定隧道（Token/Json/API）
    reading "\n $(text 118) " ARGO_AUTH
    
    if [[ "$ARGO_AUTH" =~ TunnelSecret ]]; then
      # Json 格式
      ARGO_TYPE=is_json_argo
      ARGO_JSON=${ARGO_AUTH//[ ]/}
      export_argo_json_file ${WORK_DIR}
      ARGO_RUNS="${WORK_DIR}/cloudflared tunnel --edge-ip-version auto --config ${WORK_DIR}/tunnel.yml run"
    elif [[ "${ARGO_AUTH}" =~ [A-Z0-9a-z=]{150,250}$ ]]; then
      # Token 格式
      ARGO_TYPE=is_token_argo
      ARGO_TOKEN=$(awk '{print $NF}' <<< "$ARGO_AUTH")
      ARGO_RUNS="${WORK_DIR}/cloudflared tunnel --edge-ip-version auto run --token ${ARGO_TOKEN}"
    elif [[ "${#ARGO_AUTH}" = 40 ]]; then
      # Cloudflare API 创建隧道
      create_argo_tunnel "${ARGO_AUTH}" "${ARGO_DOMAIN}" "${PORT_NGINX}"
      # ... 根据返回结果设置 ARGO_RUNS ...
    fi
  fi
}

# 服务启动顺序控制
install_sing_box() {
  # 1. 安装 sing-box
  install_singbox_binary
  generate_config "new" "all"
  service_install sing-box
  service_control enable sing-box
  
  # 2. 安装 Nginx（如果需要订阅服务）
  if [ "$IS_SUB" = "is_sub" ]; then
    install_nginx
    export_nginx_conf_file
    # Nginx 不需要 systemd 服务，直接启动
    nginx -c ${WORK_DIR}/nginx.conf
  fi
  
  # 3. 安装 Argo（如果需要隧道）
  if [ "$IS_ARGO" = "is_argo" ]; then
    install_argo_binary
    input_argo_auth is_install
    service_install argo
    service_control enable argo
    
    # 等待 Argo 隧道建立
    sleep 3
    fetch_quicktunnel_domain  # 获取临时域名
  fi
  
  # 4. 生成订阅链接（依赖 Argo 域名）
  export_list
}
```

**Argo 临时域名获取：**
```bash
fetch_quicktunnel_domain() {
  # 从 Argo 日志中提取临时域名
  for i in {1..10}; do
    ARGO_DOMAIN=$(awk '/trycloudflare.com/{print $NF}' ${WORK_DIR}/logs/argo.log | sed 's@https://@@')
    [ -n "$ARGO_DOMAIN" ] && break
    sleep 1
  done
  
  [ -z "$ARGO_DOMAIN" ] && error "\n $(text 93) \n"  # 获取不到临时隧道域名
}
```

### 提炼的设计原则

1. **状态数组管理** - 使用数组统一管理多个服务的状态，便于批量检测
2. **后台异步下载** - 使用 `{ ... }&` 后台下载依赖，不阻塞用户交互
3. **条件依赖** - 根据用户选择动态决定是否安装 Nginx/Argo
4. **服务启动顺序** - sing-box → nginx → argo，确保依赖关系正确
5. **等待机制** - Argo 启动后 `sleep 3` 等待隧道建立，再获取域名
6. **日志解析** - 从 Argo 日志中提取临时域名，而非 API 查询
7. **优雅降级** - Argo 创建失败时自动回退到临时隧道
8. **配置联动** - Nginx 配置依赖 PORT_NGINX，Argo 配置依赖 Nginx 端口

### 我们的接口设计

```bash
# 依赖管理模块接口
dependency_manager() {
  local action=$1      # install|check|start|stop
  local component=$2   # singbox|nginx|argo|all
  
  case "$action" in
    install)
      install_component "$component"
      ;;
    check)
      check_component_status "$component"
      ;;
    start)
      start_component_chain "$component"
      ;;
    stop)
      stop_component_chain "$component"
      ;;
  esac
}

# 组件状态检测（返回状态码）
check_component_status() {
  local component=$1
  local status_code
  
  case "$component" in
    singbox)
      if [ ! -s "${WORK_DIR}/sing-box" ]; then
        status_code=0  # 未安装
      elif service_is_active sing-box; then
        status_code=2  # 运行中
      else
        status_code=1  # 已安装未运行
      fi
      ;;
    nginx)
      if [ ! -x "$(type -p nginx)" ]; then
        status_code=0
      elif pgrep -f "nginx.*${WORK_DIR}/nginx.conf" >/dev/null; then
        status_code=2
      else
        status_code=1
      fi
      ;;
    argo)
      if [ ! -s "${WORK_DIR}/cloudflared" ]; then
        status_code=0
      elif service_is_active argo; then
        status_code=2
      else
        status_code=1
      fi
      ;;
    all)
      # 返回所有组件状态（JSON 格式）
      echo "{
        \"singbox\": $(check_component_status singbox),
        \"nginx\": $(check_component_status nginx),
        \"argo\": $(check_component_status argo)
      }"
      return
      ;;
  esac
  
  echo "$status_code"
}

# 后台异步下载（非阻塞）
async_download_component() {
  local component=$1
  
  case "$component" in
    singbox)
      {
        local version=$(get_latest_version "sing-box")
        wget -qO- "${GH_PROXY}https://github.com/SagerNet/sing-box/releases/download/v${version}/sing-box-${version}-linux-${ARCH}.tar.gz" | \
          tar xz -C "$TEMP_DIR" --strip-components=1 "sing-box-${version}-linux-${ARCH}/sing-box"
        chmod +x "$TEMP_DIR/sing-box"
      } &
      ;;
    argo)
      {
        wget -qO "$TEMP_DIR/cloudflared" \
          "${GH_PROXY}https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}"
        chmod +x "$TEMP_DIR/cloudflared"
      } &
      ;;
    nginx)
      # Nginx 通过包管理器安装，不需要异步下载
      install_package nginx
      ;;
  esac
}

# 组件安装（带依赖检查）
install_component() {
  local component=$1
  
  # 检查是否已安装
  local status=$(check_component_status "$component")
  if [ "$status" -gt 0 ]; then
    info "$component 已安装，跳过"
    return 0
  fi
  
  # 安装组件
  case "$component" in
    singbox)
      # 等待后台下载完成
      wait_for_download "$TEMP_DIR/sing-box" 30 || {
        error "sing-box 下载超时"
        return 1
      }
      
      # 安装二进制文件
      mv "$TEMP_DIR/sing-box" "${WORK_DIR}/sing-box"
      chmod +x "${WORK_DIR}/sing-box"
      
      # 生成服务文件
      service_install sing-box
      ;;
    nginx)
      # 安装 Nginx（通过包管理器）
      install_package nginx
      
      # 生成配置文件
      generate_nginx_config "${WORK_DIR}/nginx.conf"
      ;;
    argo)
      # 等待后台下载完成
      wait_for_download "$TEMP_DIR/cloudflared" 30 || {
        error "cloudflared 下载超时"
        return 1
      }
      
      # 安装二进制文件
      mv "$TEMP_DIR/cloudflared" "${WORK_DIR}/cloudflared"
      chmod +x "${WORK_DIR}/cloudflared"
      
      # 配置 Argo 隧道
      configure_argo_tunnel
      
      # 生成服务文件
      service_install argo
      ;;
    all)
      install_component singbox
      install_component nginx
      install_component argo
      ;;
  esac
}

# 等待下载完成（带超时）
wait_for_download() {
  local file=$1
  local timeout=${2:-30}
  local elapsed=0
  
  while [ ! -s "$file" ] && [ $elapsed -lt $timeout ]; do
    sleep 1
    elapsed=$((elapsed + 1))
  done
  
  [ -s "$file" ]
}

# 启动组件链（按依赖顺序）
start_component_chain() {
  local component=$1
  
  case "$component" in
    singbox)
      service_control start sing-box
      service_wait_ready sing-box 10
      ;;
    nginx)
      # Nginx 依赖 sing-box 的订阅文件
      if [ $(check_component_status singbox) -ne 2 ]; then
        error "sing-box 未运行，无法启动 nginx"
        return 1
      fi
      
      # 启动 Nginx
      nginx -c "${WORK_DIR}/nginx.conf"
      sleep 1
      
      # 验证启动
      pgrep -f "nginx.*${WORK_DIR}/nginx.conf" >/dev/null || {
        error "nginx 启动失败"
        return 1
      }
      ;;
    argo)
      # Argo 依赖 Nginx 端口
      if [ $(check_component_status nginx) -ne 2 ]; then
        error "nginx 未运行，无法启动 argo"
        return 1
      fi
      
      # 启动 Argo
      service_control start argo
      sleep 3  # 等待隧道建立
      
      # 获取临时域名（如果使用 Try Cloudflare）
      if [ "$ARGO_TYPE" = "is_quicktunnel_argo" ]; then
        fetch_argo_domain_from_log
      fi
      ;;
    all)
      start_component_chain singbox
      start_component_chain nginx
      start_component_chain argo
      ;;
  esac
}

# 停止组件链（逆序）
stop_component_chain() {
  local component=$1
  
  case "$component" in
    argo)
      service_control stop argo
      ;;
    nginx)
      # 停止 Nginx
      pkill -f "nginx.*${WORK_DIR}/nginx.conf"
      ;;
    singbox)
      service_control stop sing-box
      ;;
    all)
      stop_component_chain argo
      stop_component_chain nginx
      stop_component_chain singbox
      ;;
  esac
}

# 从 Argo 日志中提取域名
fetch_argo_domain_from_log() {
  local log_file="${WORK_DIR}/logs/argo.log"
  local max_attempts=10
  
  for i in $(seq 1 $max_attempts); do
    ARGO_DOMAIN=$(awk '/trycloudflare.com/{print $NF}' "$log_file" | \
                  sed 's@https://@@' | tail -n 1)
    
    if [ -n "$ARGO_DOMAIN" ]; then
      info "Argo 临时域名: $ARGO_DOMAIN"
      return 0
    fi
    
    sleep 1
  done
  
  error "无法获取 Argo 临时域名"
  return 1
}

# Nginx 配置生成（模板化）
generate_nginx_config() {
  local output_file=$1
  local port=${PORT_NGINX:-8080}
  
  cat > "$output_file" << EOF
user root;
worker_processes auto;
pid ${WORK_DIR}/nginx.pid;
error_log ${WORK_DIR}/logs/nginx_error.log;

events {
  worker_connections 1024;
}

http {
  include /etc/nginx/mime.types;
  default_type application/octet-stream;
  access_log ${WORK_DIR}/logs/nginx_access.log;
  
  server {
    listen ${port};
    root ${WORK_DIR}/subscribe;
    
    location / {
      autoindex on;
      add_header Content-Type 'text/plain; charset=utf-8';
    }
    
    location /sub {
      default_type 'text/plain; charset=utf-8';
      
      # User-Agent 检测
      if (\$http_user_agent ~* "clash|stash") {
        rewrite ^/sub\$ /clash.yaml last;
      }
      
      if (\$http_user_agent ~* "v2ray") {
        rewrite ^/sub\$ /v2rayn.txt last;
      }
      
      if (\$http_user_agent ~* "sing-box|sfi|sfa|sfm") {
        rewrite ^/sub\$ /singbox.json last;
      }
      
      rewrite ^/sub\$ /universal.txt last;
    }
  }
}
EOF
}
```

**使用示例：**
```bash
# 场景 1: 完整安装（按依赖顺序）
dependency_manager install all
dependency_manager start all

# 场景 2: 检查所有组件状态
status=$(dependency_manager check all)
echo "$status"
# 输出: {"singbox": 2, "nginx": 2, "argo": 2}

# 场景 3: 单独重启 Argo
dependency_manager stop argo
dependency_manager start argo

# 场景 4: 后台异步下载
async_download_component singbox
async_download_component argo
# 继续其他操作...
wait  # 等待所有后台任务完成
```

### 关键收获

1. **状态数组** - `STATUS[0/1/2]` 统一管理多个服务状态，便于批量检测
2. **后台下载** - `{ ... }&` 异步下载，不阻塞用户交互，提升体验
3. **依赖顺序** - sing-box → nginx → argo，启动时正序，停止时逆序
4. **等待机制** - Argo 启动后等待 3 秒，确保隧道建立完成
5. **日志解析** - 从 Argo 日志提取临时域名，避免 API 调用
6. **优雅降级** - Argo 创建失败时自动回退到临时隧道
7. **配置联动** - Nginx 端口 → Argo 配置 → 订阅链接，环环相扣
8. **条件依赖** - 根据用户选择动态决定是否安装可选组件

### 下次迭代重点

**用户交互模块 (菜单系统与参数解析)**
- 分析 fscarmen 如何设计交互式菜单
- 学习命令行参数解析和非交互式安装
- 研究多语言支持的实现方式

---

## 迭代 6 (2026-03-01 18:39)

### 本次分析的模块
**用户交互模块 (菜单系统与参数解析)**

### fscarmen 的实现方式

**核心设计思路：**
1. **双模式支持** - 交互式菜单 + 非交互式命令行参数
2. **多语言国际化** - 通过 `text()` 函数动态加载语言包
3. **状态驱动菜单** - 根据已安装组件动态生成菜单选项
4. **参数验证** - 命令行参数优先级高于交互输入
5. **彩色输出** - 使用 ANSI 转义码美化终端输出

**关键代码片段：**

```bash
# 多语言支持（text 函数）
text() {
  case "$LANGUAGE" in
    E )  # English
      case "$1" in
        0 ) echo "Current language: English" ;;
        1 ) echo "System info" ;;
        2 ) echo "Sing-box status" ;;
        # ... 更多文本 ...
      esac
      ;;
    C )  # 中文
      case "$1" in
        0 ) echo "当前语言: 中文" ;;
        1 ) echo "系统信息" ;;
        2 ) echo "Sing-box 状态" ;;
        # ... 更多文本 ...
      esac
      ;;
  esac
}

# 命令行参数解析
while [ $# -gt 0 ]; do
  case "$1" in
    -L | --language )
      LANGUAGE="$2"
      shift 2
      ;;
    -v | --version )
      VERSION="$2"
      shift 2
      ;;
    -p | --port )
      PORT_HYSTERIA2="$2"
      shift 2
      ;;
    -P | --password )
      UUID[12]="$2"
      shift 2
      ;;
    -r | --reality )
      IS_REALITY=is_reality
      shift
      ;;
    -a | --argo )
      ARGO_DOMAIN="$2"
      ARGO_AUTH="$3"
      shift 3
      ;;
    -h | --help )
      show_help
      exit 0
      ;;
    * )
      error "Unknown parameter: $1"
      show_help
      exit 1
      ;;
  esac
done

# 交互式菜单（状态驱动）
menu() {
  check_install  # 检测当前状态
  
  clear
  echo ""
  echo "=========================================="
  echo "       Sing-box 一键安装脚本"
  echo "=========================================="
  echo ""
  echo " $(text 1): $(text 2)"
  echo " $(text 3): ${STATUS[0]}"  # Sing-box 状态
  echo " $(text 4): ${STATUS[1]}"  # Argo 状态
  echo " $(text 5): ${STATUS[2]}"  # Nginx 状态
  echo ""
  echo "=========================================="
  echo ""
  
  # 根据状态动态生成菜单
  if [ "${STATUS[0]}" = "$(text 26)" ]; then
    # 未安装 sing-box
    echo " 1. $(text 10)"  # 安装 Sing-box
  else
    # 已安装 sing-box
    echo " 1. $(text 11)"  # 修改配置
    echo " 2. $(text 12)"  # 卸载 Sing-box
    echo " 3. $(text 13)"  # 更新 Sing-box
    echo " 4. $(text 14)"  # 查看节点信息
    
    # 如果 Argo 未安装，显示安装选项
    [ "${STATUS[1]}" = "$(text 26)" ] && echo " 5. $(text 15)"  # 安装 Argo
  fi
  
  echo ""
  echo " 0. $(text 16)"  # 退出
  echo ""
  
  # 读取用户选择
  reading "\n $(text 17): " CHOOSE
  
  case "$CHOOSE" in
    1 )
      if [ "${STATUS[0]}" = "$(text 26)" ]; then
        install_sing_box
      else
        change_protocols
      fi
      ;;
    2 )
      uninstall_sing_box
      ;;
    3 )
      version
      ;;
    4 )
      export_list is_show
      ;;
    5 )
      install_argo
      ;;
    0 )
      exit 0
      ;;
    * )
      error "\n $(text 18) \n"  # 无效选择
      menu
      ;;
  esac
}

# 彩色输出函数
red() { echo -e "\033[31m\033[01m$1\033[0m"; }
green() { echo -e "\033[32m\033[01m$1\033[0m"; }
yellow() { echo -e "\033[33m\033[01m$1\033[0m"; }
blue() { echo -e "\033[36m\033[01m$1\033[0m"; }

info() { green "$1"; }
hint() { yellow "$1"; }
warning() { yellow "$1"; }
error() { red "$1"; exit 1; }

# 用户输入函数（带默认值）
reading() {
  local PROMPT="$1"
  local VAR_NAME="$2"
  local DEFAULT="$3"
  
  if [ -n "$DEFAULT" ]; then
    read -rp "$(green "$PROMPT") [默认: $DEFAULT]: " INPUT
    eval "$VAR_NAME=\${INPUT:-$DEFAULT}"
  else
    read -rp "$(green "$PROMPT"): " INPUT
    eval "$VAR_NAME=\$INPUT"
  fi
}

# 协议选择菜单
select_protocols() {
  echo ""
  echo "=========================================="
  echo "       选择要安装的协议"
  echo "=========================================="
  echo ""
  echo " 1. Reality (XTLS-Vision)"
  echo " 2. Hysteria2"
  echo " 3. VMess-WebSocket"
  echo " 4. Trojan-WebSocket"
  echo " 5. 全部安装"
  echo ""
  
  reading "请选择协议 [1-5]" PROTOCOL_CHOICE
  
  case "$PROTOCOL_CHOICE" in
    1 ) IS_REALITY=is_reality ;;
    2 ) IS_HYSTERIA2=is_hysteria2 ;;
    3 ) IS_VMESS=is_vmess ;;
    4 ) IS_TROJAN=is_trojan ;;
    5 )
      IS_REALITY=is_reality
      IS_HYSTERIA2=is_hysteria2
      IS_VMESS=is_vmess
      IS_TROJAN=is_trojan
      ;;
    * )
      error "无效选择"
      ;;
  esac
}

# 非交互式安装（命令行参数优先）
if [ -n "$PORT_HYSTERIA2" ]; then
  # 命令行指定了端口，跳过交互
  IS_HYSTERIA2=is_hysteria2
else
  # 交互式询问
  reading "是否安装 Hysteria2? [y/N]" INSTALL_HY2
  [ "${INSTALL_HY2,,}" = 'y' ] && IS_HYSTERIA2=is_hysteria2
fi

# 参数验证
validate_port() {
  local PORT=$1
  
  if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
    error "无效端口: $PORT (必须是 1-65535)"
  fi
  
  # 检查端口是否被占用
  if netstat -tuln | grep -q ":${PORT} "; then
    error "端口 $PORT 已被占用"
  fi
}

validate_uuid() {
  local UUID=$1
  
  if ! [[ "$UUID" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
    error "无效 UUID 格式: $UUID"
  fi
}
```

**帮助信息：**
```bash
show_help() {
  cat << EOF
Sing-box 一键安装脚本

用法:
  $0 [选项]

选项:
  -L, --language <E|C>        设置语言 (E=English, C=中文)
  -v, --version <VERSION>     指定 sing-box 版本
  -p, --port <PORT>           Hysteria2 端口
  -P, --password <PASSWORD>   Hysteria2 密码
  -r, --reality               安装 Reality 协议
  -a, --argo <DOMAIN> <AUTH>  配置 Argo 隧道
  -h, --help                  显示此帮助信息

示例:
  # 交互式安装
  $0
  
  # 非交互式安装 Hysteria2
  $0 -p 8881 -P mypassword
  
  # 安装 Reality + Argo
  $0 -r -a tunnel.example.com eyJhIjoiMTIzIn0=
  
  # 指定语言和版本
  $0 -L C -v 1.8.0

EOF
}
```

### 提炼的设计原则

1. **双模式设计** - 交互式菜单适合新手，命令行参数适合自动化
2. **参数优先级** - 命令行参数 > 交互输入 > 默认值
3. **状态驱动** - 菜单选项根据当前安装状态动态生成
4. **国际化支持** - 通过 `text()` 函数统一管理多语言文本
5. **彩色输出** - 使用 ANSI 转义码区分不同类型的消息
6. **输入验证** - 端口、UUID、域名等参数都要验证格式
7. **默认值提示** - 交互输入时显示默认值，提升用户体验
8. **帮助文档** - 提供清晰的 `--help` 信息和使用示例

### 我们的接口设计

```bash
# 用户交互模块接口
ui_manager() {
  local mode=$1      # interactive|cli|help
  shift
  local args=("$@")  # 剩余参数
  
  case "$mode" in
    interactive)
      show_interactive_menu
      ;;
    cli)
      parse_cli_arguments "${args[@]}"
      ;;
    help)
      show_help_message
      ;;
  esac
}

# 命令行参数解析（统一接口）
parse_cli_arguments() {
  while [ $# -gt 0 ]; do
    case "$1" in
      -L|--language)
        set_language "$2"
        shift 2
        ;;
      -p|--port)
        validate_port "$2" || exit 1
        CONFIG[hysteria2_port]="$2"
        shift 2
        ;;
      -P|--password)
        CONFIG[hysteria2_password]="$2"
        shift 2
        ;;
      -r|--reality)
        CONFIG[enable_reality]=true
        shift
        ;;
      -a|--argo)
        CONFIG[argo_domain]="$2"
        CONFIG[argo_auth]="$3"
        shift 3
        ;;
      --non-interactive)
        NON_INTERACTIVE=true
        shift
        ;;
      -h|--help)
        show_help_message
        exit 0
        ;;
      *)
        error "未知参数: $1\n使用 --help 查看帮助"
        ;;
    esac
  done
}

# 交互式菜单（状态驱动）
show_interactive_menu() {
  while true; do
    # 检测当前状态
    local status=$(check_all_components_status)
    
    # 清屏并显示标题
    clear
    print_banner
    
    # 显示状态信息
    print_status_info "$status"
    
    # 根据状态生成菜单选项
    local menu_items=$(generate_menu_items "$status")
    print_menu_items "$menu_items"
    
    # 读取用户选择
    local choice
    read -rp "$(green '请选择操作 [0-9]: ')" choice
    
    # 执行对应操作
    handle_menu_choice "$choice" "$status"
  done
}

# 动态生成菜单选项
generate_menu_items() {
  local status=$1
  local items=()
  
  # 解析状态
  local singbox_status=$(echo "$status" | jq -r '.singbox')
  local argo_status=$(echo "$status" | jq -r '.argo')
  local nginx_status=$(echo "$status" | jq -r '.nginx')
  
  if [ "$singbox_status" -eq 0 ]; then
    # 未安装 sing-box
    items+=("1:$(t 'install_singbox')")
  else
    # 已安装 sing-box
    items+=("1:$(t 'modify_config')")
    items+=("2:$(t 'uninstall_singbox')")
    items+=("3:$(t 'upgrade_singbox')")
    items+=("4:$(t 'show_subscription')")
    
    # 如果 Argo 未安装，显示安装选项
    [ "$argo_status" -eq 0 ] && items+=("5:$(t 'install_argo')")
  fi
  
  items+=("0:$(t 'exit')")
  
  # 返回 JSON 数组
  printf '%s\n' "${items[@]}" | jq -R . | jq -s .
}

# 打印菜单选项
print_menu_items() {
  local items=$1
  
  echo ""
  echo "$items" | jq -r '.[] | split(":") | " \(.[0]). \(.[1])"'
  echo ""
}

# 处理菜单选择
handle_menu_choice() {
  local choice=$1
  local status=$2
  
  case "$choice" in
    1)
      if [ "$(echo "$status" | jq -r '.singbox')" -eq 0 ]; then
        install_singbox_wizard
      else
        modify_config_wizard
      fi
      ;;
    2)
      uninstall_singbox_wizard
      ;;
    3)
      upgrade_singbox_wizard
      ;;
    4)
      show_subscription_info
      ;;
    5)
      install_argo_wizard
      ;;
    0)
      info "$(t 'goodbye')"
      exit 0
      ;;
    *)
      error "$(t 'invalid_choice')"
      sleep 2
      ;;
  esac
}

# 多语言支持（使用 JSON 语言包）
t() {
  local key=$1
  local lang=${LANGUAGE:-en}
  
  # 从语言包文件读取
  jq -r ".${lang}.${key} // .en.${key}" "${SCRIPT_DIR}/i18n.json"
}

set_language() {
  local lang=$1
  
  case "$lang" in
    en|zh|ja|es|fr|de)
      LANGUAGE="$lang"
      export LANGUAGE
      ;;
    *)
      error "不支持的语言: $lang"
      ;;
  esac
}

# 彩色输出（统一接口）
print_colored() {
  local color=$1
  local text=$2
  
  case "$color" in
    red)    echo -e "\033[31m${text}\033[0m" ;;
    green)  echo -e "\033[32m${text}\033[0m" ;;
    yellow) echo -e "\033[33m${text}\033[0m" ;;
    blue)   echo -e "\033[34m${text}\033[0m" ;;
    cyan)   echo -e "\033[36m${text}\033[0m" ;;
    *)      echo "$text" ;;
  esac
}

info()    { print_colored green "✓ $1"; }
warning() { print_colored yellow "⚠ $1"; }
error()   { print_colored red "✗ $1"; exit 1; }
hint()    { print_colored cyan "ℹ $1"; }

# 用户输入（带验证）
prompt_input() {
  local prompt=$1
  local var_name=$2
  local default=$3
  local validator=$4  # 验证函数名
  
  while true; do
    if [ -n "$default" ]; then
      read -rp "$(green "$prompt") [默认: $default]: " input
      input="${input:-$default}"
    else
      read -rp "$(green "$prompt"): " input
    fi
    
    # 如果提供了验证函数，执行验证
    if [ -n "$validator" ]; then
      if $validator "$input"; then
        eval "$var_name='$input'"
        break
      else
        error "输入验证失败，请重试"
      fi
    else
      eval "$var_name='$input'"
      break
    fi
  done
}

# 协议选择向导
select_protocols_wizard() {
  echo ""
  print_colored cyan "=========================================="
  print_colored cyan "       选择要安装的协议"
  print_colored cyan "=========================================="
  echo ""
  
  local protocols=()
  
  # Reality
  prompt_yes_no "$(t 'install_reality')" install_reality
  [ "$install_reality" = "y" ] && protocols+=("reality")
  
  # Hysteria2
  prompt_yes_no "$(t 'install_hysteria2')" install_hy2
  if [ "$install_hy2" = "y" ]; then
    protocols+=("hysteria2")
    prompt_input "$(t 'hysteria2_port')" hy2_port "8881" validate_port
    prompt_input "$(t 'hysteria2_password')" hy2_password "" validate_password
  fi
  
  # VMess
  prompt_yes_no "$(t 'install_vmess')" install_vmess
  [ "$install_vmess" = "y" ] && protocols+=("vmess")
  
  # 返回选择的协议列表
  printf '%s\n' "${protocols[@]}" | jq -R . | jq -s .
}

# Yes/No 提示
prompt_yes_no() {
  local prompt=$1
  local var_name=$2
  local default=${3:-n}
  
  local choice
  read -rp "$(green "$prompt [y/N]: ")" choice
  choice="${choice:-$default}"
  
  eval "$var_name='${choice,,}'"
}

# 参数验证函数
validate_port() {
  local port=$1
  
  # 格式验证
  if ! [[ "$port" =~ ^[0-9]+$ ]]; then
    warning "端口必须是数字"
    return 1
  fi
  
  # 范围验证
  if [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
    warning "端口必须在 1-65535 之间"
    return 1
  fi
  
  # 占用检测
  if netstat -tuln 2>/dev/null | grep -q ":${port} "; then
    warning "端口 $port 已被占用"
    return 1
  fi
  
  return 0
}

validate_password() {
  local password=$1
  
  if [ ${#password} -lt 8 ]; then
    warning "密码长度至少 8 位"
    return 1
  fi
  
  return 0
}

validate_uuid() {
  local uuid=$1
  
  if ! [[ "$uuid" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
    warning "无效的 UUID 格式"
    return 1
  fi
  
  return 0
}

# 打印横幅
print_banner() {
  cat << 'EOF'
╔═══════════════════════════════════════════╗
║                                           ║
║       Sing-box 一键安装脚本 v2.0          ║
║                                           ║
╚═══════════════════════════════════════════╝
EOF
}

# 打印状态信息
print_status_info() {
  local status=$1
  
  echo ""
  echo "系统状态:"
  echo "  Sing-box: $(format_status $(echo "$status" | jq -r '.singbox'))"
  echo "  Nginx:    $(format_status $(echo "$status" | jq -r '.nginx'))"
  echo "  Argo:     $(format_status $(echo "$status" | jq -r '.argo'))"
  echo ""
}

format_status() {
  local code=$1
  
  case "$code" in
    0) print_colored red "未安装" ;;
    1) print_colored yellow "已停止" ;;
    2) print_colored green "运行中" ;;
    *) echo "未知" ;;
  esac
}
```

**语言包示例 (i18n.json)：**
```json
{
  "en": {
    "install_singbox": "Install Sing-box",
    "modify_config": "Modify Configuration",
    "uninstall_singbox": "Uninstall Sing-box",
    "upgrade_singbox": "Upgrade Sing-box",
    "show_subscription": "Show Subscription",
    "install_argo": "Install Argo Tunnel",
    "exit": "Exit",
    "invalid_choice": "Invalid choice",
    "goodbye": "Goodbye!",
    "install_reality": "Install Reality protocol?",
    "install_hysteria2": "Install Hysteria2 protocol?",
    "hysteria2_port": "Hysteria2 port",
    "hysteria2_password": "Hysteria2 password"
  },
  "zh": {
    "install_singbox": "安装 Sing-box",
    "modify_config": "修改配置",
    "uninstall_singbox": "卸载 Sing-box",
    "upgrade_singbox": "升级 Sing-box",
    "show_subscription": "查看订阅信息",
    "install_argo": "安装 Argo 隧道",
    "exit": "退出",
    "invalid_choice": "无效选择",
    "goodbye": "再见！",
    "install_reality": "是否安装 Reality 协议?",
    "install_hysteria2": "是否安装 Hysteria2 协议?",
    "hysteria2_port": "Hysteria2 端口",
    "hysteria2_password": "Hysteria2 密码"
  }
}
```

**使用示例：**
```bash
# 场景 1: 交互式安装
./install.sh

# 场景 2: 非交互式安装（命令行参数）
./install.sh -p 8881 -P mypassword -r --non-interactive

# 场景 3: 指定语言
./install.sh -L zh

# 场景 4: 查看帮助
./install.sh --help

# 场景 5: 混合模式（部分参数 + 部分交互）
./install.sh -p 8881  # 端口通过参数指定，其他选项交互询问
```

### 关键收获

1. **双模式设计** - 交互式菜单适合新手，命令行参数适合自动化部署
2. **参数优先级** - 命令行参数 > 环境变量 > 交互输入 > 默认值
3. **状态驱动菜单** - 根据当前安装状态动态生成菜单选项，避免无效操作
4. **国际化支持** - 使用 JSON 语言包，便于扩展新语言
5. **输入验证** - 每个用户输入都要验证格式和有效性，避免错误配置
6. **彩色输出** - 使用 ANSI 转义码区分不同类型的消息（成功/警告/错误）
7. **默认值提示** - 交互输入时显示默认值，减少用户输入负担
8. **帮助文档** - 提供清晰的 `--help` 信息和使用示例，降低学习成本

### 下次迭代重点

**错误处理与日志模块**
- 分析 fscarmen 如何处理各种错误场景
- 学习日志记录的最佳实践（分级、轮转、查询）
- 研究错误恢复策略和用户友好的错误提示

---

**迭代计数：** 11 / 20

## 迭代 7 (2026-03-01 18:49)

### 本次分析的模块
**错误处理与日志模块 (Error Handling & Logging)**

### fscarmen 的实现方式

**核心设计思路：**
1. **分级日志** - 使用 info/hint/warning/error 区分不同严重程度的消息
2. **彩色输出** - 通过 ANSI 转义码提升可读性（绿色=成功，黄色=警告，红色=错误）
3. **错误即退出** - `error()` 函数在输出错误信息后立即 `exit 1`，避免级联错误
4. **日志文件分离** - sing-box/argo/nginx 各自独立的日志文件
5. **日志轮转** - 通过 logrotate 或手动清理避免日志文件过大
6. **错误上下文** - 错误信息包含足够的上下文（文件路径、端口号、版本号等）

**关键代码片段：**

```bash
# 彩色输出函数
red() { echo -e "\033[31m\033[01m$1\033[0m"; }
green() { echo -e "\033[32m\033[01m$1\033[0m"; }
yellow() { echo -e "\033[33m\033[01m$1\033[0m"; }
blue() { echo -e "\033[36m\033[01m$1\033[0m"; }

# 日志级别函数
info() { green "$1"; }
hint() { yellow "$1"; }
warning() { yellow "$1"; }
error() { red "$1"; exit 1; }  # 错误后立即退出

# 带上下文的错误处理
download_singbox() {
  local version=$1
  local url="${GH_PROXY}https://github.com/SagerNet/sing-box/releases/download/v${version}/sing-box-${version}-linux-${ARCH}.tar.gz"
  
  if ! wget --no-check-certificate --continue "$url" -qO- | tar xz -C "$TEMP_DIR"; then
    error "下载 sing-box v${version} 失败\n  URL: $url\n  请检查网络连接或 GitHub 代理设置"
  fi
  
  if [ ! -s "$TEMP_DIR/sing-box" ]; then
    error "解压 sing-box 失败\n  临时目录: $TEMP_DIR\n  请检查磁盘空间"
  fi
}

# 日志文件配置
LOG_DIR="${WORK_DIR}/logs"
mkdir -p "$LOG_DIR"

# Sing-box 日志配置（JSON）
cat > ${WORK_DIR}/conf/00_log.json << EOF
{
  "log": {
    "level": "info",
    "output": "${LOG_DIR}/sing-box.log",
    "timestamp": true
  }
}
EOF

# Argo 日志重定向（systemd）
cat > /etc/systemd/system/argo.service << EOF
[Unit]
Description=Cloudflare Argo Tunnel
After=network.target

[Service]
Type=simple
ExecStart=${WORK_DIR}/cloudflared tunnel run --token ${ARGO_TOKEN}
StandardOutput=append:${LOG_DIR}/argo.log
StandardError=append:${LOG_DIR}/argo_error.log
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Nginx 日志配置
cat > ${WORK_DIR}/nginx.conf << EOF
error_log ${LOG_DIR}/nginx_error.log warn;
access_log ${LOG_DIR}/nginx_access.log combined;
EOF

# 日志查看函数
view_logs() {
  local service=$1
  local lines=${2:-50}
  
  case "$service" in
    singbox)
      tail -n "$lines" "${LOG_DIR}/sing-box.log"
      ;;
    argo)
      tail -n "$lines" "${LOG_DIR}/argo.log"
      ;;
    nginx)
      echo "=== Nginx Access Log ==="
      tail -n "$lines" "${LOG_DIR}/nginx_access.log"
      echo ""
      echo "=== Nginx Error Log ==="
      tail -n "$lines" "${LOG_DIR}/nginx_error.log"
      ;;
    all)
      view_logs singbox "$lines"
      echo ""
      view_logs argo "$lines"
      echo ""
      view_logs nginx "$lines"
      ;;
  esac
}

# 错误恢复策略
safe_execute() {
  local description=$1
  shift
  local command=("$@")
  
  info "正在执行: $description"
  
  if ! "${command[@]}" 2>&1 | tee /tmp/last_error.log; then
    warning "$description 失败，错误信息:"
    cat /tmp/last_error.log
    
    # 询问用户是否继续
    reading "是否继续执行? [y/N]" CONTINUE
    [ "${CONTINUE,,}" != 'y' ] && error "用户中止操作"
  fi
}

# 预检查（避免常见错误）
preflight_check() {
  local errors=()
  
  # 检查 root 权限
  [ "$EUID" -ne 0 ] && errors+=("需要 root 权限运行此脚本")
  
  # 检查磁盘空间（至少 100MB）
  local free_space=$(df /tmp | awk 'NR==2{print $4}')
  [ "$free_space" -lt 102400 ] && errors+=("磁盘空间不足（需要至少 100MB）")
  
  # 检查必要命令
  for cmd in wget tar jq openssl; do
    command -v "$cmd" &>/dev/null || errors+=("缺少必要命令: $cmd")
  done
  
  # 检查端口占用
  for port in ${PORT_HYSTERIA2} ${PORT_XTLS_REALITY} ${PORT_NGINX}; do
    [ -n "$port" ] && netstat -tuln | grep -q ":${port} " && \
      errors+=("端口 $port 已被占用")
  done
  
  # 输出错误
  if [ ${#errors[@]} -gt 0 ]; then
    error "预检查失败:\n$(printf '  - %s\n' "${errors[@]}")"
  fi
  
  info "预检查通过"
}

# 日志轮转配置
setup_logrotate() {
  cat > /etc/logrotate.d/sing-box << EOF
${LOG_DIR}/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0640 root root
    sharedscripts
    postrotate
        systemctl reload sing-box >/dev/null 2>&1 || true
        systemctl reload argo >/dev/null 2>&1 || true
        nginx -s reload >/dev/null 2>&1 || true
    endscript
}
EOF
}
```

**错误场景处理：**
```bash
# 场景 1: 下载失败（网络问题）
download_with_retry() {
  local url=$1
  local output=$2
  local max_retries=3
  local retry_count=0
  
  while [ $retry_count -lt $max_retries ]; do
    if wget --no-check-certificate --timeout=30 "$url" -O "$output" 2>&1 | tee /tmp/wget.log; then
      info "下载成功: $url"
      return 0
    else
      retry_count=$((retry_count + 1))
      warning "下载失败（第 $retry_count/$max_retries 次），3 秒后重试..."
      sleep 3
    fi
  done
  
  error "下载失败（已重试 $max_retries 次）\n  URL: $url\n  日志: /tmp/wget.log"
}

# 场景 2: 配置验证失败
validate_and_apply_config() {
  local config_dir=$1
  
  # 验证配置
  if ! ${WORK_DIR}/sing-box check -c "$config_dir" 2>&1 | tee /tmp/config_check.log; then
    error "配置验证失败\n  配置目录: $config_dir\n  详细信息:\n$(cat /tmp/config_check.log)"
  fi
  
  # 备份旧配置
  if [ -d "${WORK_DIR}/conf" ]; then
    cp -r "${WORK_DIR}/conf" "${WORK_DIR}/conf.bak.$(date +%s)"
  fi
  
  # 应用新配置
  rm -rf "${WORK_DIR}/conf"
  mv "$config_dir" "${WORK_DIR}/conf"
  
  # 重启服务
  if ! systemctl restart sing-box; then
    warning "服务重启失败，正在回滚配置..."
    mv "${WORK_DIR}/conf.bak."* "${WORK_DIR}/conf"
    systemctl restart sing-box
    error "配置应用失败，已回滚到旧配置"
  fi
  
  info "配置应用成功"
}

# 场景 3: 服务启动失败
start_service_with_diagnostics() {
  local service=$1
  
  if ! systemctl start "$service"; then
    warning "$service 启动失败，正在诊断..."
    
    # 收集诊断信息
    echo "=== 服务状态 ===" > /tmp/diagnostics.log
    systemctl status "$service" >> /tmp/diagnostics.log 2>&1
    
    echo "" >> /tmp/diagnostics.log
    echo "=== 最近日志 ===" >> /tmp/diagnostics.log
    journalctl -u "$service" -n 50 >> /tmp/diagnostics.log 2>&1
    
    echo "" >> /tmp/diagnostics.log
    echo "=== 配置文件 ===" >> /tmp/diagnostics.log
    cat "${WORK_DIR}/conf/"*.json >> /tmp/diagnostics.log 2>&1
    
    # 输出诊断信息
    cat /tmp/diagnostics.log
    
    error "$service 启动失败\n  诊断信息已保存到: /tmp/diagnostics.log"
  fi
}
```

### 提炼的设计原则

1. **错误即停止** - 遇到错误立即退出，避免级联错误导致系统状态不一致
2. **上下文丰富** - 错误信息包含足够的上下文（文件路径、URL、版本号等）
3. **日志分离** - 每个服务独立的日志文件，便于排查问题
4. **彩色输出** - 使用颜色区分不同级别的消息，提升可读性
5. **重试机制** - 网络操作失败时自动重试，提高成功率
6. **预检查** - 在执行主要操作前检查必要条件（权限、磁盘空间、端口占用）
7. **诊断信息** - 服务启动失败时自动收集诊断信息，便于用户反馈问题
8. **日志轮转** - 定期清理旧日志，避免磁盘占满

### 我们的接口设计

```bash
# 错误处理与日志模块接口
logger() {
  local level=$1      # debug|info|warning|error
  local message=$2
  local context=$3    # 可选的上下文信息（JSON 格式）
  
  # 1. 格式化消息
  local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  local formatted_message="[$timestamp] [$level] $message"
  
  # 2. 添加上下文
  if [ -n "$context" ]; then
    formatted_message+="\n  Context: $context"
  fi
  
  # 3. 输出到终端（带颜色）
  case "$level" in
    debug)
      [ "$LOG_LEVEL" = "debug" ] && echo -e "\033[90m$formatted_message\033[0m"
      ;;
    info)
      echo -e "\033[32m$formatted_message\033[0m"
      ;;
    warning)
      echo -e "\033[33m$formatted_message\033[0m"
      ;;
    error)
      echo -e "\033[31m$formatted_message\033[0m"
      ;;
  esac
  
  # 4. 写入日志文件
  echo -e "$formatted_message" >> "${LOG_DIR}/install.log"
  
  # 5. 错误级别立即退出
  [ "$level" = "error" ] && exit 1
}

# 简化的日志函数
log_debug()   { logger debug "$1" "$2"; }
log_info()    { logger info "$1" "$2"; }
log_warning() { logger warning "$1" "$2"; }
log_error()   { logger error "$1" "$2"; }

# 带重试的执行函数
execute_with_retry() {
  local description=$1
  local max_retries=${2:-3}
  local retry_delay=${3:-3}
  shift 3
  local command=("$@")
  
  local retry_count=0
  
  while [ $retry_count -lt $max_retries ]; do
    log_info "执行: $description (尝试 $((retry_count + 1))/$max_retries)"
    
    if "${command[@]}" 2>&1 | tee /tmp/last_execution.log; then
      log_info "$description 成功"
      return 0
    else
      retry_count=$((retry_count + 1))
      
      if [ $retry_count -lt $max_retries ]; then
        log_warning "$description 失败，${retry_delay} 秒后重试..."
        sleep "$retry_delay"
      fi
    fi
  done
  
  log_error "$description 失败（已重试 $max_retries 次）\n  日志: /tmp/last_execution.log\n  内容:\n$(cat /tmp/last_execution.log)"
}

# 预检查框架
preflight_check() {
  local checks=(
    "check_root_permission:检查 root 权限"
    "check_disk_space:检查磁盘空间"
    "check_required_commands:检查必要命令"
    "check_port_availability:检查端口占用"
    "check_system_compatibility:检查系统兼容性"
  )
  
  local failed_checks=()
  
  for check in "${checks[@]}"; do
    local check_func="${check%%:*}"
    local check_desc="${check##*:}"
    
    log_info "预检查: $check_desc"
    
    if ! $check_func; then
      failed_checks+=("$check_desc")
    fi
  done
  
  if [ ${#failed_checks[@]} -gt 0 ]; then
    log_error "预检查失败:\n$(printf '  ✗ %s\n' "${failed_checks[@]}")"
  fi
  
  log_info "预检查通过 ✓"
}

# 具体检查函数
check_root_permission() {
  [ "$EUID" -eq 0 ]
}

check_disk_space() {
  local required_mb=100
  local free_kb=$(df /tmp | awk 'NR==2{print $4}')
  local free_mb=$((free_kb / 1024))
  
  if [ $free_mb -lt $required_mb ]; then
    log_warning "磁盘空间不足: ${free_mb}MB < ${required_mb}MB"
    return 1
  fi
  
  return 0
}

check_required_commands() {
  local required_commands=(wget tar jq openssl curl)
  local missing_commands=()
  
  for cmd in "${required_commands[@]}"; do
    if ! command -v "$cmd" &>/dev/null; then
      missing_commands+=("$cmd")
    fi
  done
  
  if [ ${#missing_commands[@]} -gt 0 ]; then
    log_warning "缺少必要命令: ${missing_commands[*]}"
    return 1
  fi
  
  return 0
}

check_port_availability() {
  local ports_to_check=(${PORT_HYSTERIA2} ${PORT_XTLS_REALITY} ${PORT_NGINX})
  local occupied_ports=()
  
  for port in "${ports_to_check[@]}"; do
    if [ -n "$port" ] && netstat -tuln 2>/dev/null | grep -q ":${port} "; then
      local process=$(lsof -i ":${port}" 2>/dev/null | awk 'NR==2{print $1}')
      occupied_ports+=("$port ($process)")
    fi
  done
  
  if [ ${#occupied_ports[@]} -gt 0 ]; then
    log_warning "端口已被占用: ${occupied_ports[*]}"
    return 1
  fi
  
  return 0
}

# 日志查看器
view_logs() {
  local service=$1
  local lines=${2:-50}
  local follow=${3:-false}
  
  local log_file
  
  case "$service" in
    singbox)
      log_file="${LOG_DIR}/sing-box.log"
      ;;
    argo)
      log_file="${LOG_DIR}/argo.log"
      ;;
    nginx)
      log_file="${LOG_DIR}/nginx_error.log"
      ;;
    install)
      log_file="${LOG_DIR}/install.log"
      ;;
    *)
      log_error "未知服务: $service"
      ;;
  esac
  
  if [ ! -f "$log_file" ]; then
    log_warning "日志文件不存在: $log_file"
    return 1
  fi
  
  if [ "$follow" = "true" ]; then
    tail -f -n "$lines" "$log_file"
  else
    tail -n "$lines" "$log_file"
  fi
}

# 诊断信息收集
collect_diagnostics() {
  local output_file="/tmp/sing-box-diagnostics-$(date +%s).txt"
  
  {
    echo "========== 系统信息 =========="
    uname -a
    echo ""
    
    echo "========== 磁盘空间 =========="
    df -h
    echo ""
    
    echo "========== 服务状态 =========="
    systemctl status sing-box --no-pager
    systemctl status argo --no-pager
    echo ""
    
    echo "========== 配置文件 =========="
    for conf in ${WORK_DIR}/conf/*.json; do
      echo "--- $conf ---"
      cat "$conf"
      echo ""
    done
    
    echo "========== 最近日志 =========="
    echo "--- Sing-box ---"
    tail -n 100 "${LOG_DIR}/sing-box.log"
    echo ""
    echo "--- Argo ---"
    tail -n 100 "${LOG_DIR}/argo.log"
    echo ""
    echo "--- Nginx ---"
    tail -n 100 "${LOG_DIR}/nginx_error.log"
    
  } > "$output_file"
  
  log_info "诊断信息已保存到: $output_file"
  echo "$output_file"
}

# 日志轮转设置
setup_log_rotation() {
  local max_size_mb=${1:-10}
  local max_files=${2:-7}
  
  cat > /etc/logrotate.d/sing-box << EOF
${LOG_DIR}/*.log {
    size ${max_size_mb}M
    rotate ${max_files}
    compress
    delaycompress
    missingok
    notifempty
    create 0640 root root
    sharedscripts
    postrotate
        systemctl reload sing-box >/dev/null 2>&1 || true
        systemctl reload argo >/dev/null 2>&1 || true
        nginx -s reload >/dev/null 2>&1 || true
    endscript
}
EOF
  
  log_info "日志轮转已配置: 最大 ${max_size_mb}MB，保留 ${max_files} 个文件"
}
```

**使用示例：**
```bash
# 场景 1: 基本日志记录
log_info "开始安装 sing-box"
log_warning "检测到旧版本，将自动备份"
log_error "下载失败" '{"url":"https://example.com","status":404}'

# 场景 2: 带重试的下载
execute_with_retry \
  "下载 sing-box" \
  3 \
  5 \
  wget -O /tmp/sing-box.tar.gz https://example.com/sing-box.tar.gz

# 场景 3: 预检查
preflight_check

# 场景 4: 查看日志
view_logs singbox 100        # 查看最近 100 行
view_logs argo 50 true       # 实时跟踪日志

# 场景 5: 收集诊断信息
diagnostics_file=$(collect_diagnostics)
echo "请将此文件发送给技术支持: $diagnostics_file"

# 场景 6: 设置日志轮转
setup_log_rotation 10 7      # 每个日志文件最大 10MB，保留 7 个
```

### 关键收获

1. **错误即停止** - `error()` 函数在输出错误后立即 `exit 1`，避免级联错误
2. **上下文丰富** - 错误信息包含文件路径、URL、版本号等关键信息
3. **日志分离** - 每个服务独立的日志文件，便于排查问题
4. **彩色输出** - 使用 ANSI 转义码区分不同级别的消息
5. **重试机制** - 网络操作失败时自动重试，提高成功率
6. **预检查** - 在执行主要操作前检查必要条件
7. **诊断信息** - 服务启动失败时自动收集诊断信息
8. **日志轮转** - 定期清理旧日志，避免磁盘占满

### 下次迭代重点

**网络检测与代理模块**
- 分析 fscarmen 如何检测网络连通性
- 学习 GitHub 代理的配置和切换
- 研究 IPv4/IPv6 双栈支持

---

**迭代计数：** 7 / 20

## 迭代 8 (2026-03-01 18:59)

### 本次分析的模块
**网络检测与代理模块 (Network Detection & Proxy)**

### fscarmen 的实现方式

**核心设计思路：**
1. **多源检测** - 同时检测 IPv4 和 IPv6 连通性，优先使用可用的协议
2. **GitHub 代理** - 提供多个 GitHub 镜像源，自动选择最快的
3. **网络诊断** - 检测 DNS 解析、防火墙规则、路由表
4. **超时控制** - 所有网络操作都设置超时，避免长时间卡住
5. **降级策略** - IPv6 不可用时自动降级到 IPv4

**关键代码片段（基于 fscarmen 常见模式）：**

```bash
# IP 地址检测（IPv4/IPv6 双栈）
get_server_ip() {
  # 优先检测 IPv6
  SERVER_IP_V6=$(curl -s6m8 https://api64.ipify.org -k)
  
  # 检测 IPv4
  SERVER_IP_V4=$(curl -s4m8 https://api.ipify.org -k)
  
  # 选择可用的 IP
  if [ -n "$SERVER_IP_V6" ]; then
    SERVER_IP="$SERVER_IP_V6"
    IP_VERSION=6
  elif [ -n "$SERVER_IP_V4" ]; then
    SERVER_IP="$SERVER_IP_V4"
    IP_VERSION=4
  else
    error "无法获取服务器 IP 地址，请检查网络连接"
  fi
  
  info "检测到服务器 IP: $SERVER_IP (IPv$IP_VERSION)"
}

# GitHub 代理选择
select_github_proxy() {
  local proxies=(
    ""                                    # 直连
    "https://ghproxy.com/"               # GHProxy
    "https://mirror.ghproxy.com/"        # GHProxy 镜像
    "https://gh.api.99988866.xyz/"       # 第三方代理
  )
  
  local fastest_proxy=""
  local fastest_time=999999
  
  for proxy in "${proxies[@]}"; do
    local test_url="${proxy}https://github.com"
    local start_time=$(date +%s%3N)
    
    if curl -sL --max-time 5 "$test_url" >/dev/null 2>&1; then
      local end_time=$(date +%s%3N)
      local elapsed=$((end_time - start_time))
      
      if [ $elapsed -lt $fastest_time ]; then
        fastest_time=$elapsed
        fastest_proxy="$proxy"
      fi
    fi
  done
  
  if [ -z "$fastest_proxy" ]; then
    warning "所有 GitHub 代理均不可用，将使用直连"
    GH_PROXY=""
  else
    info "选择 GitHub 代理: ${fastest_proxy:-直连} (${fastest_time}ms)"
    GH_PROXY="$fastest_proxy"
  fi
}

# 网络连通性检测
check_network_connectivity() {
  local test_urls=(
    "https://www.google.com"
    "https://www.cloudflare.com"
    "https://github.com"
  )
  
  local reachable=false
  
  for url in "${test_urls[@]}"; do
    if curl -sL --max-time 5 "$url" >/dev/null 2>&1; then
      reachable=true
      break
    fi
  done
  
  if [ "$reachable" = false ]; then
    error "网络连接失败，请检查:\n  1. 网络是否连接\n  2. DNS 是否正常\n  3. 防火墙是否阻止"
  fi
  
  info "网络连通性检测通过"
}

# DNS 解析检测
check_dns_resolution() {
  local test_domains=(
    "github.com"
    "cloudflare.com"
    "google.com"
  )
  
  for domain in "${test_domains[@]}"; do
    if ! nslookup "$domain" >/dev/null 2>&1; then
      warning "DNS 解析失败: $domain"
      return 1
    fi
  done
  
  info "DNS 解析正常"
  return 0
}

# 防火墙规则检测
check_firewall_rules() {
  local ports_to_check=(${PORT_HYSTERIA2} ${PORT_XTLS_REALITY} ${PORT_NGINX})
  
  # 检测 iptables 规则
  if command -v iptables &>/dev/null; then
    for port in "${ports_to_check[@]}"; do
      if ! iptables -L INPUT -n | grep -q "dpt:$port"; then
        warning "端口 $port 未在防火墙中开放"
      fi
    done
  fi
  
  # 检测 firewalld 规则
  if command -v firewall-cmd &>/dev/null && systemctl is-active firewalld &>/dev/null; then
    for port in "${ports_to_check[@]}"; do
      if ! firewall-cmd --list-ports | grep -q "${port}/"; then
        warning "端口 $port 未在 firewalld 中开放"
      fi
    done
  fi
}

# 带超时的下载函数
download_with_timeout() {
  local url=$1
  local output=$2
  local timeout=${3:-30}
  
  if ! wget --timeout="$timeout" --tries=3 --no-check-certificate "$url" -O "$output" 2>&1; then
    return 1
  fi
  
  return 0
}
```

### 提炼的设计原则

1. **双栈支持** - 同时检测 IPv4 和 IPv6，优先使用 IPv6
2. **代理自动选择** - 测试多个 GitHub 代理，选择最快的
3. **超时控制** - 所有网络操作都设置超时（通常 5-30 秒）
4. **降级策略** - IPv6 不可用时自动降级到 IPv4
5. **多源验证** - 使用多个测试 URL 验证网络连通性
6. **防火墙检测** - 检查 iptables/firewalld 规则，提前发现端口问题
7. **DNS 诊断** - 检测 DNS 解析是否正常

### 我们的接口设计

```bash
# 网络检测与代理模块接口
network_manager() {
  local action=$1      # detect|proxy|diagnose
  shift
  local args=("$@")
  
  case "$action" in
    detect)
      detect_network_environment
      ;;
    proxy)
      select_best_proxy "${args[@]}"
      ;;
    diagnose)
      diagnose_network_issues
      ;;
  esac
}

# 网络环境检测（综合）
detect_network_environment() {
  log_info "开始检测网络环境..."
  
  # 1. 检测 IP 地址
  detect_server_ip
  
  # 2. 检测网络连通性
  check_internet_connectivity
  
  # 3. 检测 DNS 解析
  check_dns_resolution
  
  # 4. 选择 GitHub 代理
  select_github_proxy
  
  # 5. 检测防火墙规则
  check_firewall_configuration
  
  log_info "网络环境检测完成"
}

# IP 地址检测（IPv4/IPv6 双栈）
detect_server_ip() {
  local ipv6_apis=(
    "https://api64.ipify.org"
    "https://v6.ident.me"
    "https://ipv6.icanhazip.com"
  )
  
  local ipv4_apis=(
    "https://api.ipify.org"
    "https://v4.ident.me"
    "https://ipv4.icanhazip.com"
  )
  
  # 检测 IPv6
  for api in "${ipv6_apis[@]}"; do
    SERVER_IP_V6=$(curl -s6m5 "$api" -k 2>/dev/null)
    [ -n "$SERVER_IP_V6" ] && break
  done
  
  # 检测 IPv4
  for api in "${ipv4_apis[@]}"; do
    SERVER_IP_V4=$(curl -s4m5 "$api" -k 2>/dev/null)
    [ -n "$SERVER_IP_V4" ] && break
  done
  
  # 选择可用的 IP
  if [ -n "$SERVER_IP_V6" ]; then
    SERVER_IP="$SERVER_IP_V6"
    IP_VERSION=6
    log_info "检测到 IPv6 地址: $SERVER_IP"
  elif [ -n "$SERVER_IP_V4" ]; then
    SERVER_IP="$SERVER_IP_V4"
    IP_VERSION=4
    log_info "检测到 IPv4 地址: $SERVER_IP"
  else
    log_error "无法获取服务器 IP 地址\n  请检查:\n  1. 网络连接是否正常\n  2. 防火墙是否阻止出站连接"
  fi
  
  # 导出环境变量
  export SERVER_IP SERVER_IP_V4 SERVER_IP_V6 IP_VERSION
}

# 网络连通性检测
check_internet_connectivity() {
  local test_targets=(
    "https://www.cloudflare.com:443"
    "https://www.google.com:443"
    "https://github.com:443"
    "8.8.8.8:53"
  )
  
  local reachable_count=0
  
  for target in "${test_targets[@]}"; do
    local host="${target%%:*}"
    local port="${target##*:}"
    
    if timeout 5 bash -c "echo >/dev/tcp/${host}/${port}" 2>/dev/null; then
      reachable_count=$((reachable_count + 1))
      log_debug "可达: $target"
    else
      log_debug "不可达: $target"
    fi
  done
  
  if [ $reachable_count -eq 0 ]; then
    log_error "网络连接失败\n  所有测试目标均不可达\n  请检查网络连接和防火墙设置"
  fi
  
  log_info "网络连通性检测通过 ($reachable_count/${#test_targets[@]} 可达)"
}

# DNS 解析检测
check_dns_resolution() {
  local test_domains=(
    "github.com"
    "cloudflare.com"
    "google.com"
  )
  
  local failed_domains=()
  
  for domain in "${test_domains[@]}"; do
    if ! timeout 5 nslookup "$domain" >/dev/null 2>&1; then
      failed_domains+=("$domain")
    fi
  done
  
  if [ ${#failed_domains[@]} -gt 0 ]; then
    log_warning "DNS 解析失败: ${failed_domains[*]}\n  建议检查 /etc/resolv.conf 配置"
    return 1
  fi
  
  log_info "DNS 解析正常"
  return 0
}

# GitHub 代理选择（自动测速）
select_github_proxy() {
  local proxies=(
    ":直连"
    "https://ghproxy.com/:GHProxy"
    "https://mirror.ghproxy.com/:GHProxy 镜像"
    "https://gh.api.99988866.xyz/:第三方代理"
  )
  
  local fastest_proxy=""
  local fastest_name="直连"
  local fastest_time=999999
  
  log_info "正在测试 GitHub 代理速度..."
  
  for proxy_entry in "${proxies[@]}"; do
    local proxy="${proxy_entry%%:*}"
    local name="${proxy_entry##*:}"
    local test_url="${proxy}https://github.com"
    
    local start_time=$(date +%s%3N)
    
    if timeout 5 curl -sL "$test_url" >/dev/null 2>&1; then
      local end_time=$(date +%s%3N)
      local elapsed=$((end_time - start_time))
      
      log_debug "$name: ${elapsed}ms"
      
      if [ $elapsed -lt $fastest_time ]; then
        fastest_time=$elapsed
        fastest_proxy="$proxy"
        fastest_name="$name"
      fi
    else
      log_debug "$name: 超时"
    fi
  done
  
  if [ -z "$fastest_proxy" ] && [ $fastest_time -eq 999999 ]; then
    log_warning "所有 GitHub 代理均不可用，将使用直连"
    GH_PROXY=""
  else
    log_info "选择 GitHub 代理: $fastest_name (${fastest_time}ms)"
    GH_PROXY="$fastest_proxy"
  fi
  
  export GH_PROXY
}

# 防火墙配置检测
check_firewall_configuration() {
  local ports_to_check=(${PORT_HYSTERIA2} ${PORT_XTLS_REALITY} ${PORT_NGINX})
  local warnings=()
  
  # 检测 iptables
  if command -v iptables &>/dev/null; then
    for port in "${ports_to_check[@]}"; do
      [ -z "$port" ] && continue
      
      if ! iptables -L INPUT -n 2>/dev/null | grep -q "dpt:$port"; then
        warnings+=("iptables: 端口 $port 未开放")
      fi
    done
  fi
  
  # 检测 firewalld
  if command -v firewall-cmd &>/dev/null && systemctl is-active firewalld &>/dev/null 2>&1; then
    for port in "${ports_to_check[@]}"; do
      [ -z "$port" ] && continue
      
      if ! firewall-cmd --list-ports 2>/dev/null | grep -q "${port}/"; then
        warnings+=("firewalld: 端口 $port 未开放")
      fi
    done
  fi
  
  # 检测 ufw
  if command -v ufw &>/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
    for port in "${ports_to_check[@]}"; do
      [ -z "$port" ] && continue
      
      if ! ufw status 2>/dev/null | grep -q "$port"; then
        warnings+=("ufw: 端口 $port 未开放")
      fi
    done
  fi
  
  if [ ${#warnings[@]} -gt 0 ]; then
    log_warning "防火墙配置问题:\n$(printf '  - %s\n' "${warnings[@]}")"
  else
    log_info "防火墙配置检测通过"
  fi
}

# 网络诊断（综合）
diagnose_network_issues() {
  local diagnostics_file="/tmp/network-diagnostics-$(date +%s).txt"
  
  {
    echo "========== 网络诊断报告 =========="
    echo "时间: $(date)"
    echo ""
    
    echo "========== IP 地址 =========="
    echo "IPv4: ${SERVER_IP_V4:-未检测到}"
    echo "IPv6: ${SERVER_IP_V6:-未检测到}"
    echo ""
    
    echo "========== 网络接口 =========="
    ip addr show
    echo ""
    
    echo "========== 路由表 =========="
    ip route show
    echo ""
    
    echo "========== DNS 配置 =========="
    cat /etc/resolv.conf
    echo ""
    
    echo "========== DNS 解析测试 =========="
    for domain in github.com cloudflare.com google.com; do
      echo "--- $domain ---"
      nslookup "$domain" 2>&1
      echo ""
    done
    
    echo "========== 防火墙规则 =========="
    if command -v iptables &>/dev/null; then
      echo "--- iptables ---"
      iptables -L -n -v
      echo ""
    fi
    
    if command -v firewall-cmd &>/dev/null; then
      echo "--- firewalld ---"
      firewall-cmd --list-all 2>&1
      echo ""
    fi
    
    if command -v ufw &>/dev/null; then
      echo "--- ufw ---"
      ufw status verbose 2>&1
      echo ""
    fi
    
    echo "========== 端口监听 =========="
    netstat -tuln
    echo ""
    
    echo "========== 连通性测试 =========="
    for target in github.com:443 cloudflare.com:443 8.8.8.8:53; do
      echo "--- $target ---"
      timeout 5 bash -c "echo >/dev/tcp/${target/:/ }" 2>&1 && echo "成功" || echo "失败"
      echo ""
    done
    
  } > "$diagnostics_file"
  
  log_info "网络诊断报告已保存到: $diagnostics_file"
  echo "$diagnostics_file"
}

# 带超时和重试的下载函数
download_file() {
  local url=$1
  local output=$2
  local timeout=${3:-30}
  local max_retries=${4:-3}
  
  # 使用 GitHub 代理（如果已配置）
  local final_url="${GH_PROXY}${url}"
  
  local retry_count=0
  
  while [ $retry_count -lt $max_retries ]; do
    log_debug "下载: $final_url (尝试 $((retry_count + 1))/$max_retries)"
    
    if wget --timeout="$timeout" --tries=1 --no-check-certificate "$final_url" -O "$output" 2>&1 | tee /tmp/wget.log; then
      log_info "下载成功: $(basename "$output")"
      return 0
    else
      retry_count=$((retry_count + 1))
      
      if [ $retry_count -lt $max_retries ]; then
        log_warning "下载失败，3 秒后重试..."
        sleep 3
      fi
    fi
  done
  
  log_error "下载失败（已重试 $max_retries 次）\n  URL: $url\n  日志: /tmp/wget.log"
}
```

**使用示例：**
```bash
# 场景 1: 完整网络环境检测
network_manager detect

# 场景 2: 手动选择 GitHub 代理
network_manager proxy

# 场景 3: 网络诊断
diagnostics_file=$(network_manager diagnose)
cat "$diagnostics_file"

# 场景 4: 下载文件（自动使用代理）
download_file \
  "https://github.com/SagerNet/sing-box/releases/download/v1.8.0/sing-box-1.8.0-linux-amd64.tar.gz" \
  "/tmp/sing-box.tar.gz" \
  30 \
  3
```

### 关键收获

1. **双栈支持** - 同时检测 IPv4 和 IPv6，优先使用 IPv6
2. **代理自动选择** - 测试多个 GitHub 代理，选择最快的
3. **超时控制** - 所有网络操作都设置超时（5-30 秒）
4. **降级策略** - IPv6 不可用时自动降级到 IPv4
5. **多源验证** - 使用多个 API 和测试 URL 提高可靠性
6. **防火墙检测** - 检查 iptables/firewalld/ufw 规则
7. **DNS 诊断** - 检测 DNS 解析是否正常
8. **网络诊断报告** - 收集完整的网络配置信息，便于排查问题

### 下次迭代重点

**证书管理模块 (自签证书生成与 ACME 自动续期)**
- 分析 fscarmen 如何生成自签证书
- 学习 ACME 协议（Let's Encrypt）自动申请证书
- 研究证书指纹验证和 pinnedPeerCertSha256

---

**迭代计数：** 9 / 20

## 迭代 9 (2026-03-01 19:09)

### 本次分析的模块
**证书管理模块 (自签证书生成与指纹验证)**

### fscarmen 的实现方式

**核心设计思路：**
1. **自签证书生成** - 使用 OpenSSL 生成自签名证书，避免依赖 CA
2. **证书指纹验证** - 通过 SHA256/Base64 指纹替代 `skip-cert-verify`，提升安全性
3. **证书有效期** - 默认 10 年有效期，避免频繁更新
4. **多格式支持** - 同时生成 PEM 和 DER 格式，适配不同客户端
5. **证书复用** - 多个协议共享同一证书，简化管理

**关键代码片段（基于 fscarmen 常见模式）：**

```bash
# 自签证书生成
generate_self_signed_cert() {
  local cert_dir="${WORK_DIR}/cert"
  local domain=${TLS_SERVER_DEFAULT:-"example.com"}
  
  mkdir -p "$cert_dir"
  
  # 生成私钥和证书
  openssl req -x509 -nodes -newkey ec:<(openssl ecparam -name prime256v1) \
    -keyout "${cert_dir}/private.key" \
    -out "${cert_dir}/cert.pem" \
    -subj "/CN=${domain}" \
    -days 3650 \
    -addext "subjectAltName=DNS:${domain},DNS:*.${domain}"
  
  # 设置权限
  chmod 600 "${cert_dir}/private.key"
  chmod 644 "${cert_dir}/cert.pem"
  
  info "自签证书已生成: ${cert_dir}/cert.pem"
}

# 证书指纹提取（SHA256）
get_cert_fingerprint_sha256() {
  local cert_file="${WORK_DIR}/cert/cert.pem"
  
  openssl x509 -fingerprint -noout -sha256 -in "$cert_file" | \
    awk -F '=' '{print $NF}' | \
    tr -d ':'
}

# 证书指纹提取（Base64）
get_cert_fingerprint_base64() {
  local cert_file="${WORK_DIR}/cert/cert.pem"
  
  openssl x509 -in "$cert_file" -pubkey -noout | \
    openssl pkey -pubin -outform der | \
    openssl dgst -sha256 -binary | \
    openssl enc -base64
}

# 在订阅生成中使用指纹
export_hysteria2_node() {
  local fingerprint=$(get_cert_fingerprint_sha256)
  
  cat << EOF
  - name: "Hysteria2"
    type: hysteria2
    server: ${SERVER_IP}
    port: ${PORT_HYSTERIA2}
    password: ${UUID[12]}
    sni: ${TLS_SERVER_DEFAULT}
    skip-cert-verify: false
    fingerprint: ${fingerprint}
EOF
}
```

### 提炼的设计原则

1. **自签证书优先** - 避免依赖外部 CA，简化部署流程
2. **指纹验证** - 使用 `pinnedPeerCertSha256` 替代 `skip-cert-verify`，防御 MITM 攻击
3. **长有效期** - 10 年有效期，减少维护负担
4. **证书复用** - 多个协议共享同一证书，简化管理
5. **权限控制** - 私钥 600 权限，证书 644 权限
6. **多格式支持** - 同时生成 SHA256 和 Base64 指纹，适配不同客户端

### 我们的接口设计

```bash
# 证书管理模块接口
cert_manager() {
  local action=$1      # generate|fingerprint|validate|renew
  shift
  local args=("$@")
  
  case "$action" in
    generate)
      generate_certificate "${args[@]}"
      ;;
    fingerprint)
      get_certificate_fingerprint "${args[@]}"
      ;;
    validate)
      validate_certificate "${args[@]}"
      ;;
    renew)
      renew_certificate "${args[@]}"
      ;;
  esac
}

# 证书生成（自签名）
generate_certificate() {
  local domain=${1:-"example.com"}
  local validity_days=${2:-3650}
  local cert_dir="${WORK_DIR}/cert"
  
  mkdir -p "$cert_dir"
  
  log_info "生成自签证书: $domain (有效期 $validity_days 天)"
  
  # 生成 ECC 私钥和证书
  openssl req -x509 -nodes -newkey ec:<(openssl ecparam -name prime256v1) \
    -keyout "${cert_dir}/private.key" \
    -out "${cert_dir}/cert.pem" \
    -subj "/CN=${domain}" \
    -days "$validity_days" \
    -addext "subjectAltName=DNS:${domain},DNS:*.${domain}" \
    2>&1 | tee /tmp/openssl.log
  
  if [ ! -s "${cert_dir}/cert.pem" ]; then
    log_error "证书生成失败\n  日志: /tmp/openssl.log"
  fi
  
  # 设置权限
  chmod 600 "${cert_dir}/private.key"
  chmod 644 "${cert_dir}/cert.pem"
  
  # 生成 DER 格式（某些客户端需要）
  openssl x509 -in "${cert_dir}/cert.pem" -outform DER -out "${cert_dir}/cert.der"
  
  log_info "证书已生成:\n  证书: ${cert_dir}/cert.pem\n  私钥: ${cert_dir}/private.key"
}

# 证书指纹提取
get_certificate_fingerprint() {
  local format=${1:-sha256}  # sha256 或 base64
  local cert_file="${WORK_DIR}/cert/cert.pem"
  
  if [ ! -f "$cert_file" ]; then
    log_error "证书文件不存在: $cert_file"
  fi
  
  case "$format" in
    sha256)
      openssl x509 -fingerprint -noout -sha256 -in "$cert_file" | \
        awk -F '=' '{print $NF}' | \
        tr -d ':'
      ;;
    base64)
      openssl x509 -in "$cert_file" -pubkey -noout | \
        openssl pkey -pubin -outform der | \
        openssl dgst -sha256 -binary | \
        openssl enc -base64
      ;;
    *)
      log_error "不支持的指纹格式: $format (支持: sha256, base64)"
      ;;
  esac
}

# 证书验证
validate_certificate() {
  local cert_file="${WORK_DIR}/cert/cert.pem"
  
  if [ ! -f "$cert_file" ]; then
    log_warning "证书文件不存在: $cert_file"
    return 1
  fi
  
  # 检查证书格式
  if ! openssl x509 -in "$cert_file" -noout 2>/dev/null; then
    log_error "证书格式无效: $cert_file"
  fi
  
  # 检查证书有效期
  local expiry_date=$(openssl x509 -enddate -noout -in "$cert_file" | cut -d= -f2)
  local expiry_epoch=$(date -d "$expiry_date" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$expiry_date" +%s)
  local now_epoch=$(date +%s)
  
  if [ $expiry_epoch -lt $now_epoch ]; then
    log_error "证书已过期: $expiry_date"
  fi
  
  # 检查证书即将过期（30 天内）
  local days_left=$(( ($expiry_epoch - $now_epoch) / 86400 ))
  if [ $days_left -lt 30 ]; then
    log_warning "证书将在 $days_left 天后过期"
  else
    log_info "证书有效期剩余 $days_left 天"
  fi
  
  # 检查私钥匹配
  local cert_modulus=$(openssl x509 -noout -modulus -in "$cert_file" 2>/dev/null | openssl md5)
  local key_modulus=$(openssl rsa -noout -modulus -in "${WORK_DIR}/cert/private.key" 2>/dev/null | openssl md5)
  
  if [ "$cert_modulus" != "$key_modulus" ]; then
    log_error "证书和私钥不匹配"
  fi
  
  log_info "证书验证通过"
  return 0
}

# 证书续期
renew_certificate() {
  local domain=${1:-"example.com"}
  local validity_days=${2:-3650}
  
  log_info "续期证书: $domain"
  
  # 备份旧证书
  local backup_dir="${WORK_DIR}/cert/backup"
  mkdir -p "$backup_dir"
  
  local timestamp=$(date +%Y%m%d_%H%M%S)
  cp "${WORK_DIR}/cert/cert.pem" "${backup_dir}/cert_${timestamp}.pem"
  cp "${WORK_DIR}/cert/private.key" "${backup_dir}/private_${timestamp}.key"
  
  # 生成新证书
  generate_certificate "$domain" "$validity_days"
  
  # 重启服务以加载新证书
  service_control restart sing-box
  
  log_info "证书续期完成"
}
```

**使用示例：**
```bash
# 场景 1: 生成自签证书
cert_manager generate "example.com" 3650

# 场景 2: 获取证书指纹
fingerprint_sha256=$(cert_manager fingerprint sha256)
fingerprint_base64=$(cert_manager fingerprint base64)

echo "SHA256: $fingerprint_sha256"
echo "Base64: $fingerprint_base64"

# 场景 3: 验证证书
cert_manager validate

# 场景 4: 续期证书
cert_manager renew "example.com" 3650
```

### 关键收获

1. **自签证书** - 使用 OpenSSL 生成，避免依赖外部 CA
2. **指纹验证** - SHA256/Base64 指纹替代 `skip-cert-verify`，提升安全性
3. **长有效期** - 10 年有效期，减少维护负担
4. **证书复用** - 多个协议共享同一证书
5. **权限控制** - 私钥 600，证书 644
6. **多格式支持** - 同时生成 PEM 和 DER 格式

### 下次迭代重点

**UUID/密钥生成模块**
- 分析 fscarmen 如何生成 UUID 和密钥
- 学习 Reality 公私钥对生成
- 研究密钥强度和随机性保证

---

**迭代计数：** 11 / 20

## 迭代 10 (2026-03-01 19:19)

### 本次分析的模块
**UUID/密钥生成模块 (UUID & Key Generation)**

### fscarmen 的实现方式

**核心设计思路：**
1. **UUID 生成** - 使用 `uuidgen` 或 `/proc/sys/kernel/random/uuid` 生成标准 UUID
2. **Reality 密钥对** - 使用 `sing-box generate reality-keypair` 生成公私钥
3. **随机密码** - 使用 `openssl rand` 或 `/dev/urandom` 生成强随机密码
4. **密钥持久化** - 生成后保存到配置文件，避免重复生成导致客户端失效
5. **密钥验证** - 检查密钥格式和强度

**关键代码片段（基于 fscarmen 常见模式）：**

```bash
# UUID 生成
generate_uuid() {
  if command -v uuidgen &>/dev/null; then
    uuidgen
  else
    cat /proc/sys/kernel/random/uuid
  fi
}

# Reality 密钥对生成
generate_reality_keypair() {
  local output=$(${WORK_DIR}/sing-box generate reality-keypair)
  
  REALITY_PRIVATE=$(echo "$output" | awk '/PrivateKey/{print $NF}')
  REALITY_PUBLIC=$(echo "$output" | awk '/PublicKey/{print $NF}')
  
  echo "Private: $REALITY_PRIVATE"
  echo "Public: $REALITY_PUBLIC"
}

# 随机密码生成
generate_random_password() {
  local length=${1:-16}
  
  openssl rand -base64 $((length * 3 / 4)) | tr -d '/+=' | head -c "$length"
}

# 初始化所有密钥
initialize_keys() {
  # 生成 UUID（用于各协议）
  UUID[11]=$(generate_uuid)  # Reality
  UUID[12]=$(generate_uuid)  # Hysteria2
  UUID[13]=$(generate_uuid)  # VMess
  UUID[14]=$(generate_uuid)  # Trojan
  
  # 生成 Reality 密钥对
  generate_reality_keypair
  REALITY_PRIVATE[11]="$REALITY_PRIVATE"
  REALITY_PUBLIC[11]="$REALITY_PUBLIC"
  
  # 生成随机密码（用于 Hysteria2）
  [ -z "${PASSWORD[12]}" ] && PASSWORD[12]=$(generate_random_password 16)
}
```

### 提炼的设计原则

1. **标准 UUID** - 使用 `uuidgen` 或内核随机源生成符合 RFC 4122 的 UUID
2. **强随机性** - 使用 `/dev/urandom` 或 `openssl rand` 保证密钥强度
3. **密钥持久化** - 生成后保存到配置文件，避免重复生成
4. **格式验证** - 检查生成的密钥是否符合预期格式
5. **密钥隔离** - 不同协议使用不同的 UUID，避免关联性攻击

### 我们的接口设计

```bash
# UUID/密钥生成模块接口
keygen_manager() {
  local action=$1      # uuid|reality|password|all
  shift
  local args=("$@")
  
  case "$action" in
    uuid)
      generate_uuid_key
      ;;
    reality)
      generate_reality_keys
      ;;
    password)
      generate_random_password "${args[@]}"
      ;;
    all)
      initialize_all_keys
      ;;
  esac
}

# UUID 生成（标准 RFC 4122）
generate_uuid_key() {
  local uuid
  
  # 优先使用 uuidgen
  if command -v uuidgen &>/dev/null; then
    uuid=$(uuidgen)
  # 回退到内核随机源
  elif [ -f /proc/sys/kernel/random/uuid ]; then
    uuid=$(cat /proc/sys/kernel/random/uuid)
  # 最后使用 Python（如果可用）
  elif command -v python3 &>/dev/null; then
    uuid=$(python3 -c "import uuid; print(uuid.uuid4())")
  else
    log_error "无法生成 UUID\n  请安装 uuidgen 或确保 /proc/sys/kernel/random/uuid 可用"
  fi
  
  # 验证 UUID 格式
  if ! [[ "$uuid" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
    log_error "生成的 UUID 格式无效: $uuid"
  fi
  
  echo "$uuid"
}

# Reality 密钥对生成
generate_reality_keys() {
  local singbox_binary="${WORK_DIR}/sing-box"
  
  if [ ! -x "$singbox_binary" ]; then
    log_error "sing-box 二进制文件不存在: $singbox_binary"
  fi
  
  # 生成密钥对
  local output=$("$singbox_binary" generate reality-keypair 2>&1)
  
  if [ $? -ne 0 ]; then
    log_error "Reality 密钥对生成失败\n  输出: $output"
  fi
  
  # 提取公私钥
  local private_key=$(echo "$output" | awk '/PrivateKey/{print $NF}')
  local public_key=$(echo "$output" | awk '/PublicKey/{print $NF}')
  
  # 验证密钥格式（Base64）
  if ! [[ "$private_key" =~ ^[A-Za-z0-9+/=]+$ ]] || ! [[ "$public_key" =~ ^[A-Za-z0-9+/=]+$ ]]; then
    log_error "Reality 密钥格式无效\n  Private: $private_key\n  Public: $public_key"
  fi
  
  # 返回 JSON 格式
  jq -n \
    --arg private "$private_key" \
    --arg public "$public_key" \
    '{private: $private, public: $public}'
}

# 随机密码生成
generate_random_password() {
  local length=${1:-16}
  local charset=${2:-alphanumeric}  # alphanumeric|base64|hex
  
  local password
  
  case "$charset" in
    alphanumeric)
      # 字母+数字（易读）
      password=$(tr -dc 'A-Za-z0-9' < /dev/urandom | head -c "$length")
      ;;
    base64)
      # Base64 编码（高熵）
      password=$(openssl rand -base64 $((length * 3 / 4)) | tr -d '/+=' | head -c "$length")
      ;;
    hex)
      # 十六进制（兼容性好）
      password=$(openssl rand -hex $((length / 2)))
      ;;
    *)
      log_error "不支持的字符集: $charset (支持: alphanumeric, base64, hex)"
      ;;
  esac
  
  # 验证密码长度
  if [ ${#password} -lt "$length" ]; then
    log_error "生成的密码长度不足: ${#password} < $length"
  fi
  
  echo "$password"
}

# 初始化所有密钥
initialize_all_keys() {
  log_info "初始化所有密钥..."
  
  # 生成 UUID（用于各协议）
  declare -gA PROTOCOL_UUIDS
  PROTOCOL_UUIDS[reality]=$(generate_uuid_key)
  PROTOCOL_UUIDS[hysteria2]=$(generate_uuid_key)
  PROTOCOL_UUIDS[vmess]=$(generate_uuid_key)
  PROTOCOL_UUIDS[trojan]=$(generate_uuid_key)
  
  log_info "UUID 已生成"
  
  # 生成 Reality 密钥对
  local reality_keys=$(generate_reality_keys)
  REALITY_PRIVATE=$(echo "$reality_keys" | jq -r '.private')
  REALITY_PUBLIC=$(echo "$reality_keys" | jq -r '.public')
  
  log_info "Reality 密钥对已生成"
  
  # 生成 Hysteria2 密码
  HYSTERIA2_PASSWORD=$(generate_random_password 16 base64)
  
  log_info "Hysteria2 密码已生成"
  
  # 保存到配置文件
  save_keys_to_config
}

# 保存密钥到配置文件
save_keys_to_config() {
  local config_file="${WORK_DIR}/keys.json"
  
  # 构建 JSON 并保存
  # ... (省略具体实现)
  
  chmod 600 "$config_file"
  log_info "密钥已保存到: $config_file"
}
```

**使用示例：**
```bash
# 场景 1: 生成单个 UUID
uuid=$(keygen_manager uuid)
echo "UUID: $uuid"

# 场景 2: 生成 Reality 密钥对
reality_keys=$(keygen_manager reality)
echo "$reality_keys" | jq .

# 场景 3: 生成随机密码
password=$(keygen_manager password 16 base64)
echo "Password: $password"

# 场景 4: 初始化所有密钥
keygen_manager all
```

### 关键收获

1. **标准 UUID** - 使用 `uuidgen` 或内核随机源生成符合 RFC 4122 的 UUID
2. **强随机性** - 使用 `/dev/urandom` 或 `openssl rand` 保证密钥强度
3. **密钥持久化** - 生成后保存到 JSON 配置文件，避免重复生成
4. **格式验证** - 检查生成的密钥是否符合预期格式
5. **密钥隔离** - 不同协议使用不同的 UUID，避免关联性攻击
6. **权限控制** - 密钥文件 600 权限，防止泄露
7. **多字符集支持** - 支持 alphanumeric/base64/hex 三种密码格式

### 下次迭代重点

**总结与架构整合**
- 回顾前 10 次迭代的核心模块
- 设计模块间的接口和数据流
- 绘制完整的系统架构图
- 制定下一阶段的开发计划

---

**迭代计数：** 11 / 20

---

## 🎯 阶段性总结（迭代 1-10）

经过 10 次迭代，我们已经完成了 Sing-box 管理系统的核心模块设计：

### 已完成的模块

1. **配置文件生成模块** - 分层配置、模板化生成
2. **服务管理模块** - 跨平台 systemd/OpenRC 支持
3. **节点信息导出模块** - 多客户端订阅生成
4. **配置验证与回滚模块** - 原子操作、自动回滚
5. **依赖管理模块** - Nginx/Argo 协同启动
6. **用户交互模块** - 双模式（交互式/CLI）、多语言
7. **错误处理与日志模块** - 分级日志、诊断信息收集
8. **网络检测与代理模块** - IPv4/IPv6 双栈、GitHub 代理自动选择
9. **证书管理模块** - 自签证书生成、指纹验证
10. **UUID/密钥生成模块** - 强随机性、密钥持久化

### 核心设计原则

- **模块化** - 每个功能独立成模块，接口清晰
- **可扩展** - 新增协议只需添加对应的配置生成函数
- **健壮性** - 错误处理、重试机制、自动回滚
- **跨平台** - 支持 systemd/OpenRC、IPv4/IPv6
- **用户友好** - 交互式菜单、彩色输出、多语言支持

### 下一阶段计划（迭代 11-20）

- 端口管理模块
- 协议配置模板库
- 自动化测试框架
- 性能监控模块
- 备份恢复系统
- Web 管理界面（可选）
- Docker 容器化部署
- 一键脚本整合
- 文档生成工具
- 社区贡献指南

---

继续迭代...

## 迭代 11 (2026-03-01 21:59)

### 本次分析的模块
**端口管理模块 (Port Management & Allocation)**

### fscarmen 的实现方式

**核心设计思路：**
1. **端口范围规划** - 为不同协议预留端口范围（如 8881-8890）
2. **端口占用检测** - 使用 `netstat`/`ss` 检测端口是否被占用
3. **端口跳跃支持** - Hysteria2 的 Port Hopping 功能（范围端口）
4. **动态端口分配** - 如果默认端口被占用，自动分配可用端口
5. **端口持久化** - 将分配的端口保存到配置文件，避免重启后变化

**关键代码片段（基于 fscarmen 常见模式）：**

```bash
# 端口占用检测
check_port_in_use() {
  local port=$1
  
  # 使用 netstat 检测（兼容性好）
  if command -v netstat &>/dev/null; then
    netstat -tuln | grep -q ":${port} "
    return $?
  fi
  
  # 使用 ss 检测（更快）
  if command -v ss &>/dev/null; then
    ss -tuln | grep -q ":${port} "
    return $?
  fi
  
  # 使用 lsof 检测（最准确）
  if command -v lsof &>/dev/null; then
    lsof -i ":${port}" >/dev/null 2>&1
    return $?
  fi
  
  # 都不可用，返回未占用
  return 1
}

# 查找可用端口
find_available_port() {
  local start_port=${1:-8881}
  local end_port=${2:-8900}
  
  for port in $(seq $start_port $end_port); do
    if ! check_port_in_use "$port"; then
      echo "$port"
      return 0
    fi
  done
  
  error "端口范围 $start_port-$end_port 内无可用端口"
}

# 端口跳跃范围分配（Hysteria2）
allocate_port_hopping_range() {
  local base_port=${1:-50000}
  local range_size=${2:-1000}
  
  local start_port=$base_port
  local end_port=$((base_port + range_size - 1))
  
  # 检查范围内是否有冲突
  local conflicts=()
  for port in $(seq $start_port $end_port); do
    if check_port_in_use "$port"; then
      conflicts+=("$port")
    fi
  done
  
  if [ ${#conflicts[@]} -gt 0 ]; then
    warning "端口跳跃范围 $start_port-$end_port 内有 ${#conflicts[@]} 个端口被占用"
    # 可以选择：1. 跳过冲突端口  2. 重新分配范围
  fi
  
  echo "$start_port:$end_port"
}

# 端口配置初始化
initialize_ports() {
  # Reality 端口
  if [ -z "$PORT_XTLS_REALITY" ]; then
    PORT_XTLS_REALITY=$(find_available_port 8881 8890)
  fi
  
  # Hysteria2 端口
  if [ -z "$PORT_HYSTERIA2" ]; then
    PORT_HYSTERIA2=$(find_available_port 8891 8900)
  fi
  
  # Nginx 订阅服务端口
  if [ -z "$PORT_NGINX" ]; then
    PORT_NGINX=$(find_available_port 8080 8090)
  fi
  
  # Hysteria2 端口跳跃范围
  if [ "$ENABLE_PORT_HOPPING" = "true" ]; then
    local hopping_range=$(allocate_port_hopping_range 50000 1000)
    PORT_HOPPING_START="${hopping_range%%:*}"
    PORT_HOPPING_END="${hopping_range##*:}"
  fi
  
  info "端口分配完成:\n  Reality: $PORT_XTLS_REALITY\n  Hysteria2: $PORT_HYSTERIA2\n  Nginx: $PORT_NGINX"
}

# 防火墙端口开放
open_firewall_ports() {
  local ports=("$@")
  
  # iptables
  if command -v iptables &>/dev/null; then
    for port in "${ports[@]}"; do
      iptables -I INPUT -p tcp --dport "$port" -j ACCEPT
      iptables -I INPUT -p udp --dport "$port" -j ACCEPT
    done
    
    # 保存规则
    if command -v iptables-save &>/dev/null; then
      iptables-save > /etc/iptables/rules.v4
    fi
  fi
  
  # firewalld
  if command -v firewall-cmd &>/dev/null && systemctl is-active firewalld &>/dev/null; then
    for port in "${ports[@]}"; do
      firewall-cmd --permanent --add-port="${port}/tcp"
      firewall-cmd --permanent --add-port="${port}/udp"
    done
    firewall-cmd --reload
  fi
  
  # ufw
  if command -v ufw &>/dev/null && ufw status | grep -q "Status: active"; then
    for port in "${ports[@]}"; do
      ufw allow "$port"
    done
  fi
}
```

### 提炼的设计原则

1. **端口范围规划** - 为不同协议预留独立的端口范围，避免冲突
2. **占用检测** - 使用多种工具（netstat/ss/lsof）检测端口占用
3. **动态分配** - 默认端口被占用时自动查找可用端口
4. **端口跳跃** - Hysteria2 支持端口跳跃，需要分配连续范围
5. **防火墙联动** - 自动在 iptables/firewalld/ufw 中开放端口
6. **端口持久化** - 将分配的端口保存到配置文件

### 我们的接口设计

```bash
# 端口管理模块接口
port_manager() {
  local action=$1      # check|allocate|open|release
  shift
  local args=("$@")
  
  case "$action" in
    check)
      check_port_availability "${args[@]}"
      ;;
    allocate)
      allocate_ports "${args[@]}"
      ;;
    open)
      open_firewall_port "${args[@]}"
      ;;
    release)
      release_port "${args[@]}"
      ;;
  esac
}

# 端口占用检测（多工具支持）
check_port_availability() {
  local port=$1
  
  # 参数验证
  if ! [[ "$port" =~ ^[0-9]+$ ]] || [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
    log_error "无效端口: $port (必须是 1-65535)"
  fi
  
  # 优先使用 ss（性能最好）
  if command -v ss &>/dev/null; then
    if ss -tuln | grep -q ":${port} "; then
      return 1  # 端口被占用
    fi
  # 回退到 netstat（兼容性好）
  elif command -v netstat &>/dev/null; then
    if netstat -tuln | grep -q ":${port} "; then
      return 1
    fi
  # 最后使用 lsof（最准确）
  elif command -v lsof &>/dev/null; then
    if lsof -i ":${port}" >/dev/null 2>&1; then
      return 1
    fi
  else
    log_warning "无法检测端口占用（缺少 ss/netstat/lsof）"
    return 0  # 假设可用
  fi
  
  return 0  # 端口可用
}

# 查找可用端口
find_available_port() {
  local start_port=${1:-8881}
  local end_port=${2:-8900}
  local protocol=${3:-tcp}  # tcp|udp|both
  
  log_debug "查找可用端口: $start_port-$end_port ($protocol)"
  
  for port in $(seq $start_port $end_port); do
    if check_port_availability "$port"; then
      log_debug "找到可用端口: $port"
      echo "$port"
      return 0
    fi
  done
  
  log_error "端口范围 $start_port-$end_port 内无可用端口"
}

# 端口范围分配（用于端口跳跃）
allocate_port_range() {
  local base_port=${1:-50000}
  local range_size=${2:-1000}
  local allow_conflicts=${3:-false}  # 是否允许部分端口被占用
  
  local start_port=$base_port
  local end_port=$((base_port + range_size - 1))
  
  log_info "分配端口范围: $start_port-$end_port"
  
  # 检查范围内的端口占用情况
  local conflicts=()
  local sample_size=10  # 采样检测（避免检测 1000 个端口太慢）
  local step=$((range_size / sample_size))
  
  for i in $(seq 0 $((sample_size - 1))); do
    local port=$((start_port + i * step))
    if check_port_availability "$port"; then
      :  # 端口可用
    else
      conflicts+=("$port")
    fi
  done
  
  # 如果有冲突且不允许冲突，则报错
  if [ ${#conflicts[@]} -gt 0 ] && [ "$allow_conflicts" = "false" ]; then
    log_error "端口范围 $start_port-$end_port 内有端口被占用: ${conflicts[*]}\n  建议更换基础端口"
  fi
  
  # 如果有冲突但允许冲突，则警告
  if [ ${#conflicts[@]} -gt 0 ]; then
    log_warning "端口范围 $start_port-$end_port 内有 ${#conflicts[@]} 个端口被占用（已忽略）"
  fi
  
  # 返回 JSON 格式
  jq -n \
    --arg start "$start_port" \
    --arg end "$end_port" \
    --argjson conflicts "$(printf '%s\n' "${conflicts[@]}" | jq -R . | jq -s .)" \
    '{start: $start, end: $end, conflicts: $conflicts}'
}

# 端口分配（批量）
allocate_ports() {
  local config_file="${WORK_DIR}/ports.json"
  
  log_info "开始分配端口..."
  
  # 读取已保存的端口配置（如果存在）
  if [ -f "$config_file" ]; then
    log_info "检测到已保存的端口配置，将复用"
    PORT_REALITY=$(jq -r '.reality // empty' "$config_file")
    PORT_HYSTERIA2=$(jq -r '.hysteria2 // empty' "$config_file")
    PORT_NGINX=$(jq -r '.nginx // empty' "$config_file")
  fi
  
  # Reality 端口
  if [ -z "$PORT_REALITY" ]; then
    PORT_REALITY=$(find_available_port 8881 8890)
    log_info "Reality 端口: $PORT_REALITY"
  else
    log_info "Reality 端口（复用）: $PORT_REALITY"
  fi
  
  # Hysteria2 端口
  if [ -z "$PORT_HYSTERIA2" ]; then
    PORT_HYSTERIA2=$(find_available_port 8891 8900)
    log_info "Hysteria2 端口: $PORT_HYSTERIA2"
  else
    log_info "Hysteria2 端口（复用）: $PORT_HYSTERIA2"
  fi
  
  # Nginx 订阅服务端口
  if [ -z "$PORT_NGINX" ]; then
    PORT_NGINX=$(find_available_port 8080 8090)
    log_info "Nginx 端口: $PORT_NGINX"
  else
    log_info "Nginx 端口（复用）: $PORT_NGINX"
  fi
  
  # Hysteria2 端口跳跃范围（可选）
  if [ "$ENABLE_PORT_HOPPING" = "true" ]; then
    local hopping_range=$(allocate_port_range 50000 1000 true)
    PORT_HOPPING_START=$(echo "$hopping_range" | jq -r '.start')
    PORT_HOPPING_END=$(echo "$hopping_range" | jq -r '.end')
    log_info "端口跳跃范围: $PORT_HOPPING_START-$PORT_HOPPING_END"
  fi
  
  # 保存端口配置
  save_port_config
  
  # 导出环境变量
  export PORT_REALITY PORT_HYSTERIA2 PORT_NGINX PORT_HOPPING_START PORT_HOPPING_END
}

# 保存端口配置
save_port_config() {
  local config_file="${WORK_DIR}/ports.json"
  
  jq -n \
    --arg reality "$PORT_REALITY" \
    --arg hysteria2 "$PORT_HYSTERIA2" \
    --arg nginx "$PORT_NGINX" \
    --arg hopping_start "${PORT_HOPPING_START:-}" \
    --arg hopping_end "${PORT_HOPPING_END:-}" \
    '{
      reality: $reality,
      hysteria2: $hysteria2,
      nginx: $nginx,
      port_hopping: {
        enabled: ($hopping_start != ""),
        start: $hopping_start,
        end: $hopping_end
      }
    }' > "$config_file"
  
  chmod 600 "$config_file"
  log_debug "端口配置已保存到: $config_file"
}

# 防火墙端口开放
open_firewall_port() {
  local port=$1
  local protocol=${2:-both}  # tcp|udp|both
  
  log_info "在防火墙中开放端口: $port ($protocol)"
  
  # iptables
  if command -v iptables &>/dev/null; then
    case "$protocol" in
      tcp)
        iptables -I INPUT -p tcp --dport "$port" -j ACCEPT
        ;;
      udp)
        iptables -I INPUT -p udp --dport "$port" -j ACCEPT
        ;;
      both)
        iptables -I INPUT -p tcp --dport "$port" -j ACCEPT
        iptables -I INPUT -p udp --dport "$port" -j ACCEPT
        ;;
    esac
    
    # 保存规则（Debian/Ubuntu）
    if [ -d /etc/iptables ]; then
      iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
    fi
    
    # 保存规则（CentOS/RHEL）
    if command -v service &>/dev/null; then
      service iptables save 2>/dev/null || true
    fi
  fi
  
  # firewalld
  if command -v firewall-cmd &>/dev/null && systemctl is-active firewalld &>/dev/null 2>&1; then
    case "$protocol" in
      tcp)
        firewall-cmd --permanent --add-port="${port}/tcp"
        ;;
      udp)
        firewall-cmd --permanent --add-port="${port}/udp"
        ;;
      both)
        firewall-cmd --permanent --add-port="${port}/tcp"
        firewall-cmd --permanent --add-port="${port}/udp"
        ;;
    esac
    firewall-cmd --reload
  fi
  
  # ufw
  if command -v ufw &>/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
    case "$protocol" in
      tcp)
        ufw allow "$port/tcp"
        ;;
      udp)
        ufw allow "$port/udp"
        ;;
      both)
        ufw allow "$port"
        ;;
    esac
  fi
  
  log_info "端口 $port 已在防火墙中开放"
}

# 批量开放端口
open_all_ports() {
  local ports=(${PORT_REALITY} ${PORT_HYSTERIA2} ${PORT_NGINX})
  
  for port in "${ports[@]}"; do
    [ -n "$port" ] && open_firewall_port "$port" both
  done
  
  # 如果启用端口跳跃，开放范围
  if [ -n "$PORT_HOPPING_START" ] && [ -n "$PORT_HOPPING_END" ]; then
    log_info "开放端口跳跃范围: $PORT_HOPPING_START-$PORT_HOPPING_END"
    
    # iptables 支持范围
    if command -v iptables &>/dev/null; then
      iptables -I INPUT -p udp --dport "$PORT_HOPPING_START:$PORT_HOPPING_END" -j ACCEPT
    fi
    
    # firewalld 需要逐个开放（或使用 rich rule）
    if command -v firewall-cmd &>/dev/null && systemctl is-active firewalld &>/dev/null 2>&1; then
      firewall-cmd --permanent --add-rich-rule="rule family=ipv4 port protocol=udp port=$PORT_HOPPING_START-$PORT_HOPPING_END accept"
      firewall-cmd --reload
    fi
  fi
}

# 释放端口（从防火墙中移除）
release_port() {
  local port=$1
  local protocol=${2:-both}
  
  log_info "从防火墙中移除端口: $port ($protocol)"
  
  # iptables
  if command -v iptables &>/dev/null; then
    case "$protocol" in
      tcp)
        iptables -D INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || true
        ;;
      udp)
        iptables -D INPUT -p udp --dport "$port" -j ACCEPT 2>/dev/null || true
        ;;
      both)
        iptables -D INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || true
        iptables -D INPUT -p udp --dport "$port" -j ACCEPT 2>/dev/null || true
        ;;
    esac
  fi
  
  # firewalld
  if command -v firewall-cmd &>/dev/null && systemctl is-active firewalld &>/dev/null 2>&1; then
    case "$protocol" in
      tcp)
        firewall-cmd --permanent --remove-port="${port}/tcp" 2>/dev/null || true
        ;;
      udp)
        firewall-cmd --permanent --remove-port="${port}/udp" 2>/dev/null || true
        ;;
      both)
        firewall-cmd --permanent --remove-port="${port}/tcp" 2>/dev/null || true
        firewall-cmd --permanent --remove-port="${port}/udp" 2>/dev/null || true
        ;;
    esac
    firewall-cmd --reload
  fi
  
  # ufw
  if command -v ufw &>/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
    case "$protocol" in
      tcp)
        ufw delete allow "$port/tcp" 2>/dev/null || true
        ;;
      udp)
        ufw delete allow "$port/udp" 2>/dev/null || true
        ;;
      both)
        ufw delete allow "$port" 2>/dev/null || true
        ;;
    esac
  fi
}
```

**使用示例：**
```bash
# 场景 1: 检查端口是否可用
if port_manager check 8881; then
  echo "端口 8881 可用"
else
  echo "端口 8881 已被占用"
fi

# 场景 2: 分配所有端口
port_manager allocate

# 场景 3: 在防火墙中开放端口
port_manager open 8881 both
port_manager open 8882 udp

# 场景 4: 批量开放所有端口
open_all_ports

# 场景 5: 释放端口
port_manager release 8881 both
```

### 关键收获

1. **多工具检测** - 使用 ss/netstat/lsof 多种工具检测端口占用，提高兼容性
2. **动态分配** - 默认端口被占用时自动查找可用端口
3. **端口范围** - 支持端口跳跃（Port Hopping）的范围分配
4. **防火墙联动** - 自动在 iptables/firewalld/ufw 中开放端口
5. **端口持久化** - 将分配的端口保存到 JSON 文件，避免重启后变化
6. **采样检测** - 端口范围检测时使用采样，避免检测 1000 个端口太慢
7. **跨平台支持** - 兼容不同的防火墙工具（iptables/firewalld/ufw）

### 下次迭代重点

**协议配置模板库**
- 分析 fscarmen 如何为不同协议生成配置
- 学习 Reality/Hysteria2/VMess/Trojan 的配置模板
- 研究配置参数的最佳实践和安全建议

---

**迭代计数：** 11 / 20

