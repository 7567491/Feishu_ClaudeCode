/**
 * PaperParser - 论文表格解析器
 * 从 Markdown 表格中提取论文信息
 */

export class PaperParser {
  /**
   * 解析包含论文表格的文本
   * @param {string} text - 包含 Markdown 表格的文本
   * @returns {Array<object>} 论文列表
   */
  parse(text) {
    if (!text || typeof text !== 'string') {
      return [];
    }

    const lines = text.split('\n');
    const papers = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // 跳过空行
      if (!trimmed) {
        continue;
      }

      // 跳过非表格行
      if (!trimmed.startsWith('|')) {
        continue;
      }

      // 跳过表头（包含关键词：作者、年份、Author、Year 等）
      if (this._isHeaderRow(trimmed)) {
        continue;
      }

      // 跳过分隔线（只包含 -、|、: 和空格）
      if (/^[\s\-|:]+$/.test(trimmed)) {
        continue;
      }

      // 解析数据行
      const cells = trimmed.split('|')
        .map(c => c.trim())
        .filter(Boolean);

      // 至少需要 6 列才是有效数据
      if (cells.length >= 6) {
        const paper = {
          author: cells[0],
          year: cells[1],
          title: cells[2],
          citations: this._parseCitations(cells[3]),
          journal: cells[4],
          titleCn: cells[5]
        };

        papers.push(paper);
      }
    }

    return papers;
  }

  /**
   * 判断是否为表头行
   * @private
   */
  _isHeaderRow(row) {
    const headerKeywords = [
      '作者', 'Author', 'author',
      '年份', 'Year', 'year',
      '标题', 'Title', 'title',
      '引用', 'Citation', 'Cite',
      '期刊', 'Journal', 'journal',
      '中文', 'CN', 'Chinese'
    ];

    return headerKeywords.some(keyword => row.includes(keyword));
  }

  /**
   * 解析引用次数（转换为整数）
   * @private
   */
  _parseCitations(value) {
    const parsed = parseInt(value);
    return isNaN(parsed) ? 0 : parsed;
  }
}
