#!/bin/bash

##############################################################################
# setup-cron.sh - 配置 crontab 定时任务
#
# 功能：
# 1. 添加每10分钟执行一次的 cron 任务
# 2. 配置日志输出
# 3. 提供启用/禁用选项
##############################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUTO_DEV_SCRIPT="${SCRIPT_DIR}/auto-dev.sh"
CRON_LOG="${SCRIPT_DIR}/logs/cron.log"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🕐 自动化开发 Cron 任务配置${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# 检查脚本是否存在
if [ ! -f "${AUTO_DEV_SCRIPT}" ]; then
    echo -e "${YELLOW}❌ auto-dev.sh 不存在${NC}"
    exit 1
fi

# Cron 任务配置
# 每10分钟执行一次: */10 * * * *
CRON_SCHEDULE="*/10 * * * *"
CRON_COMMAND="cd ${SCRIPT_DIR} && ${AUTO_DEV_SCRIPT} >> ${CRON_LOG} 2>&1"
CRON_ENTRY="${CRON_SCHEDULE} ${CRON_COMMAND}"

echo "📋 Cron 任务配置："
echo "   计划: 每10分钟执行一次"
echo "   脚本: ${AUTO_DEV_SCRIPT}"
echo "   日志: ${CRON_LOG}"
echo ""

# 检查是否已存在
if crontab -l 2>/dev/null | grep -q "auto-dev.sh"; then
    echo -e "${YELLOW}⚠️  检测到已存在的 auto-dev.sh cron 任务${NC}"
    echo ""
    echo "当前 crontab:"
    crontab -l | grep "auto-dev.sh"
    echo ""

    read -p "是否删除现有任务？(y/N) " -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # 删除旧任务
        crontab -l | grep -v "auto-dev.sh" | crontab -
        echo -e "${GREEN}✅ 已删除旧任务${NC}"
    else
        echo "取消操作"
        exit 0
    fi
fi

echo ""
echo "选择操作："
echo "  1) 添加 cron 任务（每10分钟执行）"
echo "  2) 仅查看配置（不添加）"
echo "  3) 取消"
echo ""

read -p "请选择 (1-3): " -n 1 -r
echo ""

case $REPLY in
    1)
        # 添加 cron 任务
        (crontab -l 2>/dev/null; echo "${CRON_ENTRY}") | crontab -

        echo ""
        echo -e "${GREEN}✅ Cron 任务已添加！${NC}"
        echo ""
        echo "当前 crontab:"
        crontab -l | grep "auto-dev.sh"
        echo ""
        echo "📝 提示:"
        echo "   - 任务将每10分钟自动执行一次"
        echo "   - 查看日志: tail -f ${CRON_LOG}"
        echo "   - 暂停执行: touch ${SCRIPT_DIR}/.auto-dev-pause"
        echo "   - 恢复执行: rm ${SCRIPT_DIR}/.auto-dev-pause"
        echo "   - 删除任务: crontab -e（删除相关行）"
        echo ""
        ;;
    2)
        echo ""
        echo "Cron 配置（仅查看，未添加）:"
        echo "${CRON_ENTRY}"
        echo ""
        echo "手动添加命令:"
        echo "  (crontab -l; echo '${CRON_ENTRY}') | crontab -"
        echo ""
        ;;
    *)
        echo "操作已取消"
        exit 0
        ;;
esac
