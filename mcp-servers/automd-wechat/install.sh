#!/bin/bash
# AutoMD MCP Server 快速安装脚本

set -e

echo "=== AutoMD MCP Server 安装向导 ==="
echo ""

# 检查 Python 依赖
echo "📦 检查依赖..."
if ! python3 -c "import markdown" 2>/dev/null; then
    echo "安装 Python 依赖..."
    pip3 install -r /home/wexin/automd/requirements.txt
fi

# 配置凭据
echo ""
echo "🔐 配置微信公众号凭据..."
bash /home/ccp/mcp-servers/automd-wechat/setup-credentials.sh

# 测试服务
echo ""
echo "🧪 测试 MCP 服务..."
cd /home/ccp/mcp-servers/automd-wechat

python3 -c "
import json
import sys
sys.path.insert(0, '/home/wexin/automd')

try:
    from src.config.config_manager import ConfigManager
    print('✅ 配置管理器初始化成功')
except Exception as e:
    print(f'❌ 初始化失败: {e}')
    sys.exit(1)
"

# 输出配置说明
echo ""
echo "✅ 安装完成!"
echo ""
echo "📝 下一步: 配置 Claude Code"
echo ""
echo "在 ~/.claudecode/config 中添加以下配置:"
echo ""
cat claudecode-config-example.json
echo ""
echo "然后重启 Claude Code，即可在对话中使用 automd-wechat MCP 服务。"
echo ""
echo "🔍 测试命令:"
echo "  cd /home/ccp/mcp-servers/automd-wechat"
echo "  python3 test-mcp.py"
echo ""
echo "📚 文档: /home/ccp/mcp-servers/automd-wechat/README.md"
