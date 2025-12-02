#!/usr/bin/env node
/**
 * 生成进程监控报告并发送到飞书（带对话概括）
 */

import processMonitor from '../server/lib/process-monitor.js';
import { FeishuClient } from '../server/lib/feishu-client.js';
import { db, credentialsDb, userDb, initializeDatabase } from '../server/database/db.js';
import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';

// 读取JSONL文件的最近N条用户输入
function readRecentUserInputs(filePath, maxMessages = 30) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n');
  const userInputs = [];

  // 从后往前读取，收集用户输入
  for (let i = lines.length - 1; i >= 0; i--) {
    if (userInputs.length >= maxMessages) break;

    const line = lines[i];
    if (!line.trim()) continue;

    try {
      const obj = JSON.parse(line);
      if (obj.type === 'user') {
        let text = '';

        // 检查 obj.content（旧格式）
        if (obj.content) {
          text = typeof obj.content === 'string' ? obj.content :
            (Array.isArray(obj.content) ? obj.content.filter(c => c.type === 'text').map(c => c.text).join(' ') : '');
        }
        // 检查 obj.message.content（新格式）
        else if (obj.message && obj.message.content) {
          if (typeof obj.message.content === 'string') {
            text = obj.message.content;
          } else if (Array.isArray(obj.message.content)) {
            text = obj.message.content.filter(c => c.type === 'text').map(c => c.text).join(' ');
          }
        }

        if (text.trim()) {
          userInputs.unshift(text.trim()); // 保持时间顺序
        }
      }
    } catch (e) {
      // 跳过解析失败的行
    }
  }

  return userInputs;
}

// 从JSONL提取对话
function extractConversation(jsonlContent) {
  const lines = jsonlContent.trim().split('\n');
  const messages = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);

      // 处理用户消息：需要检查 obj.message.content
      if (obj.type === 'user') {
        let text = '';

        // 检查 obj.content（旧格式）
        if (obj.content) {
          text = typeof obj.content === 'string' ? obj.content :
            (Array.isArray(obj.content) ? obj.content.filter(c => c.type === 'text').map(c => c.text).join(' ') : '');
        }
        // 检查 obj.message.content（新格式）
        else if (obj.message && obj.message.content) {
          if (typeof obj.message.content === 'string') {
            text = obj.message.content;
          } else if (Array.isArray(obj.message.content)) {
            text = obj.message.content.filter(c => c.type === 'text').map(c => c.text).join(' ');
          }
        }

        if (text.trim()) messages.push({ role: 'user', content: text.trim() });
      }
      // 处理助手消息：可能在obj.content或obj.message.content
      else if (obj.type === 'assistant') {
        let textArray = [];

        // 检查 obj.content
        if (obj.content) {
          if (typeof obj.content === 'string') {
            textArray.push(obj.content);
          } else if (Array.isArray(obj.content)) {
            textArray.push(...obj.content.filter(c => c.type === 'text').map(c => c.text));
          }
        }

        // 检查 obj.message.content
        if (obj.message && obj.message.content) {
          if (typeof obj.message.content === 'string') {
            textArray.push(obj.message.content);
          } else if (Array.isArray(obj.message.content)) {
            textArray.push(...obj.message.content.filter(c => c.type === 'text').map(c => c.text));
          }
        }

        const text = textArray.join(' ').trim();
        if (text) messages.push({ role: 'assistant', content: text });
      }
    } catch (e) {
      // 跳过解析失败的行（可能是被截断的）
    }
  }
  return messages;
}

// 调用DeepSeek API（分析用户输入数组）
async function callDeepSeekAPI(userInputs, apiKey, maxWords = 50) {
  if (!userInputs || userInputs.length === 0) {
    return '无用户输入';
  }

  const conversationText = userInputs.map((input, i) => `${i + 1}. ${input}`).join('\n');
  const prompt = `请用不超过${maxWords}字概括以下用户的需求和问题：\n\n${conversationText}`;

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxWords * 3,
      temperature: 0.3
    })
  });

  if (!response.ok) throw new Error(`API error: ${response.status}`);
  const data = await response.json();
  return data.choices[0]?.message?.content?.trim() || '无法生成概括';
}

