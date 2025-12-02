/**
 * 对话概括模块
 * 使用DeepSeek API概括Claude对话内容
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 读取JSONL文件的最后N个字符
 */
export function readLastChars(filePath, maxChars = 1000) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  return content.slice(-maxChars);
}

/**
 * 从JSONL内容中提取用户和助手的对话
 */
export function extractConversation(jsonlContent) {
  const lines = jsonlContent.trim().split('\n');
  const messages = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    try {
      const obj = JSON.parse(line);

      if (obj.type === 'user' && obj.content) {
        // 提取用户消息
        if (typeof obj.content === 'string') {
          messages.push({ role: 'user', content: obj.content });
        } else if (Array.isArray(obj.content)) {
          const textContent = obj.content
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join(' ');
          if (textContent) {
            messages.push({ role: 'user', content: textContent });
          }
        }
      } else if (obj.type === 'assistant' && obj.content) {
        // 提取助手消息
        if (typeof obj.content === 'string') {
          messages.push({ role: 'assistant', content: obj.content });
        } else if (Array.isArray(obj.content)) {
          const textContent = obj.content
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join(' ');
          if (textContent) {
            messages.push({ role: 'assistant', content: textContent });
          }
        }
      }
    } catch (e) {
      // 跳过无效的JSON行
      continue;
    }
  }

  return messages;
}

/**
 * 调用DeepSeek API进行概括
 */
export async function callDeepSeekAPI(messages, apiKey) {
  if (!apiKey) {
    throw new Error('DeepSeek API key not provided');
  }

  // 构建prompt
  const conversationText = messages
    .map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
    .join('\n');

  const prompt = `请用不超过50字概括以下对话的主题和内容：\n\n${conversationText}`;

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'user', content: prompt }
      ],
      max_tokens: 100,
      temperature: 0.3
    })
  });

  if (!response.ok) {
    throw new Error(`DeepSeek API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content?.trim() || '无法生成概括';
}

/**
 * 获取会话的JSONL文件路径
 */
export function getSessionFilePath(projectPath, claudeSessionId) {
  if (!claudeSessionId) {
    return null;
  }

  // 从项目路径构建.claude路径
  // 例如: /home/ccp/feicc/group-oc_xxx -> -home-ccp-feicc-group-oc_xxx
  const normalizedPath = projectPath.startsWith('/')
    ? '-' + projectPath.slice(1).replace(/\//g, '-')
    : projectPath.replace(/\//g, '-');

  const claudeProjectPath = path.join(
    '/home/ccp/.claude/projects',
    normalizedPath,
    `${claudeSessionId}.jsonl`
  );

  if (fs.existsSync(claudeProjectPath)) {
    return claudeProjectPath;
  }

  return null;
}

/**
 * 概括单个会话
 */
export async function summarizeSession(session, apiKey) {
  try {
    // 获取会话文件路径
    const filePath = getSessionFilePath(session.projectPath, session.claudeSessionId);

    if (!filePath) {
      return null;
    }

    // 读取最后1000字符
    const lastContent = readLastChars(filePath, 1000);

    // 提取对话
    const messages = extractConversation(lastContent);

    if (messages.length === 0) {
      return '无对话内容';
    }

    // 调用API概括
    const summary = await callDeepSeekAPI(messages, apiKey);

    return summary;
  } catch (error) {
    console.error(`[summarizeSession] Error for session ${session.feishuId}:`, error.message);
    return null;
  }
}

/**
 * 并发概括多个会话（最多5个）
 */
export async function summarizeSessions(sessions, apiKey, maxConcurrent = 5) {
  // 只处理前5个会话
  const sessionsToSummarize = sessions.slice(0, 5);

  // 并发调用，最多5个线程
  const promises = sessionsToSummarize.map(session =>
    summarizeSession(session, apiKey)
  );

  const summaries = await Promise.all(promises);

  // 返回会话和概括的映射
  const result = {};
  sessionsToSummarize.forEach((session, index) => {
    result[session.feishuId] = summaries[index];
  });

  return result;
}
