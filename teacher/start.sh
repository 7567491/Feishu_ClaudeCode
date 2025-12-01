#!/bin/bash
#
# AI初老师启动脚本
#

# 设置工作目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 日志文件
LOG_FILE="teacher.log"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 打印带颜色的信息
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# 检查Python环境
check_python() {
    if command -v python3 &> /dev/null; then
        PYTHON_CMD="python3"
    elif command -v python &> /dev/null; then
        PYTHON_CMD="python"
    else
        print_error "Python not found. Please install Python 3.7+"
        exit 1
    fi

    # 检查Python版本
    PYTHON_VERSION=$($PYTHON_CMD -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
    print_info "Python version: $PYTHON_VERSION"
}

# 安装依赖
install_dependencies() {
    print_info "Installing dependencies..."
    $PYTHON_CMD -m pip install flask requests --quiet
}

# 检查环境变量
check_env() {
    if [ -z "$TEACHER_FEISHU_APP_ID" ] || [ -z "$TEACHER_FEISHU_APP_SECRET" ]; then
        print_warning "Feishu credentials not set. Loading from .env file..."

        # 尝试从.env文件加载
        if [ -f "../.env" ]; then
            source ../.env
            export TEACHER_FEISHU_APP_ID=$TEACHER_FEISHU_APP_ID
            export TEACHER_FEISHU_APP_SECRET=$TEACHER_FEISHU_APP_SECRET
            print_info "Loaded environment from .env file"
        else
            print_error "Please set TEACHER_FEISHU_APP_ID and TEACHER_FEISHU_APP_SECRET"
            print_info "Example:"
            print_info "  export TEACHER_FEISHU_APP_ID='your_app_id'"
            print_info "  export TEACHER_FEISHU_APP_SECRET='your_app_secret'"
            exit 1
        fi
    fi

    # 设置小六API地址
    if [ -z "$XIAOLIU_API_URL" ]; then
        export XIAOLIU_API_URL="http://localhost:3011/api/feishu-proxy/query"
        print_info "Using default Xiaoliu API URL: $XIAOLIU_API_URL"
    fi
}

# 停止服务
stop_service() {
    print_info "Stopping AI初老师 service..."

    # 查找并终止进程
    PID=$(pgrep -f "teacher/main.py")
    if [ ! -z "$PID" ]; then
        kill $PID 2>/dev/null
        print_info "Service stopped (PID: $PID)"
    else
        print_info "Service not running"
    fi
}

# 启动服务
start_service() {
    print_info "Starting AI初老师 service..."

    # 后台启动
    nohup $PYTHON_CMD main.py > $LOG_FILE 2>&1 &
    PID=$!

    # 等待服务启动
    sleep 2

    # 检查是否启动成功
    if kill -0 $PID 2>/dev/null; then
        print_info "✅ AI初老师 service started successfully (PID: $PID)"
        print_info "Log file: $LOG_FILE"
        print_info "Health check: http://localhost:8082/health"
    else
        print_error "Failed to start service"
        print_info "Check log file: $LOG_FILE"
        tail -n 20 $LOG_FILE
        exit 1
    fi
}

# 运行测试
run_tests() {
    print_info "Running tests..."

    # 运行单元测试
    $PYTHON_CMD -m pytest tests/ -v --color=yes

    # 运行集成测试
    $PYTHON_CMD main.py --test
}

# 显示日志
show_logs() {
    print_info "Showing logs (tail -f $LOG_FILE)..."
    tail -f $LOG_FILE
}

# 主函数
main() {
    case "${1:-}" in
        start)
            check_python
            check_env
            install_dependencies
            start_service
            ;;
        stop)
            stop_service
            ;;
        restart)
            stop_service
            sleep 1
            check_python
            check_env
            start_service
            ;;
        test)
            check_python
            check_env
            run_tests
            ;;
        logs)
            show_logs
            ;;
        *)
            echo "AI初老师 - 智能开发助手"
            echo ""
            echo "Usage: $0 {start|stop|restart|test|logs}"
            echo ""
            echo "Commands:"
            echo "  start    - Start the service"
            echo "  stop     - Stop the service"
            echo "  restart  - Restart the service"
            echo "  test     - Run tests"
            echo "  logs     - Show logs"
            exit 1
            ;;
    esac
}

# 运行主函数
main "$@"