// 概括单个会话（返回详细信息）
async function summarizeSession(session, apiKey, maxWords = 50) {
  try {
    // 转换路径：/home/ccp/feicc/group-oc_xxx -> -home-ccp-feicc-group-oc-xxx
    // 注意：需要将 / 和 _ 都替换为 -
    let normalizedPath = session.projectPath.startsWith('/') ?
      '-' + session.projectPath.slice(1) :
      session.projectPath;
    normalizedPath = normalizedPath.replace(/[/_]/g, '-');

    const filePath = path.join('/home/ccp/.claude/projects', normalizedPath, `${session.claudeSessionId}.jsonl`);

    if (!fs.existsSync(filePath)) return null;

    // 读取最近30条用户输入
    const userInputs = readRecentUserInputs(filePath, 30);

    if (!userInputs || userInputs.length === 0) {
      return {
        summary: '无用户输入',
        totalInputs: 0,
        recentInputs: []
      };
    }

    // 获取最近3条
    const recentInputs = userInputs.slice(-3);

    // 调用DeepSeek生成总结
    const summary = await callDeepSeekAPI(userInputs, apiKey, maxWords);

    return {
      summary: summary,
      totalInputs: userInputs.length,
      recentInputs: recentInputs
    };
  } catch (error) {
    console.error(`概括失败 ${session.feishuId}:`, error.message);
    return null;
  }
}

// 生成基础报告（不含概括）
async function generateBasicReport(feishuClient) {
  const report = await processMonitor.getSessionsReport(feishuClient);
  const now = new Date();
  const timestamp = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  let md = `# 飞书+Claude Code 进程监控报告\n\n`;
  md += `**生成时间**: ${timestamp}\n\n`;
  md += `---\n\n`;

  md += `## 📊 总体统计\n\n`;
  md += `- **总会话数**: ${report.stats.totalSessions}个\n`;
  md += `- **群聊会话**: ${report.stats.groupSessions}个\n`;
  md += `- **私聊会话**: ${report.stats.privateSessions}个\n`;
  md += `- **运行中的Claude子进程**: ${report.stats.activeClaude}个\n\n`;
  md += `---\n\n`;

  // 活跃会话
  const activeSessions = report.sessions.filter(s => {
    const lastActivityTime = new Date(s.lastActivity + (s.lastActivity.includes('Z') ? '' : 'Z'));
    const hoursDiff = (new Date() - lastActivityTime) / (1000 * 60 * 60);
    return hoursDiff <= 4;
  });

  if (activeSessions.length > 0) {
    md += `## 🔥 活跃会话（4小时内）\n\n`;
    md += `共 ${activeSessions.length} 个活跃会话\n\n`;

    activeSessions.forEach((s, index) => {
      const lastActivityTime = new Date(s.lastActivity + (s.lastActivity.includes('Z') ? '' : 'Z'));
      const beijingTime = lastActivityTime.toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour12: false
      });

      md += `### ${index + 1}. ${s.chatName || s.feishuId}\n\n`;
      md += `- **类型**: ${s.sessionType === 'group' ? '群聊' : '私聊'}\n`;
      md += `- **Chat ID**: \`${s.feishuId}\`\n`;
      md += `- **最后活动**: ${beijingTime}\n`;

      if (s.processInfo) {
        md += `- **Claude进程**: 运行中 (PID: ${s.processInfo.pid}, 内存: ${processMonitor.formatMemory(s.processInfo.rssMB)})\n`;
      } else {
        md += `- **Claude进程**: 空闲\n`;
      }
      md += `\n`;
    });
  }

  md += `---\n\n`;

  // 所有对话列表
  md += `## 📋 所有对话列表（按时间排序）\n\n`;
  md += `| 状态 | 群聊名称 | 类型 | Chat ID | 群联系人 | 最后活动 |\n`;
  md += `|------|----------|------|---------|----------|----------|\n`;

  const sortedSessions = report.sessions.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));

  sortedSessions.forEach(s => {
    const lastActivityTime = new Date(s.lastActivity + (s.lastActivity.includes('Z') ? '' : 'Z'));
    const hoursDiff = (new Date() - lastActivityTime) / (1000 * 60 * 60);
    const status = hoursDiff <= 4 ? '🟢' : '⚪';
    const type = s.sessionType === 'group' ? '群聊' : '私聊';
    const name = s.chatName || s.feishuId;
    const beijingTime = lastActivityTime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });

    // 获取群联系人
    let members = '';
    try {
      const groupMembers = db.getGroupMembers(s.feishuId);
      if (groupMembers && groupMembers.length > 0) {
        members = groupMembers.map(m => m.name).filter(n => n).join(', ');
      }
    } catch (err) {
      console.error(`获取群成员失败 ${s.feishuId}:`, err.message);
    }

    md += `| ${status} | ${name} | ${type} | \`${s.feishuId}\` | ${members} | ${beijingTime} |\n`;
  });

  md += `\n---\n\n*报告由监控脚本自动生成*\n`;
  return md;
}

