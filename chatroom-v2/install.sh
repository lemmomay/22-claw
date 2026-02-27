#!/bin/sh
set -e

echo "🚀 Chatroom V2 安装脚本"
echo "======================="
echo ""

# 检测系统类型
detect_init_system() {
    if command -v systemctl >/dev/null 2>&1 && systemctl --version >/dev/null 2>&1; then
        echo "systemd"
    elif [ -d /etc/init.d ] && [ -f /sbin/openrc ] || [ -f /sbin/rc-service ]; then
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

# 安装 Node.js
install_nodejs() {
    local pm=$1
    echo "📦 检查 Node.js..."
    
    if command -v node >/dev/null 2>&1; then
        echo "✅ Node.js 已安装: $(node --version)"
        return 0
    fi
    
    echo "⚠️  Node.js 未安装，正在安装..."
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
            echo "❌ 无法自动安装 Node.js，请手动安装"
            exit 1
            ;;
    esac
}

# 安装依赖
install_dependencies() {
    echo "📦 安装项目依赖..."
    npm install --production --no-optional
    echo "✅ 依赖安装完成"
}

# 安装为系统服务
install_service() {
    local init_system=$1
    local install_dir=$(pwd)
    
    echo ""
    echo "🔧 安装系统服务..."
    
    case "$init_system" in
        systemd)
            echo "检测到 systemd"
            # 更新 service 文件中的路径
            sed "s|WorkingDirectory=.*|WorkingDirectory=${install_dir}|g" \
                systemd/chatroom.service > /tmp/chatroom.service
            sed -i "s|ReadWritePaths=.*|ReadWritePaths=${install_dir}/public/uploads|g" \
                /tmp/chatroom.service
            
            # 安装 service 文件
            cp /tmp/chatroom.service /etc/systemd/system/chatroom.service
            chmod 644 /etc/systemd/system/chatroom.service
            
            # 重载并启用
            systemctl daemon-reload
            systemctl enable chatroom.service
            
            echo "✅ systemd 服务已安装"
            echo ""
            echo "管理命令:"
            echo "  启动: systemctl start chatroom"
            echo "  停止: systemctl stop chatroom"
            echo "  重启: systemctl restart chatroom"
            echo "  状态: systemctl status chatroom"
            echo "  日志: journalctl -u chatroom -f"
            ;;
            
        openrc)
            echo "检测到 OpenRC"
            # 更新 init 脚本中的路径
            sed "s|chatroom_dir:=.*|chatroom_dir:=\"${install_dir}\"|g" \
                init.d/chatroom > /tmp/chatroom
            
            # 安装 init 脚本
            cp /tmp/chatroom /etc/init.d/chatroom
            chmod 755 /etc/init.d/chatroom
            
            # 添加到默认运行级别
            rc-update add chatroom default
            
            echo "✅ OpenRC 服务已安装"
            echo ""
            echo "管理命令:"
            echo "  启动: rc-service chatroom start"
            echo "  停止: rc-service chatroom stop"
            echo "  重启: rc-service chatroom restart"
            echo "  状态: rc-service chatroom status"
            echo "  日志: tail -f /var/log/chatroom.log"
            ;;
            
        *)
            echo "⚠️  未检测到 systemd 或 OpenRC"
            echo "请手动配置服务，或使用 nohup 运行:"
            echo "  nohup node server.js > chatroom.log 2>&1 &"
            return 1
            ;;
    esac
    
    rm -f /tmp/chatroom.service /tmp/chatroom
}

# 主安装流程
main() {
    # 检查是否在项目目录
    if [ ! -f "server.js" ] || [ ! -f "package.json" ]; then
        echo "❌ 错误: 请在 chatroom-v2 目录下运行此脚本"
        exit 1
    fi
    
    # 检测系统
    INIT_SYSTEM=$(detect_init_system)
    PKG_MANAGER=$(detect_package_manager)
    
    echo "系统信息:"
    echo "  Init 系统: $INIT_SYSTEM"
    echo "  包管理器: $PKG_MANAGER"
    echo ""
    
    # 安装 Node.js
    install_nodejs "$PKG_MANAGER"
    
    # 安装依赖
    install_dependencies
    
    # 询问是否安装为系统服务
    echo ""
    printf "是否安装为系统服务? [Y/n] "
    read -r answer
    case "$answer" in
        [Nn]*)
            echo "跳过服务安装"
            echo ""
            echo "手动启动:"
            echo "  node server.js"
            echo "或后台运行:"
            echo "  nohup node server.js > chatroom.log 2>&1 &"
            ;;
        *)
            install_service "$INIT_SYSTEM"
            
            # 询问是否立即启动
            echo ""
            printf "是否立即启动服务? [Y/n] "
            read -r start_answer
            case "$start_answer" in
                [Nn]*)
                    echo "服务未启动"
                    ;;
                *)
                    case "$INIT_SYSTEM" in
                        systemd)
                            systemctl start chatroom
                            sleep 2
                            systemctl status chatroom --no-pager
                            ;;
                        openrc)
                            rc-service chatroom start
                            sleep 2
                            rc-service chatroom status
                            ;;
                    esac
                    ;;
            esac
            ;;
    esac
    
    echo ""
    echo "✨ 安装完成！"
    echo ""
    echo "访问地址: http://$(hostname -I | awk '{print $1}'):28881"
    echo "健康检查: http://$(hostname -I | awk '{print $1}'):28881/health"
}

# 运行主函数
main "$@"
