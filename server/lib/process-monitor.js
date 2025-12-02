/**
 * 进程监控工具模块
 * 提供查询飞书+Claude Code子进程状态的API
 */

import { getActiveClaudeSessions, isClaudeSessionActive } from '../claude-cli.js';
import { feishuDb } from '../database/db.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * 获取进程内存信息
 * @param {string|number} pid - 进程ID
 * @returns {Promise<Object|null>} 进程信息
 */
export async function getProcessInfo(pid) {
  try {
    const { stdout } = await execAsync(`ps -p ${pid} -o pid,ppid,%mem,%cpu,etime,rss --no-headers`);
    const parts = stdout.trim().split(/\s+/);
    return {
      pid: parts[0],
      ppid: parts[1],
      memPercent: parseFloat(parts[2]),
      cpuPercent: parseFloat(parts[3]),
      etime: parts[4],
      rssKB: parseInt(parts[5]),
      rssMB: parseFloat((parseInt(parts[5]) / 1024).toFixed(2))
    };
  } catch (e) {
    return null;
  }
}

/**
 * 获取所有Claude子进程的系统信息
 * @returns {Promise<Map>} Map<sessionId, processInfo>
 */
export async function getClaudeProcesses() {
  try {
    const { stdout } = await execAsync(
      'ps aux | grep -E "claude.*--resume" | grep -v grep || echo ""'
    );

    const processMap = new Map();
    if (stdout.trim()) {
      const lines = stdout.trim().split('\n');
      for (const line of lines) {
        const resumeMatch = line.match(/--resume=([a-f0-9-]+)/);
        if (resumeMatch) {
          const sessionId = resumeMatch[1];
          const parts = line.trim().split(/\s+/);
          const pid = parts[1];

          const info = await getProcessInfo(pid);
          if (info) {
            processMap.set(sessionId, info);
          }
        }
      }
    }
    return processMap;
  } catch (e) {
    return new Map();
  }
}

/**
 * 获取完整的会话状态报告
 * @param {FeishuClient} feishuClient - 飞书客户端实例（可选）
 * @returns {Promise<Object>} 完整的状态报告
 */
export async function getSessionsReport(feishuClient = null) {
  // 获取活跃的Claude会话
  const activeSessions = getActiveClaudeSessions();

  // 获取所有飞书会话
  const allSessions = feishuDb.getAllSessions();

  // 获取系统进程信息
  const claudeProcesses = await getClaudeProcesses();

  // 统计信息
  const stats = {
    totalSessions: allSessions.length,
    activeClaude: activeSessions.length,
    groupSessions: allSessions.filter(s => s.session_type === 'group').length,
    privateSessions: allSessions.filter(s => s.session_type === 'private').length,
    totalMemoryMB: 0,
    avgMemoryMB: 0
  };

  // 处理每个会话的详细信息
  const sessions = [];
  for (const session of allSessions) {
    const isRunning = session.claude_session_id && activeSessions.includes(session.claude_session_id);
    const processInfo = claudeProcesses.get(session.claude_session_id);

    const sessionData = {
      id: session.id,
      conversationId: session.conversation_id,
      feishuId: session.feishu_id,
      sessionType: session.session_type,
      claudeSessionId: session.claude_session_id,
      projectPath: session.project_path,
      isRunning: isRunning,
      lastActivity: session.last_activity,
      processInfo: processInfo || null
    };

    // 如果提供了飞书客户端，获取群聊名称
    if (feishuClient && session.session_type === 'group') {
      try {
        const chatRes = await feishuClient.client.im.chat.get({
          path: { chat_id: session.feishu_id }
        });
        if (chatRes.code === 0) {
          sessionData.chatName = chatRes.data.name || '未命名';
        }
      } catch (e) {
        sessionData.chatName = '获取失败';
      }
    } else if (session.session_type === 'private') {
      sessionData.chatName = '私聊';
    }

    if (processInfo) {
      stats.totalMemoryMB += processInfo.rssMB;
    }

    sessions.push(sessionData);
  }

  if (stats.activeClaude > 0) {
    stats.avgMemoryMB = parseFloat((stats.totalMemoryMB / stats.activeClaude).toFixed(2));
  }

  return {
    timestamp: new Date().toISOString(),
    stats: stats,
    sessions: sessions
  };
}

/**
 * 获取特定会话的状态
 * @param {string} feishuId - 飞书Chat ID或User ID
 * @returns {Promise<Object|null>} 会话状态
 */
export async function getSessionStatus(feishuId) {
  const session = feishuDb.getSessionByFeishuId(feishuId);
  if (!session) {
    return null;
  }

  const isRunning = session.claude_session_id && isClaudeSessionActive(session.claude_session_id);
  let processInfo = null;

  if (isRunning) {
    const processes = await getClaudeProcesses();
    processInfo = processes.get(session.claude_session_id);
  }

  return {
    session: session,
    isRunning: isRunning,
    processInfo: processInfo
  };
}

/**
 * 格式化内存大小
 * @param {number} mb - 内存大小(MB)
 * @returns {string} 格式化后的字符串
 */
export function formatMemory(mb) {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${mb.toFixed(2)} MB`;
}

/**
 * 格式化运行时间
 * @param {string} etime - ps命令的etime格式
 * @returns {string} 人类可读的时间
 */
export function formatElapsedTime(etime) {
  if (!etime) return '未知';

  // 格式可能是: [[DD-]HH:]MM:SS
  if (etime.includes('-')) {
    const [days, time] = etime.split('-');
    return `${days}天 ${time}`;
  }

  const parts = etime.split(':');
  if (parts.length === 3) {
    const [hh, mm, ss] = parts;
    if (parseInt(hh) > 0) {
      return `${parseInt(hh)}小时 ${parseInt(mm)}分`;
    }
    return `${parseInt(mm)}分 ${parseInt(ss)}秒`;
  }

  return etime;
}

/**
 * 打印简单的会话列表
 */
export async function printSessionsList() {
  const report = await getSessionsReport();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 飞书+Claude Code 会话状态');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`\n总会话: ${report.stats.totalSessions}个 (群聊: ${report.stats.groupSessions}, 私聊: ${report.stats.privateSessions})`);
  console.log(`运行中: ${report.stats.activeClaude}个 | 总内存: ${formatMemory(report.stats.totalMemoryMB)}`);

  if (report.stats.activeClaude > 0) {
    console.log(`平均内存: ${formatMemory(report.stats.avgMemoryMB)}`);

    console.log('\n🔥 运行中的会话:\n');
    report.sessions
      .filter(s => s.isRunning)
      .forEach(s => {
        console.log(`  ${s.chatName || s.feishuId}`);
        console.log(`  ├─ Chat ID: ${s.feishuId}`);
        console.log(`  ├─ Session: ${s.claudeSessionId}`);
        if (s.processInfo) {
          console.log(`  ├─ PID: ${s.processInfo.pid}`);
          console.log(`  ├─ 内存: ${formatMemory(s.processInfo.rssMB)} (${s.processInfo.memPercent}%)`);
          console.log(`  ├─ CPU: ${s.processInfo.cpuPercent}%`);
          console.log(`  └─ 运行时间: ${formatElapsedTime(s.processInfo.etime)}`);
        }
        console.log('');
      });
  } else {
    console.log('\n⚪ 当前无运行中的子进程');
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  return report;
}

// 导出便捷方法
export default {
  getProcessInfo,
  getClaudeProcesses,
  getSessionsReport,
  getSessionStatus,
  formatMemory,
  formatElapsedTime,
  printSessionsList
};