// 生成带DeepSeek概括的报告
async function generateDeepSeekReport(feishuClient, summaries) {
  const report = await processMonitor.getSessionsReport(feishuClient);
  const now = new Date();
  const timestamp = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  let md = `# 飞书+Claude Code 进程监控报告（DeepSeek AI概括版）\n\n`;
  md += `**生成时间**: ${timestamp}\n\n`;
  md += `---\n\n`;

  md += `## 📊 总体统计\n\n`;
  md += `- **总会话数**: ${report.stats.totalSessions}个\n`;
  md += `- **群聊会话**: ${report.stats.groupSessions}个\n`;
  md += `- **私聊会话**: ${report.stats.privateSessions}个\n`;
  md += `- **运行中的Claude子进程**: ${report.stats.activeClaude}个\n\n`;
  md += `---\n\n`;

  // 最近3个会话（按时间排序）
  const sortedSessions = report.sessions.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
  const recentSessions = sortedSessions.slice(0, 3);

  md += `## 🔥 最近3个会话（带AI概括）\n\n`;

  recentSessions.forEach((s, index) => {
    const lastActivityTime = new Date(s.lastActivity + (s.lastActivity.includes('Z') ? '' : 'Z'));
    const beijingTime = lastActivityTime.toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      hour12: false
    });
    const hoursDiff = (new Date() - lastActivityTime) / (1000 * 60 * 60);
    const status = hoursDiff <= 4 ? '🟢 活跃' : '⚪ 空闲';

    md += `### ${index + 1}. ${s.chatName || s.feishuId}\n\n`;
    md += `- **状态**: ${status}\n`;
    md += `- **类型**: ${s.sessionType === 'group' ? '群聊' : '私聊'}\n`;
    md += `- **Chat ID**: \`${s.feishuId}\`\n`;
    md += `- **最后活动**: ${beijingTime}\n`;

    if (s.processInfo) {
      md += `- **Claude进程**: 运行中 (PID: ${s.processInfo.pid}, 内存: ${processMonitor.formatMemory(s.processInfo.rssMB)})\n`;
    } else {
      md += `- **Claude进程**: 空闲\n`;
    }

    // 添加对话详情
    const sessionDetail = summaries[s.feishuId];
    if (sessionDetail) {
      // 1. 显示最近3条用户输入
      if (sessionDetail.recentInputs && sessionDetail.recentInputs.length > 0) {
        md += `\n**📝 最近${sessionDetail.recentInputs.length}条用户输入**:\n\n`;
        sessionDetail.recentInputs.forEach((input, idx) => {
          md += `${idx + 1}. ${input}\n`;
        });
        md += `\n`;
      }

      // 2. 显示提炼了多少条
      if (sessionDetail.totalInputs > 0) {
        md += `**📊 统计**: 共提炼了 ${sessionDetail.totalInputs} 条用户输入\n\n`;
      }

      // 3. DeepSeek AI总结
      md += `**🤖 AI对话概括**:\n\n`;
      md += `> ${sessionDetail.summary}\n`;
    } else {
      md += `\n**🤖 AI对话概括**: 无法生成概括\n`;
    }

    md += `\n`;
  });

  md += `---\n\n`;

  // 所有对话列表
  md += `## 📋 所有对话列表（按时间排序）\n\n`;
  md += `| 状态 | 群聊名称 | 类型 | Chat ID | 群联系人 | 最后活动 |\n`;
  md += `|------|----------|------|---------|----------|----------|\n`;

  sortedSessions.forEach(s => {
    const lastActivityTime = new Date(s.lastActivity + (s.lastActivity.includes('Z') ? '' : 'Z'));
    const hoursDiff = (new Date() - lastActivityTime) / (1000 * 60 * 60);
    const status = hoursDiff <= 4 ? '🟢' : '⚪';
    const type = s.sessionType === 'group' ? '群聊' : '私聊';
    const name = s.chatName || s.feishuId;
    const beijingTime = lastActivityTime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });

    // 获取群联系人
    let members = '';
    try {
      const groupMembers = db.getGroupMembers(s.feishuId);
      if (groupMembers && groupMembers.length > 0) {
        members = groupMembers.map(m => m.name).filter(n => n).join(', ');
      }
    } catch (err) {
      console.error(`获取群成员失败 ${s.feishuId}:`, err.message);
    }

    md += `| ${status} | ${name} | ${type} | \`${s.feishuId}\` | ${members} | ${beijingTime} |\n`;
  });

  md += `\n---\n\n*报告由监控脚本自动生成，对话概括由DeepSeek AI提供*\n`;
  return md;
}

