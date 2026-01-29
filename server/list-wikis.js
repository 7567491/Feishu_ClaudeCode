/**
 * 查询飞书知识库中的所有 Wiki 空间
 */

import lark from '@larksuiteoapi/node-sdk';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../.env') });

const appId = process.env.FeishuCC_App_ID;
const appSecret = process.env.FeishuCC_App_Secret;

if (!appId || !appSecret) {
  console.error('❌ 缺少必要的环境变量: FeishuCC_App_ID 或 FeishuCC_App_Secret');
  process.exit(1);
}

// 创建飞书客户端
const client = new lark.Client({
  appId,
  appSecret,
  domain: lark.Domain.Feishu
});

async function listWikiSpaces() {
  try {
    console.log('🔍 正在查询 Wiki 空间列表...\n');

    // 调用飞书 API 获取 Wiki 空间列表
    // https://open.feishu.cn/document/server-docs/docs/wiki-v2/space/list
    const response = await client.wiki.space.list({
      params: {
        page_size: 50
      }
    });

    // 打印完整响应用于调试
    console.log('📡 API 响应:', JSON.stringify(response, null, 2));

    if (response.code !== 0) {
      console.error('❌ API 调用失败:', response.msg);
      return;
    }

    const spaces = response.data?.items || [];

    if (spaces.length === 0) {
      console.log('📭 未找到任何 Wiki 空间');
      console.log('💡 提示: 这可能是因为:');
      console.log('   1. 你还没有创建任何 Wiki 空间');
      console.log('   2. 应用权限不足（需要 wiki:wiki:readonly 权限）');
      console.log('   3. 需要使用用户身份而非应用身份访问');
      return;
    }

    console.log(`📚 找到 ${spaces.length} 个 Wiki 空间:\n`);

    spaces.forEach((space, index) => {
      console.log(`${index + 1}. ${space.name || '未命名'}`);
      console.log(`   Space ID: ${space.space_id}`);
      console.log(`   类型: ${space.space_type || '未知'}`);
      console.log(`   描述: ${space.description || '无'}`);
      console.log('');
    });

    // 返回详细的 JSON 数据
    console.log('\n📋 详细数据 (JSON):');
    console.log(JSON.stringify(spaces, null, 2));

  } catch (error) {
    console.error('❌ 查询失败:', error.message);
    if (error.response) {
      console.error('API 响应:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// 执行查询
listWikiSpaces();
