/**
 * 测试论文表格解析功能
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// 临时实现，稍后移到 paper-command-handler.js
function parseTable(text) {
  const lines = text.split('\n');
  const papers = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // 跳过空行、表头和分隔线
    if (!trimmed ||
        trimmed.includes('作者') ||
        trimmed.includes('Author') ||
        /^[\s\-|:]+$/.test(trimmed)) {
      continue;
    }

    // Markdown 表格：| 作者 | 年份 | 标题 | ...
    if (trimmed.startsWith('|')) {
      const cells = trimmed.split('|')
        .map(c => c.trim())
        .filter(Boolean);

      if (cells.length >= 6) {
        papers.push({
          author: cells[0],
          year: cells[1],
          title: cells[2],
          citations: parseInt(cells[3]) || 0,
          journal: cells[4],
          titleCn: cells[5]
        });
      }
    }
  }

  return papers;
}

describe('论文表格解析测试', () => {
  it('应该解析标准 Markdown 表格', () => {
    const input = `
| 作者 | 年份 | 论文名称 | 引用次数 | 发表期刊 | 论文名中文翻译 |
|------|------|----------|----------|----------|----------------|
| LeCun Y. | 2015 | Deep Learning | 45000 | Nature | 深度学习 |
| Goodfellow I. | 2014 | Generative Adversarial Nets | 38000 | NeurIPS | 生成对抗网络 |
| Vaswani A. | 2017 | Attention Is All You Need | 52000 | NeurIPS | 注意力机制就是你所需要的 |
    `.trim();

    const papers = parseTable(input);

    assert.strictEqual(papers.length, 3);
    assert.strictEqual(papers[0].author, 'LeCun Y.');
    assert.strictEqual(papers[0].year, '2015');
    assert.strictEqual(papers[0].title, 'Deep Learning');
    assert.strictEqual(papers[0].citations, 45000);
    assert.strictEqual(papers[0].journal, 'Nature');
    assert.strictEqual(papers[0].titleCn, '深度学习');
  });

  it('应该处理不规则的空格', () => {
    const input = `
|   作者  |  年份  |  论文名称  |  引用次数  |  发表期刊  |  论文名中文翻译  |
|---------|--------|-----------|-----------|-----------|-----------------|
|  Hinton G.  |  2006  |  A fast learning algorithm  |  15000  |  Science  |  快速学习算法  |
    `.trim();

    const papers = parseTable(input);

    assert.strictEqual(papers.length, 1);
    assert.strictEqual(papers[0].author, 'Hinton G.');
    assert.strictEqual(papers[0].year, '2006');
  });

  it('应该跳过表头行', () => {
    const input = `
| 作者 | 年份 | 论文名称 | 引用次数 | 发表期刊 | 论文名中文翻译 |
|------|------|----------|----------|----------|----------------|
| Bengio Y. | 2013 | Representation Learning | 20000 | IEEE | 表示学习 |
    `.trim();

    const papers = parseTable(input);

    assert.strictEqual(papers.length, 1);
    assert.strictEqual(papers[0].author, 'Bengio Y.');
  });

  it('应该处理空输入', () => {
    const papers = parseTable('');
    assert.strictEqual(papers.length, 0);
  });

  it('应该处理没有表格的文本', () => {
    const input = '这是一段没有表格的文字';
    const papers = parseTable(input);
    assert.strictEqual(papers.length, 0);
  });

  it('应该处理引用次数为非数字的情况', () => {
    const input = `
| 作者 | 年份 | 论文名称 | 引用次数 | 发表期刊 | 论文名中文翻译 |
|------|------|----------|----------|----------|----------------|
| Smith J. | 2020 | New Method | N/A | PNAS | 新方法 |
    `.trim();

    const papers = parseTable(input);

    assert.strictEqual(papers.length, 1);
    assert.strictEqual(papers[0].citations, 0); // 应该转换为 0
  });
});

// 运行测试
describe.only = describe;
