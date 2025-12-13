#!/bin/bash
# 凭据管理脚本 - 为其他用户配置微信公众号凭据

CREDENTIALS_FILE="${1:-$HOME/.automd-credentials.json}"

echo "=== AutoMD MCP 凭据配置工具 ==="
echo ""
echo "此工具将帮助您配置微信公众号凭据"
echo "凭据文件将保存到: $CREDENTIALS_FILE"
echo ""

# 读取用户输入
read -p "请输入 WECHAT_APPID: " appid
read -p "请输入 WECHAT_APP_SECRET: " app_secret
read -p "请输入 WECHAT_GH_ID: " gh_id

# 创建 JSON 文件
cat > "$CREDENTIALS_FILE" <<EOF
{
  "appid": "$appid",
  "app_secret": "$app_secret",
  "gh_id": "$gh_id"
}
EOF

# 设置文件权限（仅当前用户可读写）
chmod 600 "$CREDENTIALS_FILE"

echo ""
echo "✅ 凭据已保存到: $CREDENTIALS_FILE"
echo "🔒 文件权限已设置为 600（仅当前用户可访问）"
echo ""
echo "您现在可以使用 MCP 服务了："
echo "  python3 /home/ccp/mcp-servers/automd-wechat/server.py --stdio"
