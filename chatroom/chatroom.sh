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
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

print_info() { printf "${BLUE}ℹ${NC} $1\n"; }
print_success() { printf "${GREEN}✓${NC} $1\n"; }
print_warning() { printf "${YELLOW}⚠${NC} $1\n"; }
print_error() { printf "${RED}✗${NC} $1\n"; }
print_header() { printf "${CYAN}${BOLD}$1${NC}\n"; }

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
    local missing=""
    
    if ! command -v node >/dev/null 2>&1; then
        missing="${missing}nodejs "
    else
        local node_version=$(node --version | sed 's/v//' | cut -d. -f1)
        if [ "$node_version" -lt 18 ]; then
            missing="${missing}nodejs(18+) "
        fi
    fi
    
    if ! command -v npm >/dev/null 2>&1; then
        missing="${missing}npm "
    fi
    
    if [ -n "$missing" ]; then
        echo "$missing"
        return 1
    fi
    return 0
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
            print_error "无法自动安装依赖"
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
    
    if ! echo "$port" | grep -qE '^[0-9]+$' || [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
        print_error "无效的端口号: $port"
        return 1
    fi
    
    if command -v ss >/dev/null 2>&1; then
        if ss -tuln 2>/dev/null | grep -q ":$port "; then
            print_warning "端口 $port 已被占用"
            return 1
        fi
    fi
    
    if [ -f "$APP_DIR/src/config.js" ]; then
        sed -i "s/PORT:.*||.*/PORT: process.env.PORT || $port,/" "$APP_DIR/src/config.js"
    fi
    
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
            cat > /etc/systemd/system/${APP_NAME}.service << EOF
[Unit]
Description=Chatroom - Temporary Chatroom Service
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
NoNewPrivileges=true
PrivateTmp=true
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
    
    stop_service "$init_system" 2>/dev/null || true
    
    case "$init_system" in
        systemd)
            systemctl disable ${APP_NAME}.service 2>/dev/null || true
            rm -f /etc/systemd/system/${APP_NAME}.service
            systemctl daemon-reload
            ;;
        openrc)
            rc-update del ${APP_NAME} default 2>/dev/null || true
            rm -f /etc/init.d/${APP_NAME}
            ;;
    esac
}

# 启动服务
start_service() {
    local init_system=$1
    
    case "$init_system" in
        systemd)
            systemctl start ${APP_NAME}
            sleep 2
            if systemctl is-active --quiet ${APP_NAME}; then
                print_success "服务已启动"
            else
                print_error "服务启动失败"
                return 1
            fi
            ;;
        openrc)
            rc-service ${APP_NAME} start
            sleep 2
            ;;
        *)
            cd "$APP_DIR"
            nohup node server.js > "$LOG_FILE" 2>&1 &
            echo $! > /var/run/${APP_NAME}.pid
            sleep 2
            if ps -p $(cat /var/run/${APP_NAME}.pid) > /dev/null 2>&1; then
                print_success "服务已启动"
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
    
    case "$init_system" in
        systemd)
            systemctl stop ${APP_NAME}
            ;;
        openrc)
            rc-service ${APP_NAME} stop
            ;;
        *)
            if [ -f /var/run/${APP_NAME}.pid ]; then
                kill $(cat /var/run/${APP_NAME}.pid) 2>/dev/null || true
                rm -f /var/run/${APP_NAME}.pid
            else
                pkill -f "node.*server.js" || true
            fi
            ;;
    esac
}

# 查看服务状态
status_service() {
    local init_system=$1
    
    case "$init_system" in
        systemd)
            if systemctl is-active --quiet ${APP_NAME}; then
                print_success "服务运行中"
                systemctl status ${APP_NAME} --no-pager -l | head -15
            else
                print_error "服务未运行"
            fi
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
                    print_error "服务未运行"
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
        print_info "按 Ctrl+C 退出日志查看"
        sleep 1
        tail -f "$LOG_FILE"
    else
        print_error "日志文件不存在"
    fi
}