// 查找 GAC管理员 群聊的 chat_id
async function findGACAdminChatId() {
  const dbPath = path.join(process.cwd(), 'server/database/auth.db');
  const database = new sqlite3.Database(dbPath);

  try {
    // 先初始化数据库
    await initializeDatabase();

    // 查询所有群聊会话
    const groups = await new Promise((resolve, reject) => {
      database.all(
        `SELECT feishu_id FROM feishu_sessions
         WHERE session_type = 'group' AND is_active = 1`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    // 获取飞书客户端
    const user = userDb.getFirstUser();
    if (!user) {
      database.close();
      return null;
    }

    let appId, appSecret;
    const credentialValue = credentialsDb.getActiveCredential(user.id, 'feishu');
    if (credentialValue) {
      const credentials = JSON.parse(credentialValue);
      appId = credentials.appId;
      appSecret = credentials.appSecret;
    } else {
      appId = process.env.FeishuCC_App_ID;
      appSecret = process.env.FeishuCC_App_Secret;
    }

    if (!appId || !appSecret) {
      database.close();
      return null;
    }

    const client = new FeishuClient({ appId, appSecret });

    // 遍历群聊，查找 GAC管理员
    for (const group of groups) {
      const chatId = group.feishu_id;
      try {
        const chatInfo = await client.getChatInfo(chatId);
        if (chatInfo && chatInfo.name === 'GAC管理员') {
          database.close();
          return chatId;
        }
      } catch (error) {
        // 忽略获取群聊信息失败的情况
      }
    }

    database.close();
    return null;
  } catch (error) {
    if (database) database.close();
    return null;
  }
}

async function main() {
  try {
    let chatId = process.argv[2];
    if (!chatId) {
      // 首先尝试查找 GAC管理员 群聊
      console.log('🔍 查找 GAC管理员 群聊...');
      const gacAdminChatId = await findGACAdminChatId();

      if (gacAdminChatId) {
        chatId = gacAdminChatId;
        console.log('✅ 找到 GAC管理员 群聊:', chatId);
      } else {
        // 如果没找到，尝试从当前目录检测
        const cwd = process.cwd();
        const match = cwd.match(/\/(group-oc_[a-f0-9]+|user-ou_[a-zA-Z0-9]+)$/);
        if (match) {
          chatId = match[1].replace(/^(group-|user-)/, '');
          console.log('📍 自动检测到当前会话:', chatId);
        } else {
          console.error('❌ 未找到 GAC管理员 群聊，且无法自动检测会话');
          console.error('用法: node scripts/send-process-report-with-summary.js [chat_id]');
          process.exit(1);
        }
      }
    }

    console.log('📊 生成进程监控报告...');
    await initializeDatabase();

    const user = userDb.getFirstUser();
    if (!user) throw new Error('未找到用户');

    let appId, appSecret;
    const credentialValue = credentialsDb.getActiveCredential(user.id, 'feishu');
    if (credentialValue) {
      const credentials = JSON.parse(credentialValue);
      appId = credentials.appId;
      appSecret = credentials.appSecret;
    } else {
      appId = process.env.FeishuCC_App_ID;
      appSecret = process.env.FeishuCC_App_Secret;
    }

    if (!appId || !appSecret) throw new Error('未找到飞书凭证');

    const client = new FeishuClient({ appId, appSecret });

    console.log('🔍 获取群聊名称和会话信息...');
    const report = await processMonitor.getSessionsReport(client);

    // 创建 ./feicc 目录
    const feiccDir = path.join(process.cwd(), 'feicc');
    if (!fs.existsSync(feiccDir)) {
      fs.mkdirSync(feiccDir, { recursive: true });
      console.log('📁 创建目录:', feiccDir);
    }

    // 1. 生成基础报告 session.md（但不发送）
    // const basicReportContent = await generateBasicReport(client);
    // const basicReportPath = path.join(feiccDir, 'session.md');
    // fs.writeFileSync(basicReportPath, basicReportContent, 'utf8');
    // console.log('✅ 基础报告已生成:', basicReportPath);

    // 2. 获取最近3个会话
    const sortedSessions = report.sessions
      .sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity))
      .slice(0, 3)
      .filter(s => s.claudeSessionId); // 只处理有claudeSessionId的会话

    let summaries = {};
    const deepseekApiKey = process.env.DEEPSEEK_API_KEY;

    if (deepseekApiKey && sortedSessions.length > 0) {
      console.log(`🤖 使用DeepSeek API概括最近 ${sortedSessions.length} 个会话...`);

      // 并发调用API（最多3个），每个生成100字概括
      const summaryPromises = sortedSessions.map(s => summarizeSession(s, deepseekApiKey, 100));
      const results = await Promise.all(summaryPromises);

      sortedSessions.forEach((s, i) => {
        if (results[i]) {
          summaries[s.feishuId] = results[i];
        }
      });

      console.log(`✅ AI概括完成`);
    } else if (!deepseekApiKey) {
      console.log('⚠️  未设置DEEPSEEK_API_KEY，跳过AI概括');
    }

    // 3. 生成DeepSeek概括报告并保存为"Claude Code状态.md"
    const dsReportContent = await generateDeepSeekReport(client, summaries);
    const dsReportPath = path.join(feiccDir, 'Claude Code状态.md');
    fs.writeFileSync(dsReportPath, dsReportContent, 'utf8');
    console.log('✅ DeepSeek概括报告已生成:', dsReportPath);

    // 4. 只发送DeepSeek版本到飞书
    console.log('📤 发送报告到飞书会话:', chatId);
    await client.sendFile(chatId, dsReportPath);
    console.log('✅ Claude Code状态.md 发送成功！');

  } catch (error) {
    console.error('❌ 错误:', error.message);
    process.exit(1);
  }
}

main();
