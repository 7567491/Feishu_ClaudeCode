/**
 * 飞书文档读取器
 * 读取飞书文档内容并转换为Markdown格式
 */

class FeishuDocReader {
  constructor(feishuClient) {
    this.client = feishuClient.client;
    this.feishuClient = feishuClient;
  }

  /**
   * 读取文档全部内容并转换为Markdown
   */
  async readDocumentAsMarkdown(documentId) {
    try {
      console.log(`[DocReader] Reading document: ${documentId}`);

      // 1. 获取文档元信息
      const metadata = await this.getDocumentMetadata(documentId);

      // 2. 获取文档的所有块
      const blocks = await this.getAllDocumentBlocks(documentId);

      // 3. 获取文档内容块的子块
      const contentBlocks = await this.getDocumentContent(documentId, blocks);

      // 4. 转换块为Markdown
      const markdown = this.blocksToMarkdown(contentBlocks);

      console.log(`[DocReader] Successfully read document, ${contentBlocks.length} blocks converted`);

      return {
        content: markdown,
        revisionId: metadata.revision_id,
        lastModified: metadata.update_time,
        title: metadata.title
      };
    } catch (error) {
      console.error(`[DocReader] Failed to read document ${documentId}:`, error);
      throw error;
    }
  }

  /**
   * 获取文档元信息
   */
  async getDocumentMetadata(documentId) {
    try {
      const res = await this.client.docx.document.get({
        path: { document_id: documentId }
      });

      if (res.code !== 0) {
        throw new Error(`Failed to get document metadata: ${res.msg}`);
      }

      return {
        title: res.data?.document?.title || '',
        revision_id: res.data?.document?.revision_id || -1,
        create_time: res.data?.document?.create_time,
        update_time: res.data?.document?.update_time
      };
    } catch (error) {
      console.error('[DocReader] Failed to get metadata:', error);
      throw error;
    }
  }

  /**
   * 获取文档的所有块（顶层结构）
   */
  async getAllDocumentBlocks(documentId) {
    const allBlocks = [];
    let pageToken = undefined;
    let pageCount = 0;

    do {
      try {
        const res = await this.client.docx.documentBlock.list({
          path: { document_id: documentId },
          params: {
            document_revision_id: -1, // 获取最新版本
            page_size: 500,
            page_token: pageToken
          }
        });

        if (res.code !== 0) {
          throw new Error(`Failed to list blocks: ${res.msg}`);
        }

        const items = res.data?.items || [];
        allBlocks.push(...items);
        pageToken = res.data?.page_token;
        pageCount++;

        console.log(`[DocReader] Fetched page ${pageCount}, got ${items.length} blocks`);
      } catch (error) {
        console.error('[DocReader] Error fetching blocks:', error);
        throw error;
      }
    } while (pageToken);

    console.log(`[DocReader] Total blocks fetched: ${allBlocks.length}`);
    return allBlocks;
  }

  /**
   * 获取文档内容（获取body块的子块）
   */
  async getDocumentContent(documentId, topLevelBlocks) {
    // 找到body块（通常是page块的第一个子块）
    const pageBlock = topLevelBlocks.find(block => block.block_type === 1); // page
    if (!pageBlock) {
      console.warn('[DocReader] No page block found, using all blocks');
      return topLevelBlocks;
    }

    // 获取body块的子块（实际内容）
    const contentBlocks = [];
    let pageToken = undefined;

    do {
      try {
        const res = await this.client.docx.documentBlockChildren.list({
          path: {
            document_id: documentId,
            block_id: pageBlock.block_id
          },
          params: {
            document_revision_id: -1,
            page_size: 500,
            page_token: pageToken
          }
        });

        if (res.code !== 0) {
          console.error('[DocReader] Failed to get block children:', res.msg);
          break;
        }

        const items = res.data?.items || [];

        // 递归获取每个块的子块
        for (const item of items) {
          contentBlocks.push(item);

          // 如果有子块，递归获取
          if (item.has_children) {
            const children = await this.getBlockChildren(documentId, item.block_id);
            contentBlocks.push(...children);
          }
        }

        pageToken = res.data?.page_token;
      } catch (error) {
        console.error('[DocReader] Error getting block children:', error);
        break;
      }
    } while (pageToken);

    return contentBlocks;
  }

