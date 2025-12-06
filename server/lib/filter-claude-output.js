/**
 * Claude 输出智能过滤器
 *
 * 目的：过滤掉不应该显示给飞书用户的系统输出、调试信息、JSON结构等
 * 只保留真正的用户友好内容
 */

export class ClaudeOutputFilter {
  constructor() {
    // 系统输出特征模式（应该被完全过滤）
    this.systemPatterns = [
      /^\[[\w\-]+\]/,                         // [ModuleName] 前缀，如 [FeishuClient]
      /^\s*console\./,                         // console.log/error 语句
      /^\s*at\s+[\w.]+\s+\(/,                 // 错误堆栈（但不包括 Error: 开头）
      /^(async\s+)?function\s+\w+/,           // 函数定义开头
      /^(const|let|var|import|export)\s+/,    // 代码声明
      /^\s*\/\//,                              // 单行注释
      /^\s*\/\*/,                              // 多行注释开头
      /^\s*\*\s+/,                             // JSDoc 注释
      /^{[\s\S]*:\s*[\s\S]*}$/m,              // 完整的JSON对象（单行）
    ];

    // 代码块特征（用于检测整段代码）
    this.codeIndicators = [
      /^\s*[\{\}]/,                      // 大括号开头（函数体、对象）
      /^\s*(if|for|while|switch|try|catch)\s*\(/,  // 控制流
      /^\s*(async\s+)?function\s+/,     // 函数
      /[;{}]\s*$/,                       // 分号或大括号结尾
      /^\s*(const|let|var)\s+\w+\s*=/,  // 变量声明
      /=>\s*{/,                          // 箭头函数
      /^\s*return\s+/,                   // return 语句
    ];

    // 错误消息映射（技术错误 → 用户友好提示）
    this.errorMap = {
      'ENOENT': '文件未找到',
      'EACCES': '权限不足',
      'ECONNREFUSED': '连接失败',
      'ETIMEDOUT': '请求超时',
      'Claude CLI exited with code 1': '处理失败，请稍后重试',
      'Claude CLI exited with code': '操作未能完成',
      'Claude CLI was terminated by signal SIGINT': '操作已中断',
      'Failed to': '操作失败',
      'Cannot read properties of': '数据处理错误',
      'Unexpected token': '格式解析错误',
    };

    // 日志统计
    this.stats = {
      totalFiltered: 0,
      codeBlocksFiltered: 0,
      systemOutputFiltered: 0,
      errorsBeautified: 0,
    };
  }

  /**
   * 检测文本是否为系统输出（应该被过滤）
   * @param {string} text
   * @returns {boolean}
   */
  isSystemOutput(text) {
    if (!text || !text.trim()) return false;

    const trimmed = text.trim();

    // 检测系统模式
    for (const pattern of this.systemPatterns) {
      if (pattern.test(trimmed)) {
        return true;
      }
    }

    // 检测整行JSON（不含自然语言）
    if (this.looksLikeJSON(trimmed)) {
      return true;
    }

    return false;
  }

  /**
   * 检测是否看起来像JSON
   * @param {string} text
   * @returns {boolean}
   */
  looksLikeJSON(text) {
    // 必须以 { 或 [ 开头
    if (!/^\s*[{\[]/.test(text)) return false;

    // 尝试解析
    try {
      JSON.parse(text);
      return true;
    } catch {
      // 可能是不完整的JSON片段
      // 检测JSON特征：包含多个冒号和引号
      const colonCount = (text.match(/:/g) || []).length;
      const quoteCount = (text.match(/["']/g) || []).length;
      return colonCount >= 2 && quoteCount >= 4;
    }
  }

  /**
   * 检测是否为代码块
   * @param {string} text
   * @returns {boolean}
   */
  isCodeBlock(text) {
    const lines = text.split('\n').filter(l => l.trim());

    // 至少3行才可能是代码块
    if (lines.length < 3) return false;

    // 统计符合代码特征的行数
    let codeLineCount = 0;
    let totalNonEmpty = 0;

    for (const line of lines) {
      if (!line.trim()) continue;
      totalNonEmpty++;

      // 检查是否符合任何代码特征
      if (this.codeIndicators.some(pattern => pattern.test(line))) {
        codeLineCount++;
      }
    }

    // 如果超过40%的行看起来像代码，判定为代码块
    const codeRatio = codeLineCount / Math.max(totalNonEmpty, 1);
    return codeRatio > 0.4;
  }

  /**
   * 美化错误消息
   * @param {string} text
   * @returns {string|null} 返回美化后的消息，如果不是错误则返回null
   */
  beautifyError(text) {
    for (const [technical, friendly] of Object.entries(this.errorMap)) {
      if (text.includes(technical)) {
        this.stats.errorsBeautified++;
        return `⚠️ ${friendly}`;
      }
    }
    return null;
  }

  /**
   * 主过滤方法
   * @param {string} text - 原始输出文本
   * @returns {string} 过滤后的文本（可能为空）
   */
  filter(text) {
    // 空文本直接返回
    if (!text || !text.trim()) return '';

    const trimmed = text.trim();

    // 1. 先检测错误消息并美化（优先级最高）
    const beautified = this.beautifyError(trimmed);
    if (beautified) {
      console.log('[Filter] 💅 美化错误:', beautified);
      return beautified;
    }

    // 2. 检测多行代码块（先于系统输出检测）
    if (this.isCodeBlock(trimmed)) {
      console.log('[Filter] 📦 检测到代码块，折叠处理');
      this.stats.codeBlocksFiltered++;
      this.stats.totalFiltered++;
      return '📄 代码建议已生成（内容较长已折叠）\n';
    }

    // 3. 检测系统输出
    if (this.isSystemOutput(trimmed)) {
      console.log('[Filter] 🗑️  过滤系统输出:', trimmed.substring(0, 80));
      this.stats.systemOutputFiltered++;
      this.stats.totalFiltered++;
      return '';
    }

    // 4. 过滤明显的代码片段（单行或少量行）
    const lines = trimmed.split('\n');
    if (lines.length <= 5) {
      // 检查每一行是否都是代码
      const allCode = lines.every(line =>
        !line.trim() || this.codeIndicators.some(p => p.test(line))
      );

      if (allCode && lines.length >= 2) {
        console.log('[Filter] 🔧 过滤代码片段:', lines[0].substring(0, 50));
        this.stats.totalFiltered++;
        return '';
      }
    }

    // 5. 正常文本，保留
    return text;
  }

  /**
   * 批量过滤（用于处理多行输出）
   * @param {string[]} lines
   * @returns {string[]}
   */
  filterLines(lines) {
    const result = [];
    let currentBlock = [];

    for (const line of lines) {
      currentBlock.push(line);

      // 每累积5行检查一次是否为代码块
      if (currentBlock.length >= 5) {
        const blockText = currentBlock.join('\n');
        const filtered = this.filter(blockText);

        if (filtered) {
          result.push(filtered);
        }

        currentBlock = [];
      }
    }

    // 处理剩余的行
    if (currentBlock.length > 0) {
      const blockText = currentBlock.join('\n');
      const filtered = this.filter(blockText);

      if (filtered) {
        result.push(filtered);
      }
    }

    return result;
  }

  /**
   * 获取过滤统计信息
   * @returns {Object}
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      totalFiltered: 0,
      codeBlocksFiltered: 0,
      systemOutputFiltered: 0,
      errorsBeautified: 0,
    };
  }
}

// 导出单例
export const outputFilter = new ClaudeOutputFilter();
