/**
 * FileSender - 统一文件发送器
 *
 * 功能：
 * - 支持单文件、多文件、目录、glob 模式
 * - 自动识别文件格式
 * - 进度报告和错误处理
 * - 速率限制
 */

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

// 支持的文件格式
const SUPPORTED_FORMATS = {
  document: ['.pdf', '.md', '.doc', '.docx', '.txt'],
  spreadsheet: ['.xls', '.xlsx', '.csv'],
  presentation: ['.ppt', '.pptx'],
  image: ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.bmp'],
  audio: ['.mp3', '.wav', '.m4a', '.aac', '.flac'],
  video: ['.mp4', '.avi', '.mov', '.mkv', '.wmv'],
  archive: ['.zip', '.rar', '.7z', '.tar', '.gz']
};

// 扁平化所有支持的扩展名
const ALL_SUPPORTED_EXTENSIONS = Object.values(SUPPORTED_FORMATS).flat();

export class FileSender {
  /**
   * @param {Object} feishuClient - FeishuClient 实例
   */
  constructor(feishuClient) {
    this.client = feishuClient;
  }

  /**
   * 发送文件到飞书
   * @param {string} pattern - 文件路径、glob 模式或目录
   * @param {string} chatId - 飞书 chat_id 或 open_id
   * @param {Object} options - 选项
   * @param {number} options.delay - 发送间隔（毫秒），默认 1000
   * @param {boolean} options.recursive - 是否递归目录，默认 true
   * @param {Function} options.onProgress - 进度回调 (current, total, file)
   * @returns {Promise<{total: number, success: number, failed: number, files: Array}>}
   */
  async send(pattern, chatId, options = {}) {
    // 验证 chat_id
    if (!chatId || typeof chatId !== 'string' || chatId.trim() === '') {
      throw new Error('无效的 chat_id');
    }

    // 默认选项
    const {
      delay = 1000,
      recursive = true,
      onProgress = null
    } = options;

    // 解析文件列表
    const files = await this._resolveFiles(pattern, recursive);

    // 验证文件
    const validFiles = files.filter(file => {
      try {
        this._validateFile(file);
        return true;
      } catch (error) {
        console.warn(`⚠️  跳过文件 ${path.basename(file)}: ${error.message}`);
        return false;
      }
    });

    if (validFiles.length === 0) {
      throw new Error('没有有效的文件可发送');
    }

    // 批量发送
    const result = await this._sendFiles(validFiles, chatId, { delay, onProgress });

    return result;
  }

  /**
   * 解析文件模式为文件列表
   * @private
   */
  async _resolveFiles(pattern, recursive = true) {
    const resolvedPattern = path.resolve(pattern);

    // 检查是否为目录
    if (fs.existsSync(resolvedPattern) && fs.statSync(resolvedPattern).isDirectory()) {
      return this._resolveDirectory(resolvedPattern, recursive);
    }

    // 检查是否为单个文件
    if (fs.existsSync(resolvedPattern) && fs.statSync(resolvedPattern).isFile()) {
      return [resolvedPattern];
    }

    // 使用 glob 模式匹配
    const files = await glob(pattern, {
      absolute: true,
      nodir: true,
      windowsPathsNoEscape: true
    });

    if (files.length === 0) {
      throw new Error(`未找到匹配的文件: ${pattern}`);
    }

    // 只返回支持的文件格式
    return files.filter(file => this._isSupportedFormat(file));
  }

  /**
   * 解析目录中的文件
   * @private
   */
  _resolveDirectory(dirPath, recursive = true) {
    const files = [];

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isFile() && this._isSupportedFormat(entry.name)) {
        files.push(fullPath);
      } else if (entry.isDirectory() && recursive) {
        files.push(...this._resolveDirectory(fullPath, recursive));
      }
    }

    return files;
  }

  /**
   * 验证单个文件
   * @private
   */
  _validateFile(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error('文件不存在');
    }

    if (!fs.statSync(filePath).isFile()) {
      throw new Error('不是有效的文件');
    }

    if (!this._isSupportedFormat(filePath)) {
      throw new Error('不支持的文件格式');
    }

    return true;
  }

  /**
   * 检查文件格式是否支持
   * @private
   */
  _isSupportedFormat(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return ALL_SUPPORTED_EXTENSIONS.includes(ext);
  }

  /**
   * 检查是否为图片格式
   * @private
   */
  _isImage(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return SUPPORTED_FORMATS.image.includes(ext);
  }

  /**
   * 检查是否为文档格式
   * @private
   */
  _isDocument(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return SUPPORTED_FORMATS.document.includes(ext);
  }

  /**
   * 检查文件大小
   * @private
   */
  _checkFileSize(filePath, maxSize = Infinity) {
    const stats = fs.statSync(filePath);
    return stats.size <= maxSize;
  }

  /**
   * 批量发送文件
   * @private
   */
  async _sendFiles(files, chatId, { delay, onProgress }) {
    let success = 0;
    let failed = 0;
    const results = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileName = path.basename(file);

      try {
        // 根据文件类型选择发送方法
        if (this._isImage(file)) {
          await this.client.sendImage(chatId, file);
        } else {
          await this.client.sendFile(chatId, file);
        }

        success++;
        results.push({ file, success: true });

        if (onProgress) {
          onProgress(i + 1, files.length, file);
        }

        // 延迟（除了最后一个文件）
        if (i < files.length - 1 && delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }

      } catch (error) {
        failed++;
        results.push({ file, success: false, error: error.message });
      }
    }

    return {
      total: files.length,
      success,
      failed,
      files: results
    };
  }

  /**
   * 格式化文件大小
   * @private
   */
  _formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  /**
   * 获取支持的文件格式列表
   * @static
   */
  static getSupportedFormats() {
    return SUPPORTED_FORMATS;
  }

  /**
   * 获取所有支持的扩展名
   * @static
   */
  static getAllSupportedExtensions() {
    return ALL_SUPPORTED_EXTENSIONS;
  }
}
