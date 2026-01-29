/**
 * 上下文健康检查脚本
 *
 * 功能：
 * 1. 检查所有飞书会话的消息数量和字符总量
 * 2. 识别需要清理的高风险会话
 * 3. 生成健康报告
 *
 * 运行方式：
 *   node server/check-context-health.js
 *   node server/check-context-health.js --auto-clean  # 自动清理危险会话
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, 'database', 'auth.db');
const db = new Database(DB_PATH);

// 阈值配置
const THRESHOLDS = {
  MESSAGE_WARNING: 300,      // 消息数量警告阈值
  MESSAGE_DANGER: 500,       // 消息数量危险阈值
  CHARS_WARNING: 30000,      // 字符数警告阈值
  CHARS_DANGER: 50000,       // 字符数危险阈值
  TOKENS_ESTIMATE: 2.5,      // 中文 token 估算（1 token ≈ 2.5 字符）
  CONTEXT_LIMIT: 200000,     // Claude Opus 4.5 上下文限制（tokens）
  SAFE_THRESHOLD: 0.8,       // 安全阈值（80%）
};

/**
 * 获取所有会话的上下文统计
 */
function getContextStats() {
  const query = `
    SELECT
      s.id,
      s.conversation_id,
      s.session_type,
      s.claude_session_id,
      s.last_activity,
      COUNT(m.id) as msg_count,
      SUM(LENGTH(m.content)) as total_chars,
      ROUND(AVG(LENGTH(m.content)), 1) as avg_chars,
      MAX(LENGTH(m.content)) as max_chars
    FROM feishu_sessions s
    LEFT JOIN feishu_message_log m ON s.id = m.session_id
    WHERE m.message_type = 'text'
    GROUP BY s.id
    HAVING msg_count > 0
    ORDER BY msg_count DESC
  `;

  return db.prepare(query).all();
}

/**
 * 评估会话风险等级
 */
function assessRisk(session) {
  const { msg_count, total_chars } = session;

  // 估算 token 使用量
  const estimated_tokens = Math.ceil(total_chars / THRESHOLDS.TOKENS_ESTIMATE);
  const usage_ratio = estimated_tokens / THRESHOLDS.CONTEXT_LIMIT;

  // 风险评级
  let risk_level = 'LOW';
  if (
    msg_count >= THRESHOLDS.MESSAGE_DANGER ||
    total_chars >= THRESHOLDS.CHARS_DANGER ||
    usage_ratio >= THRESHOLDS.SAFE_THRESHOLD
  ) {
    risk_level = 'DANGER';
  } else if (
    msg_count >= THRESHOLDS.MESSAGE_WARNING ||
    total_chars >= THRESHOLDS.CHARS_WARNING ||
    usage_ratio >= 0.5
  ) {
    risk_level = 'WARNING';
  }

  return {
    ...session,
    estimated_tokens,
    usage_ratio: (usage_ratio * 100).toFixed(2) + '%',
    risk_level,
  };
}

/**
 * 清理危险会话
 */
function cleanDangerousSessions(sessions) {
  const cleaned = [];

  for (const session of sessions) {
    if (session.risk_level === 'DANGER') {
      // 清空 claude_session_id
      db.prepare('UPDATE feishu_sessions SET claude_session_id = NULL WHERE id = ?')
        .run(session.id);

      cleaned.push(session);
      console.log(`  ✅ 已清理会话 ${session.id} (${session.conversation_id})`);
    }
  }

  return cleaned;
}

/**
 * 生成健康报告
 */
function generateReport(sessions) {
  const assessed = sessions.map(assessRisk);

  const low = assessed.filter(s => s.risk_level === 'LOW');
  const warning = assessed.filter(s => s.risk_level === 'WARNING');
  const danger = assessed.filter(s => s.risk_level === 'DANGER');

  console.log('\n=== 📊 飞书对话上下文健康检查 ===\n');
  console.log(`检查时间: ${new Date().toLocaleString('zh-CN')}`);
  console.log(`总会话数: ${sessions.length}`);
  console.log(`🟢 低风险: ${low.length}`);
  console.log(`🟡 警告: ${warning.length}`);
  console.log(`🔴 危险: ${danger.length}`);

  if (danger.length > 0) {
    console.log('\n🔴 需要立即清理的会话（DANGER）:\n');
    console.table(
      danger.map(s => ({
        ID: s.id,
        会话类型: s.session_type,
        消息数: s.msg_count,
        总字符数: s.total_chars.toLocaleString(),
        估算Tokens: s.estimated_tokens.toLocaleString(),
        使用率: s.usage_ratio,
        最后活跃: s.last_activity,
      }))
    );

    console.log('\n建议操作:');
    console.log('  1. 运行 `node server/check-context-health.js --auto-clean` 自动清理');
    console.log('  2. 或手动清理: `sqlite3 server/database/auth.db "UPDATE feishu_sessions SET claude_session_id = NULL WHERE id = {ID};"`\n');
  }

  if (warning.length > 0) {
    console.log('\n🟡 建议清理的会话（WARNING）:\n');
    console.table(
      warning.map(s => ({
        ID: s.id,
        会话类型: s.session_type,
        消息数: s.msg_count,
        总字符数: s.total_chars.toLocaleString(),
        估算Tokens: s.estimated_tokens.toLocaleString(),
        使用率: s.usage_ratio,
        最后活跃: s.last_activity,
      }))
    );

    console.log('\n建议操作:');
    console.log('  - 观察这些会话的增长趋势');
    console.log('  - 若消息数超过 500，建议手动清理\n');
  }

  if (danger.length === 0 && warning.length === 0) {
    console.log('\n✅ 所有会话均在安全范围内，无需清理。\n');
  }

  return { low, warning, danger };
}

/**
 * 主函数
 */
function main() {
  const args = process.argv.slice(2);
  const autoClean = args.includes('--auto-clean');

  try {
    const sessions = getContextStats();

    if (sessions.length === 0) {
      console.log('未找到任何会话记录。');
      process.exit(0);
    }

    const report = generateReport(sessions);

    if (autoClean && report.danger.length > 0) {
      console.log('\n🔧 自动清理模式已启用...\n');
      const cleaned = cleanDangerousSessions(report.danger);
      console.log(`\n✅ 已清理 ${cleaned.length} 个危险会话。`);
      console.log('   下次用户发送消息时，系统将自动创建新会话。\n');
    }

    db.close();
  } catch (error) {
    console.error('❌ 检查失败:', error.message);
    process.exit(1);
  }
}

main();
