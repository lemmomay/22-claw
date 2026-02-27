#!/bin/sh
set -e

# 配置
APP_NAME="chatroom"
APP_DIR="/root/chatroom"
DEFAULT_PORT=28881
LOG_FILE="/var/log/chatroom.log"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_info() { echo "${BLUE}ℹ${NC} $1"; }
print_success() { echo "${GREEN}✓${NC} $1"; }
print_warning() { echo "${YELLOW}⚠${NC} $1"; }
print_error() { echo "${RED}✗${NC} $1"; }

# 检测系统类型
detect_init_system() {
    if command -v systemctl >/dev/null 2>&1 && systemctl --version >/dev/null 2>&1; then
        echo "systemd"
    elif [ -d /etc/init.d ] && ([ -f /sbin/openrc ] || [ -f /sbin/rc-service ]); then
        echo "openrc"
    else
        echo "unknown"
    fi
}

# 检测包管理器
detect_package_manager() {
    if command -v apk >/dev/null 2>&1; then
        echo "apk"
    elif command -v apt-get >/dev/null 2>&1; then
        echo "apt"
    elif command -v yum >/dev/null 2>&1; then
        echo "yum"
    else
        echo "unknown"
    fi
}

# 检查依赖
check_dependencies() {
    print_info "检查系统依赖..."
    
    local missing=""
    
    # 检查 Node.js
    if ! command -v node >/dev/null 2>&1; then
        missing="${missing}nodejs "
    else
        local node_version=$(node --version | sed 's/v//' | cut -d. -f1)
        if [ "$node_version" -lt 18 ]; then
            print_warning "Node.js 版本过低 (需要 18+)，当前: $(node --version)"
            missing="${missing}nodejs "
        else
            print_success "Node.js $(node --version)"
        fi
    fi
    
    # 检查 npm
    if ! command -v npm >/dev/null 2>&1; then
        missing="${missing}npm "
    else
        print_success "npm $(npm --version)"
    fi
    
    if [ -n "$missing" ]; then
        print_warning "缺少依赖: $missing"
        return 1
    else
        print_success "所有依赖已满足"
        return 0
    fi
}

# 安装依赖
install_system_dependencies() {
    local pm=$(detect_package_manager)
    
    print_info "安装系统依赖..."
    
    case "$pm" in
        apk)
            apk add --no-cache nodejs npm
            ;;
        apt)
            apt-get update && apt-get install -y nodejs npm
            ;;
        yum)
            yum install -y nodejs npm
            ;;
        *)
            print_error "无法自动安装依赖，请手动安装 Node.js 18+ 和 npm"
            return 1
            ;;
    esac
    
    print_success "系统依赖安装完成"
}

# 安装项目依赖
install_app_dependencies() {
    print_info "安装项目依赖..."
    cd "$APP_DIR"
    npm install --production --no-optional --silent
    print_success "项目依赖安装完成"
}

# 配置端口
configure_port() {
    local port=$1
    
    if [ -z "$port" ]; then
        printf "请输入端口号 [默认: $DEFAULT_PORT]: "
        read -r port
        port=${port:-$DEFAULT_PORT}
    fi
    
    # 验证端口号
    if ! echo "$port" | grep -qE '^[0-9]+$' || [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
        print_error "无效的端口号: $port"
        return 1
    fi
    
    # 检查端口占用
    if command -v netstat >/dev/null 2>&1; then
        if netstat -tuln 2>/dev/null | grep -q ":$port "; then
            print_warning "端口 $port 已被占用"
            return 1
        fi
    elif command -v ss >/dev/null 2>&1; then
        if ss -tuln 2>/dev/null | grep -q ":$port "; then
            print_warning "端口 $port 已被占用"
            return 1
        fi
    fi
    
    # 更新配置文件
    if [ -f "$APP_DIR/src/config.js" ]; then
        sed -i "s/PORT:.*||.*/PORT: process.env.PORT || $port,/" "$APP_DIR/src/config.js"
    fi
    
    # 设置环境变量
    export PORT=$port
    
    print_success "端口配置为: $port"
    echo "$port" > "$APP_DIR/.port"
}

# 安装服务
install_service() {
    local init_system=$1
    local port=${2:-$DEFAULT_PORT}
    
    print_info "安装系统服务..."
    
    case "$init_system" in
        systemd)
            # 生成 service 文件
            cat > /etc/systemd/system/${APP_NAME}.service << EOF
[Unit]
Description=Chatroom - Temporary Chatroom Service
Documentation=https://github.com/lemmomay/22-claw/tree/master/chatroom
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${APP_DIR}
Environment="PORT=${port}"
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10
StandardOutput=append:${LOG_FILE}
StandardError=append:${LOG_FILE}

# Security hardening
NoNewPrivileges=true
PrivateTmp=true

# Resource limits
LimitNOFILE=4096
MemoryMax=128M
CPUQuota=50%

[Install]
WantedBy=multi-user.target
EOF
            
            chmod 644 /etc/systemd/system/${APP_NAME}.service
            systemctl daemon-reload
            systemctl enable ${APP_NAME}.service
            
            print_success "systemd 服务已安装"
            ;;
            
        openrc)
            # 生成 init 脚本
            cat > /etc/init.d/${APP_NAME} << 'EOF'