# 完整安装
do_install() {
    clear
    print_header "╔════════════════════════════════════════╗"
    print_header "║        Chatroom 安装向导               ║"
    print_header "╚════════════════════════════════════════╝"
    echo ""
    
    if [ ! -f "server.js" ] || [ ! -f "package.json" ]; then
        print_error "请在 chatroom 目录下运行此脚本"
        return 1
    fi
    
    INIT_SYSTEM=$(detect_init_system)
    PKG_MANAGER=$(detect_package_manager)
    
    print_info "系统: $INIT_SYSTEM | 包管理: $PKG_MANAGER"
    echo ""
    
    # 检查依赖
    if missing=$(check_dependencies); then
        print_success "依赖检查通过"
    else
        print_warning "缺少依赖: $missing"
        printf "是否自动安装? [Y/n] "
        read -r answer
        case "$answer" in
            [Nn]*) return 1 ;;
            *) install_system_dependencies || return 1 ;;
        esac
    fi
    
    # 配置端口
    configure_port "$1" || return 1
    PORT=$(cat "$APP_DIR/.port" 2>/dev/null || echo "$DEFAULT_PORT")
    
    # 安装项目依赖
    install_app_dependencies || return 1
    
    # 安装服务
    printf "\n是否安装为系统服务? [Y/n] "
    read -r answer
    case "$answer" in
        [Nn]*)
            print_info "跳过服务安装"
            ;;
        *)
            install_service "$INIT_SYSTEM" "$PORT" || return 1
            
            printf "\n是否立即启动? [Y/n] "
            read -r start_answer
            case "$start_answer" in
                [Nn]*) ;;
                *) start_service "$INIT_SYSTEM" || return 1 ;;
            esac
            ;;
    esac
    
    echo ""
    print_success "安装完成！"
    
    local ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    [ -z "$ip" ] && ip="<your-ip>"
    
    echo ""
    print_info "访问地址: http://${ip}:${PORT}"
    echo ""
    printf "按回车键返回菜单..."
    read -r
}

# 卸载
do_uninstall() {
    clear
    print_header "╔════════════════════════════════════════╗"
    print_header "║           卸载 Chatroom                ║"
    print_header "╚════════════════════════════════════════╝"
    echo ""
    
    print_warning "即将卸载 Chatroom 服务"
    printf "确认卸载? [y/N] "
    read -r answer
    case "$answer" in
        [Yy]*)
            INIT_SYSTEM=$(detect_init_system)
            uninstall_service "$INIT_SYSTEM"
            print_success "服务已卸载"
            
            printf "\n删除应用文件? [y/N] "
            read -r del_answer
            case "$del_answer" in
                [Yy]*)
                    rm -rf "$APP_DIR"
                    print_success "应用文件已删除"
                    ;;
            esac
            
            printf "\n删除日志文件? [y/N] "
            read -r log_answer
            case "$log_answer" in
                [Yy]*)
                    rm -f "$LOG_FILE"
                    print_success "日志文件已删除"
                    ;;
            esac
            ;;
        *)
            print_info "取消卸载"
            ;;
    esac
    
    echo ""
    printf "按回车键返回菜单..."
    read -r
}

# 显示主菜单
show_menu() {
    clear
    print_header "╔════════════════════════════════════════╗"
    print_header "║       Chatroom 管理面板                ║"
    print_header "╚════════════════════════════════════════╝"
    echo ""
    
    # 检查服务状态
    INIT_SYSTEM=$(detect_init_system)
    local status_icon="${RED}●${NC}"
    local status_text="未运行"
    
    case "$INIT_SYSTEM" in
        systemd)
            if systemctl is-active --quiet ${APP_NAME} 2>/dev/null; then
                status_icon="${GREEN}●${NC}"
                status_text="运行中"
            fi
            ;;
        openrc)
            if rc-service ${APP_NAME} status 2>/dev/null | grep -q "started"; then
                status_icon="${GREEN}●${NC}"
                status_text="运行中"
            fi
            ;;
        *)
            if [ -f /var/run/${APP_NAME}.pid ] && ps -p $(cat /var/run/${APP_NAME}.pid) > /dev/null 2>&1; then
                status_icon="${GREEN}●${NC}"
                status_text="运行中"
            fi
            ;;
    esac
    
    printf "  服务状态: $status_icon $status_text\n"
    echo ""
    echo "  ${CYAN}1.${NC} 安装服务"
    echo "  ${CYAN}2.${NC} 启动服务"
    echo "  ${CYAN}3.${NC} 停止服务"
    echo "  ${CYAN}4.${NC} 重启服务"
    echo "  ${CYAN}5.${NC} 查看状态"
    echo "  ${CYAN}6.${NC} 查看日志"
    echo "  ${CYAN}7.${NC} 检查依赖"
    echo "  ${CYAN}8.${NC} 卸载服务"
    echo "  ${CYAN}0.${NC} 退出"
    echo ""
    printf "  请选择 [0-8]: "
}

