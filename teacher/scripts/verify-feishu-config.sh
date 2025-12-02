#!/bin/bash

# 飞书配置验证脚本
echo "=================================================="
echo "      AI初老师飞书配置验证与诊断"
echo "=================================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 1. 检查环境变量
echo -e "\n${BLUE}1. 检查环境变量配置${NC}"
echo "----------------------------------------"

if [ -n "$Feishu_Teacher_App_ID" ]; then
    echo -e "App ID: ${GREEN}$Feishu_Teacher_App_ID${NC}"
else
    echo -e "App ID: ${RED}未配置${NC}"
fi

if [ -n "$Feishu_Teacher_App_Secret" ]; then
    echo -e "App Secret: ${GREEN}已配置（${#Feishu_Teacher_App_Secret}位）${NC}"
else
    echo -e "App Secret: ${RED}未配置${NC}"
fi

# 2. 检查服务状态
echo -e "\n${BLUE}2. 检查服务状态${NC}"
echo "----------------------------------------"

# 检查PM2状态
PM2_STATUS=$(pm2 list | grep ai-teacher | grep online)
if [ -n "$PM2_STATUS" ]; then
    echo -e "PM2服务: ${GREEN}运行中${NC}"
else
    echo -e "PM2服务: ${RED}未运行${NC}"
fi

# 检查端口监听
PORT_LISTEN=$(ss -tuln | grep :33301)
if [ -n "$PORT_LISTEN" ]; then
    echo -e "端口33301: ${GREEN}监听中${NC}"
else
    echo -e "端口33301: ${RED}未监听${NC}"
fi

# 3. 测试webhook连通性
echo -e "\n${BLUE}3. 测试Webhook连通性${NC}"
echo "----------------------------------------"

# 本地测试
LOCAL_TEST=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:33301/health)
if [ "$LOCAL_TEST" == "200" ]; then
    echo -e "本地连接: ${GREEN}正常 (HTTP $LOCAL_TEST)${NC}"
else
    echo -e "本地连接: ${RED}异常 (HTTP $LOCAL_TEST)${NC}"
fi

# 外网测试（使用服务器公网IP）
SERVER_IP="139.162.52.158"
EXTERNAL_TEST=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 http://$SERVER_IP:33301/health 2>/dev/null)
if [ "$EXTERNAL_TEST" == "200" ]; then
    echo -e "外网连接: ${GREEN}正常 (HTTP $EXTERNAL_TEST)${NC}"
    echo -e "Webhook URL: ${GREEN}http://$SERVER_IP:33301/webhook/feishu${NC}"
else
    echo -e "外网连接: ${YELLOW}可能需要防火墙配置${NC}"
fi

# 4. 飞书API测试
echo -e "\n${BLUE}4. 测试飞书API${NC}"
echo "----------------------------------------"

# 获取access token
if [ -n "$Feishu_Teacher_App_ID" ] && [ -n "$Feishu_Teacher_App_Secret" ]; then
    TOKEN_RESPONSE=$(curl -s -X POST \
        https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal \
        -H "Content-Type: application/json" \
        -d "{\"app_id\":\"$Feishu_Teacher_App_ID\",\"app_secret\":\"$Feishu_Teacher_App_Secret\"}")

    TOKEN_CODE=$(echo $TOKEN_RESPONSE | python3 -c "import json,sys; print(json.load(sys.stdin).get('code', -1))")

    if [ "$TOKEN_CODE" == "0" ]; then
        echo -e "Access Token: ${GREEN}获取成功${NC}"
        ACCESS_TOKEN=$(echo $TOKEN_RESPONSE | python3 -c "import json,sys; print(json.load(sys.stdin).get('app_access_token', ''))")
        echo -e "Token前缀: ${GREEN}${ACCESS_TOKEN:0:20}...${NC}"
    else
        TOKEN_MSG=$(echo $TOKEN_RESPONSE | python3 -c "import json,sys; print(json.load(sys.stdin).get('msg', 'Unknown error'))")
        echo -e "Access Token: ${RED}获取失败 - $TOKEN_MSG${NC}"
    fi
else
    echo -e "Access Token: ${RED}无法测试（缺少凭证）${NC}"
fi

# 5. 根因分析
echo -e "\n${BLUE}5. 根因分析与建议${NC}"
echo "=================================================="

ISSUES_FOUND=0

# 问题1：Webhook URL配置
echo -e "\n${YELLOW}问题检查：${NC}"
echo "----------------------------------------"

echo -e "\n❓ ${YELLOW}飞书开放平台是否已配置Webhook URL？${NC}"
echo "   请确认已在飞书开放平台完成以下配置："
echo "   1. 登录: https://open.feishu.cn/app/cli_a9ad59fd26389cee"
echo "   2. 进入'事件与回调' -> '事件配置'"
echo "   3. 请求地址配置为: http://$SERVER_IP:33301/webhook/feishu"
echo "   4. 订阅事件: im.message.receive_v1 (接收消息v1.0)"
((ISSUES_FOUND++))

echo -e "\n❓ ${YELLOW}机器人是否已添加到'AI之初'群组？${NC}"
echo "   请确认AI初老师机器人已被邀请到目标群组"
echo "   在群组中 @AI初老师 邀请机器人加入"
((ISSUES_FOUND++))

# 6. 查询群组记录
echo -e "\n${BLUE}6. 查询AI初老师相关群组${NC}"
echo "----------------------------------------"

# 查找包含AI初老师的群组
GROUPS_WITH_TEACHER=$(sqlite3 /home/ccp/server/database/auth.db "
SELECT COUNT(DISTINCT chat_id)
FROM feishu_group_members
WHERE member_name = 'AI初老师';" 2>/dev/null)

if [ -n "$GROUPS_WITH_TEACHER" ]; then
    echo -e "发现 ${GREEN}$GROUPS_WITH_TEACHER${NC} 个群组包含'AI初老师'成员"

    # 显示最近活跃的群组
    echo -e "\n最近活跃的相关群组："
    sqlite3 /home/ccp/server/database/auth.db "
    SELECT
        substr(fg.chat_id, 1, 20) || '...' as '群组ID',
        datetime(fg.updated_at) as '最后更新'
    FROM feishu_group_members fg
    WHERE fg.member_name = 'AI初老师'
    ORDER BY fg.updated_at DESC
    LIMIT 3;" 2>/dev/null
fi

# 7. 总结
echo -e "\n${BLUE}诊断总结${NC}"
echo "=================================================="

if [ "$ISSUES_FOUND" -gt 0 ]; then
    echo -e "${YELLOW}⚠️ 发现 $ISSUES_FOUND 个潜在问题需要确认${NC}"
    echo ""
    echo -e "${YELLOW}最可能的根本原因：${NC}"
    echo -e "${RED}飞书开放平台未配置AI初老师的Webhook URL${NC}"
    echo ""
    echo -e "${GREEN}解决方案：${NC}"
    echo "1. 访问飞书开放平台: https://open.feishu.cn"
    echo "2. 选择AI初老师应用 (cli_a9ad59fd26389cee)"
    echo "3. 配置事件订阅URL: http://$SERVER_IP:33301/webhook/feishu"
    echo "4. 添加im.message.receive_v1事件"
    echo "5. 确保机器人在目标群组中"
else
    echo -e "${GREEN}✅ 服务配置正常${NC}"
fi

echo ""
echo "=================================================="
echo "诊断完成"