#!/sbin/openrc-run

name="chatroom"
description="Temporary Chatroom Service"

: ${chatroom_user:="root"}
: ${chatroom_dir:="/root/chatroom"}
: ${chatroom_port:="28881"}
: ${chatroom_log:="/var/log/chatroom.log"}
: ${chatroom_pidfile:="/var/run/chatroom.pid"}

command="/usr/bin/node"
command_args="server.js"
command_background="yes"
pidfile="${chatroom_pidfile}"
directory="${chatroom_dir}"

depend() {
    need net
    after firewall
}

start_pre() {
    export PORT="${chatroom_port}"
    export NODE_ENV="production"
    checkpath --directory --owner ${chatroom_user} --mode 0755 $(dirname ${chatroom_log})
    checkpath --directory --owner ${chatroom_user} --mode 0755 $(dirname ${chatroom_pidfile})
}

start() {
    ebegin "Starting ${name}"
    cd "${directory}" || return 1
    start-stop-daemon --start \
        --background \
        --make-pidfile \
        --pidfile "${pidfile}" \
        --user "${chatroom_user}" \
        --stdout "${chatroom_log}" \
        --stderr "${chatroom_log}" \
        --env PORT="${chatroom_port}" \
        --env NODE_ENV="production" \
        --exec "${command}" \
        -- ${command_args}
    eend $?
}

stop() {
    ebegin "Stopping ${name}"
    start-stop-daemon --stop \
        --pidfile "${pidfile}" \
        --retry 15
    eend $?
}
EOF
            
            # 更新配置
            sed -i "s|chatroom_dir:=.*|chatroom_dir:=\"${APP_DIR}\"|" /etc/init.d/${APP_NAME}
            sed -i "s|chatroom_port:=.*|chatroom_port:=\"${port}\"|" /etc/init.d/${APP_NAME}
            
            chmod 755 /etc/init.d/${APP_NAME}
            rc-update add ${APP_NAME} default
            
            print_success "OpenRC 服务已安装"
            ;;
            
        *)
            print_error "未检测到 systemd 或 OpenRC"
            return 1
            ;;
    esac
}

# 卸载服务
uninstall_service() {
    local init_system=$1
    
    print_info "卸载系统服务..."
    
    # 先停止服务
    stop_service "$init_system" 2>/dev/null || true
    
    case "$init_system" in
        systemd)
            systemctl disable ${APP_NAME}.service 2>/dev/null || true
            rm -f /etc/systemd/system/${APP_NAME}.service
            systemctl daemon-reload
            print_success "systemd 服务已卸载"
            ;;
            
        openrc)
            rc-update del ${APP_NAME} default 2>/dev/null || true
            rm -f /etc/init.d/${APP_NAME}
            print_success "OpenRC 服务已卸载"
            ;;
    esac
}