# 主循环
interactive_mode() {
    while true; do
        show_menu
        read -r choice
        
        case "$choice" in
            1)
                do_install
                ;;
            2)
                clear
                print_info "启动服务..."
                INIT_SYSTEM=$(detect_init_system)
                if start_service "$INIT_SYSTEM"; then
                    print_success "服务已启动"
                else
                    print_error "启动失败"
                fi
                echo ""
                printf "按回车键返回菜单..."
                read -r
                ;;
            3)
                clear
                print_info "停止服务..."
                INIT_SYSTEM=$(detect_init_system)
                stop_service "$INIT_SYSTEM"
                print_success "服务已停止"
                echo ""
                printf "按回车键返回菜单..."
                read -r
                ;;
            4)
                clear
                print_info "重启服务..."
                INIT_SYSTEM=$(detect_init_system)
                stop_service "$INIT_SYSTEM"
                sleep 2
                start_service "$INIT_SYSTEM"
                print_success "服务已重启"
                echo ""
                printf "按回车键返回菜单..."
                read -r
                ;;
            5)
                clear
                INIT_SYSTEM=$(detect_init_system)
                status_service "$INIT_SYSTEM"
                echo ""
                printf "按回车键返回菜单..."
                read -r
                ;;
            6)
                clear
                view_logs
                ;;
            7)
                clear
                print_info "检查系统依赖..."
                if missing=$(check_dependencies); then
                    print_success "所有依赖已满足"
                    if command -v node >/dev/null 2>&1; then
                        echo "  Node.js: $(node --version)"
                    fi
                    if command -v npm >/dev/null 2>&1; then
                        echo "  npm: $(npm --version)"
                    fi
                else
                    print_warning "缺少依赖: $missing"
                fi
                echo ""
                printf "按回车键返回菜单..."
                read -r
                ;;
            8)
                do_uninstall
                ;;
            0)
                clear
                print_info "再见！"
                exit 0
                ;;
            *)
                ;;
        esac
    done
}

# 主函数
main() {
    # 如果有参数，使用命令行模式
    if [ $# -gt 0 ]; then
        local command=$1
        shift
        
        case "$command" in
            install)
                do_install "$@"
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
                stop_service "$INIT_SYSTEM"
                sleep 2
                start_service "$INIT_SYSTEM"
                ;;
            status)
                INIT_SYSTEM=$(detect_init_system)
                status_service "$INIT_SYSTEM"
                ;;
            logs)
                view_logs
                ;;
            uninstall)
                do_uninstall
                ;;
            *)
                print_error "未知命令: $command"
                echo ""
                echo "用法: $0 [命令]"
                echo ""
                echo "命令:"
                echo "  install [端口]  - 安装服务"
                echo "  start          - 启动服务"
                echo "  stop           - 停止服务"
                echo "  restart        - 重启服务"
                echo "  status         - 查看状态"
                echo "  logs           - 查看日志"
                echo "  uninstall      - 卸载服务"
                echo ""
                echo "不带参数运行进入交互式菜单"
                exit 1
                ;;
        esac
    else
        # 无参数，进入交互式菜单
        interactive_mode
    fi
}

# 运行主函数
main "$@"
