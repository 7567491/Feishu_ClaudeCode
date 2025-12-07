/**
 * PaperParser 单元测试
 */

import { describe, it } from 'node:test';
import assert from 'assert';
import { PaperParser } from '../lib/parser.js';

describe('PaperParser', () => {
  const parser = new PaperParser();

  describe('parse()', () => {
    it('应该正确解析标准 Markdown 表格', () => {
      const input = `
# 文献综述

这是一段综述内容...

| 作者 | 年份 | 论文名称 | 引用次数 | 期刊 | 中文翻译 |
|------|------|----------|----------|------|----------|
| Smith et al. | 2020 | Deep Learning Advances | 1234 | Nature | 深度学习进展 |
| Wang et al. | 2021 | Neural Networks | 567 | Science | 神经网络研究 |

更多内容...
`;

      const result = parser.parse(input);

      assert.strictEqual(result.length, 2);
      assert.deepStrictEqual(result[0], {
        author: 'Smith et al.',
        year: '2020',
        title: 'Deep Learning Advances',
        citations: 1234,
        journal: 'Nature',
        titleCn: '深度学习进展'
      });
      assert.deepStrictEqual(result[1], {
        author: 'Wang et al.',
        year: '2021',
        title: 'Neural Networks',
        citations: 567,
        journal: 'Science',
        titleCn: '神经网络研究'
      });
    });

    it('应该跳过表头和分隔线', () => {
      const input = `
| 作者 | 年份 | 标题 | 引用 | 期刊 | 中文 |
|:-----|:----:|-----:|------|------|------|
| Author | Year | Title | Cite | Journal | CN |
|------|------|-------|------|---------|-----|
| Smith | 2020 | Paper | 100 | Nature | 论文 |
`;

      const result = parser.parse(input);

      // 应该只解析最后一行有效数据
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].author, 'Smith');
    });

    it('应该跳过列数不足的行', () => {
      const input = `
| 作者 | 年份 | 标题 |
|------|------|------|
| Smith | 2020 | Paper |
| Wang et al. | 2021 | Deep Learning | 500 | Nature | 深度学习 |
`;

      const result = parser.parse(input);

      // 第一行数据列数不足（只有 3 列），应该被跳过
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].author, 'Wang et al.');
    });

    it('应该处理空输入', () => {
      const result = parser.parse('');
      assert.strictEqual(result.length, 0);
    });

    it('应该处理没有表格的文本', () => {
      const input = `
这是一段没有表格的文本。
只有普通段落。
没有管道符号。
`;

      const result = parser.parse(input);
      assert.strictEqual(result.length, 0);
    });

    it('应该正确解析引用次数为整数', () => {
      const input = `
| 作者 | 年份 | 标题 | 引用 | 期刊 | 中文 |
|------|------|------|------|------|------|
| Smith | 2020 | Paper | 1500 | Nature | 论文 |
| Wang | 2021 | Study | N/A | Science | 研究 |
`;

      const result = parser.parse(input);

      assert.strictEqual(result[0].citations, 1500);
      assert.strictEqual(result[1].citations, 0); // N/A 应该被转换为 0
    });

    it('应该去除单元格首尾空白', () => {
      const input = `
| 作者 | 年份 | 标题 | 引用 | 期刊 | 中文 |
|------|------|------|------|------|------|
|  Smith  |  2020  |  Paper  |  100  |  Nature  |  论文  |
`;

      const result = parser.parse(input);

      assert.strictEqual(result[0].author, 'Smith');
      assert.strictEqual(result[0].year, '2020');
      assert.strictEqual(result[0].title, 'Paper');
    });
  });
});