  /**
   * 递归获取块的子块
   */
  async getBlockChildren(documentId, blockId, depth = 0) {
    if (depth > 5) {
      console.warn('[DocReader] Max recursion depth reached');
      return [];
    }

    const children = [];

    try {
      const res = await this.client.docx.documentBlockChildren.list({
        path: {
          document_id: documentId,
          block_id: blockId
        },
        params: {
          document_revision_id: -1,
          page_size: 500
        }
      });

      if (res.code === 0 && res.data?.items) {
        for (const item of res.data.items) {
          children.push(item);

          if (item.has_children) {
            const subChildren = await this.getBlockChildren(
              documentId,
              item.block_id,
              depth + 1
            );
            children.push(...subChildren);
          }
        }
      }
    } catch (error) {
      console.error(`[DocReader] Error getting children for block ${blockId}:`, error);
    }

    return children;
  }

  /**
   * 将飞书块转换为Markdown
   */
  blocksToMarkdown(blocks) {
    let markdown = '';
    let listContext = { type: null, depth: 0 };

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const { content, newListContext } = this.blockToMarkdown(block, listContext);

      if (content) {
        // 处理列表的换行
        if (listContext.type && !newListContext.type) {
          markdown += '\n';
        }

        markdown += content;

        // 根据块类型添加适当的换行
        if (this.needsExtraNewline(block, blocks[i + 1])) {
          markdown += '\n';
        }

        markdown += '\n';
      }

      listContext = newListContext;
    }