# 启动服务
start_service() {
    local init_system=$1
    
    print_info "启动服务..."
    
    case "$init_system" in
        systemd)
            systemctl start ${APP_NAME}
            sleep 2
            if systemctl is-active --quiet ${APP_NAME}; then
                print_success "服务已启动"
                systemctl status ${APP_NAME} --no-pager -l
            else
                print_error "服务启动失败"
                systemctl status ${APP_NAME} --no-pager -l
                return 1
            fi
            ;;
            
        openrc)
            rc-service ${APP_NAME} start
            sleep 2
            if rc-service ${APP_NAME} status | grep -q "started"; then
                print_success "服务已启动"
            else
                print_error "服务启动失败"
                return 1
            fi
            ;;
            
        *)
            print_info "手动启动服务..."
            cd "$APP_DIR"
            nohup node server.js > "$LOG_FILE" 2>&1 &
            echo $! > /var/run/${APP_NAME}.pid
            sleep 2
            if ps -p $(cat /var/run/${APP_NAME}.pid) > /dev/null 2>&1; then
                print_success "服务已启动 (PID: $(cat /var/run/${APP_NAME}.pid))"
            else
                print_error "服务启动失败"
                return 1
            fi
            ;;
    esac
}

# 停止服务
stop_service() {
    local init_system=$1
    
    print_info "停止服务..."
    
    case "$init_system" in
        systemd)
            systemctl stop ${APP_NAME}
            print_success "服务已停止"
            ;;
            
        openrc)
            rc-service ${APP_NAME} stop
            print_success "服务已停止"
            ;;
            
        *)
            if [ -f /var/run/${APP_NAME}.pid ]; then
                kill $(cat /var/run/${APP_NAME}.pid) 2>/dev/null || true
                rm -f /var/run/${APP_NAME}.pid
                print_success "服务已停止"
            else
                pkill -f "node.*server.js" || true
                print_success "服务已停止"
            fi
            ;;
    esac
}

# 重启服务
restart_service() {
    local init_system=$1
    
    stop_service "$init_system"
    sleep 2
    start_service "$init_system"
}

# 查看服务状态
status_service() {
    local init_system=$1
    
    case "$init_system" in
        systemd)
            systemctl status ${APP_NAME} --no-pager -l
            ;;
            
        openrc)
            rc-service ${APP_NAME} status
            ;;
            
        *)
            if [ -f /var/run/${APP_NAME}.pid ]; then
                local pid=$(cat /var/run/${APP_NAME}.pid)
                if ps -p $pid > /dev/null 2>&1; then
                    print_success "服务运行中 (PID: $pid)"
                else
                    print_error "服务未运行（但 PID 文件存在）"
                fi
            else
                print_error "服务未运行"
            fi
            ;;
    esac
}

# 查看日志
view_logs() {
    if [ -f "$LOG_FILE" ]; then
        tail -f "$LOG_FILE"
    else
        print_error "日志文件不存在: $LOG_FILE"
    fi
}

