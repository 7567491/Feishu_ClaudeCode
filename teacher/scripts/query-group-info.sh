#!/bin/bash

# 查询群组信息的脚本
# 使用方法: ./query-group-info.sh [群组ID]

DB_PATH="/home/ccp/server/database/auth.db"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}===========================================${NC}"
echo -e "${CYAN}       AI初老师群组信息查询工具${NC}"
echo -e "${CYAN}===========================================${NC}\n"

# 如果提供了群组ID参数
if [ -n "$1" ]; then
    CHAT_ID="$1"
    echo -e "${YELLOW}查询群组: ${NC}${CHAT_ID}\n"

    # 查询群组会话信息
    echo -e "${GREEN}会话信息:${NC}"
    sqlite3 "$DB_PATH" "
    SELECT
        '  项目路径: ' || project_path,
        '  会话类型: ' || session_type,
        '  最后活动: ' || datetime(last_activity),
        '  是否活跃: ' || CASE WHEN is_active = 1 THEN '是' ELSE '否' END
    FROM feishu_sessions
    WHERE feishu_id = '$CHAT_ID' AND session_type = 'group';"

    echo -e "\n${GREEN}群组成员 (${NC}$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM feishu_group_members WHERE chat_id = '$CHAT_ID'")${GREEN} 人):${NC}"

    # 查询成员列表
    sqlite3 -column -header "$DB_PATH" "
    SELECT
        member_name as '成员名称',
        member_type as '类型',
        substr(member_open_id, 1, 20) || '...' as 'Open ID',
        tenant_key as '租户',
        datetime(updated_at) as '更新时间'
    FROM feishu_group_members
    WHERE chat_id = '$CHAT_ID'
    ORDER BY member_type DESC, member_name;"

else
    # 没有提供参数，显示所有群组列表
    echo -e "${GREEN}群组统计概览:${NC}"

    # 显示统计信息
    sqlite3 "$DB_PATH" "
    SELECT
        '总群组数: ' || COUNT(DISTINCT chat_id),
        '总成员数: ' || COUNT(DISTINCT member_open_id),
        '总租户数: ' || COUNT(DISTINCT tenant_key)
    FROM feishu_group_members;"

    echo -e "\n${GREEN}活跃群组列表 (最近7天):${NC}"

    # 显示最近活跃的群组
    sqlite3 -column -header "$DB_PATH" "
    SELECT
        substr(fs.feishu_id, 4, 16) || '...' as '群组ID',
        COUNT(DISTINCT fgm.member_open_id) as '成员数',
        datetime(fs.last_activity) as '最后活动时间',
        CASE
            WHEN fs.project_path = '/home/ccp' THEN '主项目'
            WHEN fs.project_path LIKE '%test%' THEN '测试'
            ELSE '常规'
        END as '类型'
    FROM feishu_sessions fs
    LEFT JOIN feishu_group_members fgm ON fs.feishu_id = fgm.chat_id
    WHERE fs.session_type = 'group'
      AND datetime(fs.last_activity) >= datetime('now', '-7 days')
    GROUP BY fs.feishu_id
    ORDER BY fs.last_activity DESC
    LIMIT 10;"

    echo -e "\n${GREEN}群组规模分布:${NC}"

    # 显示群组规模分布
    sqlite3 -column "$DB_PATH" "
    WITH group_sizes AS (
        SELECT
            chat_id,
            COUNT(*) as member_count
        FROM feishu_group_members
        GROUP BY chat_id
    )
    SELECT
        CASE
            WHEN member_count = 1 THEN '1人'
            WHEN member_count = 2 THEN '2人'
            WHEN member_count = 3 THEN '3人'
            WHEN member_count = 4 THEN '4人'
            WHEN member_count >= 5 AND member_count <= 10 THEN '5-10人'
            ELSE '10人以上'
        END as '群组规模',
        COUNT(*) as '数量'
    FROM group_sizes
    GROUP BY
        CASE
            WHEN member_count = 1 THEN '1人'
            WHEN member_count = 2 THEN '2人'
            WHEN member_count = 3 THEN '3人'
            WHEN member_count = 4 THEN '4人'
            WHEN member_count >= 5 AND member_count <= 10 THEN '5-10人'
            ELSE '10人以上'
        END
    ORDER BY member_count;"

    echo -e "\n${YELLOW}提示: 使用 ${NC}./query-group-info.sh <群组ID>${YELLOW} 查看特定群组的详细信息${NC}"
    echo -e "${YELLOW}例如: ${NC}./query-group-info.sh oc_15a90daa813d981076ffa50c0de0b5e4${NC}\n"
fi

echo -e "${CYAN}===========================================${NC}"