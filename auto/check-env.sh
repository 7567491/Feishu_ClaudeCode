#!/bin/bash

##############################################################################
# check-env.sh - 检查飞书环境变量配置
##############################################################################

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🔍 飞书环境变量配置检查${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# 检查 FeishuCC_App_ID
echo -n "FeishuCC_App_ID:          "
if [ -n "$FeishuCC_App_ID" ]; then
    echo -e "${GREEN}✅ 已设置${NC} (${FeishuCC_App_ID})"
    APP_ID_OK=true
else
    echo -e "${RED}❌ 未设置${NC}"
    APP_ID_OK=false
fi

# 检查 FeishuCC_App_Secret
echo -n "FeishuCC_App_Secret:      "
if [ -n "$FeishuCC_App_Secret" ]; then
    # 只显示前8个字符
    MASKED_SECRET="${FeishuCC_App_Secret:0:8}***"
    echo -e "${GREEN}✅ 已设置${NC} (${MASKED_SECRET})"
    APP_SECRET_OK=true
else
    echo -e "${RED}❌ 未设置${NC}"
    APP_SECRET_OK=false
fi

# 检查 FEISHU_NOTIFY_RECEIVE_ID
echo -n "FEISHU_NOTIFY_RECEIVE_ID: "
if [ -n "$FEISHU_NOTIFY_RECEIVE_ID" ]; then
    echo -e "${GREEN}✅ 已设置${NC} (${FEISHU_NOTIFY_RECEIVE_ID})"
    RECEIVE_ID_OK=true
else
    echo -e "${YELLOW}⚠️  未设置${NC} (通知功能将被禁用)"
    RECEIVE_ID_OK=false
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# 总结
if [ "$APP_ID_OK" = true ] && [ "$APP_SECRET_OK" = true ]; then
    echo -e "${GREEN}✅ 飞书应用凭证配置完整${NC}"

    if [ "$RECEIVE_ID_OK" = true ]; then
        echo -e "${GREEN}✅ 通知接收者已配置，飞书通知已启用${NC}"
        OVERALL_STATUS="完全配置"
    else
        echo -e "${YELLOW}⚠️  通知接收者未配置，飞书通知已禁用${NC}"
        echo ""
        echo "配置通知接收者："
        echo "  1. 运行: node test-feishu-ws.js"
        echo "  2. 飞书中给机器人发消息"
        echo "  3. 复制控制台显示的 open_id"
        echo "  4. 执行: export FEISHU_NOTIFY_RECEIVE_ID=ou_xxxxx"
        echo "  5. 永久保存: echo 'export FEISHU_NOTIFY_RECEIVE_ID=ou_xxxxx' >> ~/.bashrc"
        OVERALL_STATUS="部分配置"
    fi
else
    echo -e "${RED}❌ 飞书应用凭证未完整配置${NC}"
    echo ""
    echo "飞书通知功能将被禁用，但不影响自动化任务执行。"
    echo ""
    echo "如需启用飞书通知，请设置以下环境变量："

    if [ "$APP_ID_OK" = false ]; then
        echo "  export FeishuCC_App_ID=cli_xxxxx"
    fi

    if [ "$APP_SECRET_OK" = false ]; then
        echo "  export FeishuCC_App_Secret=xxxxx"
    fi

    if [ "$RECEIVE_ID_OK" = false ]; then
        echo "  export FEISHU_NOTIFY_RECEIVE_ID=ou_xxxxx"
    fi

    echo ""
    echo "永久保存到 ~/.bashrc："
    echo "  echo 'export FeishuCC_App_ID=cli_xxxxx' >> ~/.bashrc"
    echo "  source ~/.bashrc"

    OVERALL_STATUS="未配置"
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "配置状态: ${OVERALL_STATUS}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# 测试飞书通知（如果完全配置）
if [ "$APP_ID_OK" = true ] && [ "$APP_SECRET_OK" = true ] && [ "$RECEIVE_ID_OK" = true ]; then
    echo ""
    read -p "是否发送测试通知？(y/N) " -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo ""
        echo "发送测试通知..."
        node feishu-notifier.cjs
    fi
fi
