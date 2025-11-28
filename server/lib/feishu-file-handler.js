/**
 * Feishu File Command Handler
 *
 * Handles file-related commands in Feishu conversations
 */

import path from 'path';
import fs from 'fs';

export class FeishuFileHandler {
  // 最近发送记录，防止同一聊天短时间重复发送同一文件
  static recentlySent = new Map(); // key: `${chatId}:${filePath}` -> timestamp

  /**
   * Normalize extracted filename (strip markdown链接/多余符号)
   */
  static cleanFileName(name) {
    if (!name) return '';
    let cleaned = name.trim();
    // 优先去掉markdown链接尾巴: "[README.md](http://...)" -> "[README.md"
    cleaned = cleaned.replace(/\]\(.*/, '');
    // 去掉起始/结尾的中括号或括号
    cleaned = cleaned.replace(/^[\[\(]+/, '').replace(/[\]\)]+$/, '');
    return cleaned;
  }

  /**
   * Check if message is a file send command
   * 仅当以“发送”开头才触发
   * @param {string} userText - User's message text
   * @returns {Object|null} - { command: 'send', fileName: 'xxx' } or null
   */
  static parseFileCommand(userText) {
    const text = userText.trim();

    // 必须以“发送”开头
    if (!/^发送/i.test(text)) return null;

    // Pattern A: 发送 [xxx.md](url)
    let match = text.match(/^发送\s+\[([^\]\s]+\.(?:md|pdf|doc|docx|xls|xlsx|txt|zip|rar|jpg|png))\]\([^)]+\)/i);
    if (match) {
      return { command: 'send', fileName: this.cleanFileName(match[1]) };
    }

    // Pattern B: 发送 文件/路径
    match = text.match(/^发送(?:文件)?\s*([^\s]+\.(?:md|pdf|doc|docx|xls|xlsx|txt|zip|rar|jpg|png))/i);
    if (match) {
      return { command: 'send', fileName: this.cleanFileName(match[1]) };
    }

    return null;
  }

  /**
   * Check if message is a markdown convert command
   * 仅当以“转化”开头且文件为 .md
   * @param {string} userText
   * @returns {Object|null} - { command: 'convert', fileName: 'xxx.md' } or null
   */
  static parseConvertCommand(userText) {
    const text = userText.trim();
    if (!/^转化/i.test(text)) return null;

    const match = text.match(/^转化\s*([^\s]+\.(md))/i);
    if (match) {
      return { command: 'convert', fileName: this.cleanFileName(match[1]) };
    }
    return null;
  }

  /**
   * Find file in project directory
   * @param {string} projectPath - Project root path
   * @param {string} fileName - File name to find
   * @returns {string|null} - Full file path or null if not found
   */
  static findFile(projectPath, fileName) {
    const cleaned = this.cleanFileName(fileName);
    if (!cleaned) return null;

    // helper: case-insensitive lookup within a directory (non-recursive)
    const findCaseInsensitive = (dir, target) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const lowerTarget = target.toLowerCase();
        for (const entry of entries) {
          if (entry.isFile() && entry.name.toLowerCase() === lowerTarget) {
            return path.join(dir, entry.name);
          }
        }
      } catch (err) {
        console.error('[FileHandler] Case-insensitive search failed:', err.message);
      }
      return null;
    };

    // Absolute path: honor directly
    if (path.isAbsolute(cleaned) && fs.existsSync(cleaned)) {
      return cleaned;
    }
    // Absolute path but maybe大小写不一致
    if (path.isAbsolute(cleaned) && !fs.existsSync(cleaned)) {
      const absDir = path.dirname(cleaned);
      const absBase = path.basename(cleaned);
      const found = findCaseInsensitive(absDir, absBase);
      if (found) return found;
    }

    // Try direct path first
    const directPath = path.join(projectPath, cleaned);
    if (fs.existsSync(directPath)) {
      return directPath;
    }

    // Fallback: parent directory (e.g., /home/ccp/feicc/.. -> /home/ccp/feicc)
    const parentPath = path.resolve(projectPath, '..', cleaned);
    if (fs.existsSync(parentPath)) {
      return parentPath;
    }
    const parentFound = findCaseInsensitive(path.dirname(parentPath), path.basename(parentPath));
    if (parentFound) return parentFound;

    // Try searching in subdirectories (non-recursive for safety)
    try {
      const entries = fs.readdirSync(projectPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile() && entry.name === cleaned) {
          return path.join(projectPath, entry.name);
        }
        if (entry.isFile() && entry.name.toLowerCase() === cleaned.toLowerCase()) {
          return path.join(projectPath, entry.name);
        }
      }

      // Search one level deep
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const subPath = path.join(projectPath, entry.name, fileName);
          if (fs.existsSync(subPath)) {
            return subPath;
          }
          const ciSub = findCaseInsensitive(path.join(projectPath, entry.name), cleaned);
          if (ciSub) return ciSub;
        }
      }
    } catch (error) {
      console.error('[FileHandler] Error searching for file:', error.message);
    }

    return null;
  }

  /**
   * Convert markdown file to Feishu doc and send link
   */
  static async handleFileConvert(client, chatId, projectPath, fileName) {
    console.log('[FileHandler] Handling file convert:', fileName);

    const filePath = this.findFile(projectPath, fileName);
    if (!filePath) {
      throw new Error(`文件未找到: ${fileName}`);
    }

    console.log('[FileHandler] Found file at:', filePath);

    const content = fs.readFileSync(filePath, 'utf-8');
    const title = path.basename(filePath, path.extname(filePath));

    const doc = await client.createDocumentFromMarkdown(title, content);
    await client.sendDocumentLink(chatId, doc.document_id, title);

    console.log('[FileHandler] File converted and link sent:', fileName);
    return doc;
  }

  /**
   * Handle file send command
   * @param {Object} client - Feishu client instance
   * @param {string} chatId - Chat ID to send to
   * @param {string} projectPath - Project root path
   * @param {string} fileName - File name to send
   * @returns {Promise<Object>} - Result of file send operation
   */
  static async handleFileSend(client, chatId, projectPath, fileName) {
    console.log('[FileHandler] Handling file send:', fileName);

    // Find the file
    const filePath = this.findFile(projectPath, fileName);

    if (!filePath) {
      throw new Error(`文件未找到: ${fileName}`);
    }

    console.log('[FileHandler] Found file at:', filePath);

    // 去重：同一聊天、同一路径，10 秒内不重复发
    const key = `${chatId}:${filePath}`;
    const now = Date.now();
    const last = this.recentlySent.get(key);
    if (last && now - last < 10000) {
      console.log('[FileHandler] Skip duplicate send within 10s:', key);
      return { skipped: true };
    }

    // Send the file
    const result = await client.sendFile(chatId, filePath);

    this.recentlySent.set(key, now);
    setTimeout(() => this.recentlySent.delete(key), 10000);

    console.log('[FileHandler] File sent successfully:', fileName);
    return result;
  }
}