    return markdown.trim();
  }

  /**
   * 单个块转换为Markdown
   */
  blockToMarkdown(block, listContext = { type: null, depth: 0 }) {
    const { block_type, block_id } = block;
    let content = '';
    let newListContext = { ...listContext };

    try {
      switch (block_type) {
        case 1: // page
          // 页面块，跳过
          break;

        case 2: // text
          content = this.parseTextBlock(block);
          newListContext = { type: null, depth: 0 };
          break;

        case 3: // heading1
          content = `# ${this.parseTextBlock(block)}`;
          newListContext = { type: null, depth: 0 };
          break;

        case 4: // heading2
          content = `## ${this.parseTextBlock(block)}`;
          newListContext = { type: null, depth: 0 };
          break;

        case 5: // heading3
          content = `### ${this.parseTextBlock(block)}`;
          newListContext = { type: null, depth: 0 };
          break;

        case 6: // heading4
          content = `#### ${this.parseTextBlock(block)}`;
          newListContext = { type: null, depth: 0 };
          break;

        case 7: // heading5
          content = `##### ${this.parseTextBlock(block)}`;
          newListContext = { type: null, depth: 0 };
          break;

        case 8: // heading6
          content = `###### ${this.parseTextBlock(block)}`;
          newListContext = { type: null, depth: 0 };
          break;

        case 12: // bullet
          const bulletIndent = '  '.repeat(block.indent || 0);
          content = `${bulletIndent}- ${this.parseTextBlock(block)}`;
          newListContext = { type: 'bullet', depth: block.indent || 0 };
          break;

        case 13: // ordered
          const orderedIndent = '  '.repeat(block.indent || 0);
          content = `${orderedIndent}1. ${this.parseTextBlock(block)}`;
          newListContext = { type: 'ordered', depth: block.indent || 0 };
          break;

        case 14: // code
          const codeBlock = block.code || {};
          const language = codeBlock.style?.language || '';
          const codeContent = this.parseTextElements(codeBlock.elements || []);
          content = '```' + language + '\n' + codeContent + '\n```';
          newListContext = { type: null, depth: 0 };
          break;

        case 15: // quote
          content = `> ${this.parseTextBlock(block)}`;
          newListContext = { type: null, depth: 0 };
          break;

        case 17: // todo
          const checked = block.todo?.style?.done ? 'x' : ' ';
          content = `- [${checked}] ${this.parseTextBlock(block)}`;
          newListContext = { type: 'todo', depth: block.indent || 0 };
          break;

        case 19: // divider
          content = '---';
          newListContext = { type: null, depth: 0 };
          break;

        case 27: // image
          const imageToken = block.image?.token;
          if (imageToken) {
            content = `![image](${imageToken})`;
          }
          newListContext = { type: null, depth: 0 };
          break;

        case 28: // table
          content = this.parseTableBlock(block);
          newListContext = { type: null, depth: 0 };
          break;

        default:
          console.warn(`[DocReader] Unknown block type: ${block_type} (block_id: ${block_id})`);
          // 尝试解析为普通文本
          const text = this.parseTextBlock(block);
          if (text) {
            content = text;
          }
      }
    } catch (error) {
      console.error(`[DocReader] Error parsing block ${block_id}:`, error);
    }

    return { content, newListContext };
  }

  /**
   * 解析文本块
   */
  parseTextBlock(block) {
    if (block.text) {
      return this.parseTextElements(block.text.elements || []);
    } else if (block.heading1) {
      return this.parseTextElements(block.heading1.elements || []);
    } else if (block.heading2) {
      return this.parseTextElements(block.heading2.elements || []);
    } else if (block.heading3) {
      return this.parseTextElements(block.heading3.elements || []);
    } else if (block.heading4) {
      return this.parseTextElements(block.heading4.elements || []);
    } else if (block.heading5) {
      return this.parseTextElements(block.heading5.elements || []);
    } else if (block.heading6) {
      return this.parseTextElements(block.heading6.elements || []);
    } else if (block.bullet) {
      return this.parseTextElements(block.bullet.elements || []);
    } else if (block.ordered) {
      return this.parseTextElements(block.ordered.elements || []);
    } else if (block.quote) {
      return this.parseTextElements(block.quote.elements || []);
    } else if (block.todo) {
      return this.parseTextElements(block.todo.elements || []);
    }
    return '';
  }

  /**
   * 解析文本元素（处理加粗、斜体等格式）
   */
  parseTextElements(elements) {
    if (!Array.isArray(elements)) {
      return '';
    }

    return elements.map(element => {
      if (!element) return '';

      // 处理文本运行
      if (element.text_run) {
        const content = element.text_run.content || '';
        const style = element.text_run.text_element_style || {};

        // 处理链接
        if (style.link) {
          return `[${content}](${style.link.url})`;
        }

        // 处理文本样式
        let styledContent = content;

        // 代码
        if (style.inline_code) {
          styledContent = `\`${content}\``;
        }
        // 加粗
        else if (style.bold) {
          styledContent = `**${content}**`;
        }
        // 斜体
        else if (style.italic) {
          styledContent = `*${content}*`;
        }
        // 删除线
        else if (style.strikethrough) {
          styledContent = `~~${content}~~`;
        }
        // 下划线（Markdown不直接支持，使用HTML）
        else if (style.underline) {
          styledContent = `<u>${content}</u>`;
        }

        return styledContent;
      }

      // 处理提及
      if (element.mention_user) {
        return `@${element.mention_user.user_id}`;
      }

      if (element.mention_doc) {
        const title = element.mention_doc.title || 'document';
        const token = element.mention_doc.token;
        return `[${title}](https://feishu.cn/docs/${token})`;
      }

      // 处理公式
      if (element.equation) {
        return `$${element.equation.content}$`;
      }

      // 默认返回空字符串
      return '';
    }).join('');
  }

  /**
   * 解析表格块
   */
  parseTableBlock(block) {
    if (!block.table || !block.table.cells) {
      return '';
    }

    const cells = block.table.cells;
    const rowCount = block.table.property?.row_size || 0;
    const colCount = block.table.property?.column_size || 0;

    if (rowCount === 0 || colCount === 0) {
      return '';
    }

    // 构建表格矩阵
    const table = Array.from({ length: rowCount }, () =>
      Array.from({ length: colCount }, () => '')
    );

    // 填充单元格内容
    for (const cell of cells) {
      const row = cell.row_index || 0;
      const col = cell.column_index || 0;
      if (row < rowCount && col < colCount) {
        table[row][col] = this.parseTextElements(cell.elements || []);
      }
    }

    // 转换为Markdown表格
    let markdown = '';

    // 表头
    markdown += '| ' + table[0].join(' | ') + ' |\n';

    // 分隔线
    markdown += '|' + table[0].map(() => ' --- ').join('|') + '|\n';

    // 数据行
    for (let i = 1; i < rowCount; i++) {
      markdown += '| ' + table[i].join(' | ') + ' |\n';
    }

    return markdown.trim();
  }

  /**
   * 判断是否需要额外换行
   */
  needsExtraNewline(currentBlock, nextBlock) {
    if (!nextBlock) return false;

    const blockTypesNeedingSpace = [3, 4, 5, 6, 7, 8, 14, 19, 28]; // 标题、代码块、分隔线、表格

    return blockTypesNeedingSpace.includes(currentBlock.block_type) ||
           blockTypesNeedingSpace.includes(nextBlock.block_type);
  }
}

export { FeishuDocReader };