# 完整安装
do_install() {
    echo ""
    echo "╔════════════════════════════════════════╗"
    echo "║   Chatroom 安装脚本                 ║"
    echo "╚════════════════════════════════════════╝"
    echo ""
    
    # 检查是否在项目目录
    if [ ! -f "server.js" ] || [ ! -f "package.json" ]; then
        print_error "请在 chatroom 目录下运行此脚本"
        exit 1
    fi
    
    # 检测系统
    INIT_SYSTEM=$(detect_init_system)
    PKG_MANAGER=$(detect_package_manager)
    
    print_info "系统信息:"
    echo "  Init 系统: $INIT_SYSTEM"
    echo "  包管理器: $PKG_MANAGER"
    echo ""
    
    # 检查依赖
    if ! check_dependencies; then
        printf "是否自动安装缺失的依赖? [Y/n] "
        read -r answer
        case "$answer" in
            [Nn]*) 
                print_error "请手动安装依赖后重试"
                exit 1
                ;;
            *)
                install_system_dependencies || exit 1
                ;;
        esac
    fi
    
    # 配置端口
    configure_port "$1" || exit 1
    PORT=$(cat "$APP_DIR/.port" 2>/dev/null || echo "$DEFAULT_PORT")
    
    # 安装项目依赖
    install_app_dependencies || exit 1
    
    # 安装服务
    printf "\n是否安装为系统服务? [Y/n] "
    read -r answer
    case "$answer" in
        [Nn]*)
            print_info "跳过服务安装"
            echo ""
            print_info "手动启动命令:"
            echo "  PORT=$PORT node server.js"
            echo "或后台运行:"
            echo "  PORT=$PORT nohup node server.js > chatroom.log 2>&1 &"
            ;;
        *)
            install_service "$INIT_SYSTEM" "$PORT" || exit 1
            
            # 启动服务
            printf "\n是否立即启动服务? [Y/n] "
            read -r start_answer
            case "$start_answer" in
                [Nn]*)
                    print_info "服务未启动"
                    ;;
                *)
                    start_service "$INIT_SYSTEM" || exit 1
                    ;;
            esac
            
            # 显示管理命令
            echo ""
            print_info "服务管理命令:"
            case "$INIT_SYSTEM" in
                systemd)
                    echo "  启动: systemctl start ${APP_NAME}"
                    echo "  停止: systemctl stop ${APP_NAME}"
                    echo "  重启: systemctl restart ${APP_NAME}"
                    echo "  状态: systemctl status ${APP_NAME}"
                    echo "  日志: journalctl -u ${APP_NAME} -f"
                    ;;
                openrc)
                    echo "  启动: rc-service ${APP_NAME} start"
                    echo "  停止: rc-service ${APP_NAME} stop"
                    echo "  重启: rc-service ${APP_NAME} restart"
                    echo "  状态: rc-service ${APP_NAME} status"
                    echo "  日志: tail -f ${LOG_FILE}"
                    ;;
            esac
            
            echo ""
            print_info "或使用此脚本管理:"
            echo "  $0 start|stop|restart|status|logs"
            ;;
    esac
    
    echo ""
    print_success "安装完成！"
    echo ""
    
    # 获取 IP 地址
    local ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    [ -z "$ip" ] && ip="<your-ip>"
    
    print_info "访问地址: http://${ip}:${PORT}"
    print_info "健康检查: http://${ip}:${PORT}/health"
    echo ""
}

# 卸载
do_uninstall() {
    echo ""
    print_warning "即将卸载 Chatroom"
    printf "确认卸载? [y/N] "
    read -r answer
    case "$answer" in
        [Yy]*)
            INIT_SYSTEM=$(detect_init_system)
            uninstall_service "$INIT_SYSTEM"
            
            printf "是否删除应用文件? [y/N] "
            read -r del_answer
            case "$del_answer" in
                [Yy]*)
                    rm -rf "$APP_DIR"
                    print_success "应用文件已删除"
                    ;;
                *)
                    print_info "应用文件保留在: $APP_DIR"
                    ;;
            esac
            
            printf "是否删除日志文件? [y/N] "
            read -r log_answer
            case "$log_answer" in
                [Yy]*)
                    rm -f "$LOG_FILE"
                    print_success "日志文件已删除"
                    ;;
            esac
            
            print_success "卸载完成"
            ;;
        *)
            print_info "取消卸载"
            ;;
    esac
    echo ""
}

# 显示帮助
show_help() {
    cat << EOF
Chatroom 管理脚本

用法: $0 [命令] [选项]

命令:
  install [端口]    安装服务（可选指定端口）
  uninstall        卸载服务
  start            启动服务
  stop             停止服务
  restart          重启服务
  status           查看服务状态
  logs             查看实时日志
  check            检查系统依赖
  help             显示此帮助信息

示例:
  $0 install           # 交互式安装
  $0 install 8080      # 安装并使用 8080 端口
  $0 start             # 启动服务
  $0 logs              # 查看日志

EOF
}

# 主函数
main() {
    local command=${1:-help}
    local arg2=$2
    
    case "$command" in
        install)
            do_install "$arg2"
            ;;
        uninstall)
            do_uninstall
            ;;
        start)
            INIT_SYSTEM=$(detect_init_system)
            start_service "$INIT_SYSTEM"
            ;;
        stop)
            INIT_SYSTEM=$(detect_init_system)
            stop_service "$INIT_SYSTEM"
            ;;
        restart)
            INIT_SYSTEM=$(detect_init_system)
            restart_service "$INIT_SYSTEM"
            ;;
        status)
            INIT_SYSTEM=$(detect_init_system)
            status_service "$INIT_SYSTEM"
            ;;
        logs)
            view_logs
            ;;
        check)
            check_dependencies
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            print_error "未知命令: $command"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# 运行主函数
main "$@"
