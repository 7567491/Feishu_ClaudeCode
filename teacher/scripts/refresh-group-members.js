#!/usr/bin/env node
/**
 * 刷新所有群组成员信息
 * 用于同步飞书群组的最新成员列表到本地数据库
 */

const path = require('path');
const fs = require('fs');

// 添加服务器库路径
const serverLibPath = path.resolve(__dirname, '../../server/lib');
const serverDbPath = path.resolve(__dirname, '../../server/database');

// 引入必要的模块
const FeishuClient = require(path.join(serverLibPath, 'feishu-client'));
const db = require(path.join(serverDbPath, 'db'));

// 从环境变量或.env文件读取配置
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const APP_ID = process.env.FeishuCC_App_ID || process.env.Feishu_Xiaoliu_App_ID;
const APP_SECRET = process.env.FeishuCC_App_Secret || process.env.Feishu_Xiaoliu_App_Secret;

if (!APP_ID || !APP_SECRET) {
    console.error('❌ 错误：未配置飞书应用凭据');
    console.error('请在.env文件中设置：');
    console.error('  FeishuCC_App_ID=你的应用ID');
    console.error('  FeishuCC_App_Secret=你的应用密钥');
    process.exit(1);
}

// 初始化飞书客户端
const feishuClient = new FeishuClient(APP_ID, APP_SECRET);
const feishuDb = db.feishu;

/**
 * 刷新单个群组的成员信息
 */
async function refreshGroupMembers(chatId) {
    try {
        console.log(`\n📋 正在刷新群组 ${chatId} 的成员信息...`);

        // 1. 获取群组信息
        let chatInfo;
        try {
            chatInfo = await feishuClient.getChatInfo(chatId);
            console.log(`   群名称: ${chatInfo.name || '未知'}`);
            console.log(`   群类型: ${chatInfo.chat_mode || '未知'}`);
        } catch (error) {
            console.log(`   ⚠️ 无法获取群组信息: ${error.message}`);
        }

        // 2. 获取成员列表
        const members = await feishuClient.getChatMembers(chatId);
        console.log(`   成员数: ${members.length}`);

        // 3. 更新数据库
        let userCount = 0;
        let botCount = 0;

        for (const member of members) {
            const memberInfo = {
                open_id: member.open_id || member.member_id,
                user_id: member.user_id,
                name: member.name,
                member_type: member.member_type || 'user',
                tenant_key: member.tenant_key
            };

            // 判断是否为机器人
            if (memberInfo.name && (
                memberInfo.name.includes('小六') ||
                memberInfo.name.includes('AI初老师') ||
                memberInfo.name.includes('机器人') ||
                memberInfo.name.includes('Bot')
            )) {
                memberInfo.member_type = 'app';
                botCount++;
            } else {
                userCount++;
            }

            // 保存到数据库
            feishuDb.upsertGroupMember(chatId, memberInfo.open_id, memberInfo);
        }

        console.log(`   ✅ 更新完成: ${userCount} 个用户, ${botCount} 个机器人`);
        return { success: true, userCount, botCount, total: members.length };

    } catch (error) {
        console.error(`   ❌ 刷新失败: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * 主函数：刷新所有群组
 */
async function refreshAllGroups() {
    console.log('🚀 开始刷新所有群组成员信息');
    console.log('='.repeat(50));

    try {
        // 1. 获取所有群组会话
        const sessions = feishuDb.getAllSessions();
        const groupSessions = sessions.filter(s => s.session_type === 'group');

        console.log(`\n📊 统计信息:`);
        console.log(`   总会话数: ${sessions.length}`);
        console.log(`   群组会话数: ${groupSessions.length}`);

        // 2. 提取唯一的群组ID
        const chatIds = new Set();
        groupSessions.forEach(session => {
            if (session.feishu_id) {
                chatIds.add(session.feishu_id);
            }
        });

        // 3. 从成员表获取额外的群组ID
        const memberGroups = feishuDb.run(`
            SELECT DISTINCT chat_id FROM feishu_group_members
        `).all();

        memberGroups.forEach(row => {
            if (row.chat_id) {
                chatIds.add(row.chat_id);
            }
        });

        console.log(`   需要刷新的群组数: ${chatIds.size}`);
        console.log('='.repeat(50));

        // 4. 逐个刷新群组
        const results = {
            success: 0,
            failed: 0,
            totalUsers: 0,
            totalBots: 0,
            totalMembers: 0
        };

        for (const chatId of chatIds) {
            const result = await refreshGroupMembers(chatId);

            if (result.success) {
                results.success++;
                results.totalUsers += result.userCount;
                results.totalBots += result.botCount;
                results.totalMembers += result.total;
            } else {
                results.failed++;
            }

            // 避免请求过快
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // 5. 输出统计结果
        console.log('\n' + '='.repeat(50));
        console.log('📈 刷新完成统计:');
        console.log(`   成功刷新: ${results.success} 个群组`);
        console.log(`   刷新失败: ${results.failed} 个群组`);
        console.log(`   总成员数: ${results.totalMembers}`);
        console.log(`   - 用户: ${results.totalUsers}`);
        console.log(`   - 机器人: ${results.totalBots}`);

        // 6. 生成报告
        const reportPath = path.join(__dirname, '..', '群组成员刷新报告.json');
        const report = {
            timestamp: new Date().toISOString(),
            stats: results,
            groups: Array.from(chatIds),
            duration: Date.now() - startTime
        };

        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        console.log(`\n📄 详细报告已保存至: ${reportPath}`);

    } catch (error) {
        console.error(`\n❌ 刷新过程出错: ${error.message}`);
        console.error(error.stack);
        process.exit(1);
    }
}

// 记录开始时间
const startTime = Date.now();

// 执行刷新
refreshAllGroups()
    .then(() => {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`\n⏱️ 总耗时: ${duration} 秒`);
        console.log('✨ 群组成员信息刷新完成！');
        process.exit(0);
    })
    .catch(error => {
        console.error('致命错误:', error);
        process.exit(1);
    });