/**
 * 使用 Neta API 搜索角色头像
 * 
 * ⭐ 这是 awakening skill 获取角色头像的主要方式！
 * 
 * 搜索流程：
 * 1. 调用 neta-skills 的 search_character_or_elementum 命令
 * 2. 从搜索结果中获取角色头像 URL
 * 3. 返回给 awakening skill 使用
 * 
 * 优先级：
 * 1. Neta API 角色查询（主要方式）
 * 2. 预定义图片库（备选）
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// ─── Config ───────────────────────────────────────────────────────────
let NETA_TOKEN = process.env.NETA_TOKEN;

// 如果环境变量没有，尝试从 .env 文件加载
if (!NETA_TOKEN) {
  try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const match = envContent.match(/^NETA_TOKEN=(.+)$/m);
      if (match) {
        NETA_TOKEN = match[1].trim();
        console.log('[Neta] 从 .env 加载 token');
      }
    }
  } catch (err) {
    console.warn('[Neta] 无法从 .env 加载 token:', err.message);
  }
}

// neta-skills 的路径
const NETA_SKILLS_PATH = path.join(__dirname, '../../neta-skills/skills/neta');

// ─── Neta Search Helper ───────────────────────────────────────────────
/**
 * 调用 neta-skills 命令行工具搜索角色
 * 
 * @param {string} characterName - 角色名称
 * @param {string} from - 作品名称
 * @returns {Promise<Object|null>} 角色信息（包含头像 URL）
 */
async function searchCharacter(characterName, from) {
  if (!NETA_TOKEN) {
    console.warn('[Neta] ❌ 缺少 NETA_TOKEN，无法搜索角色');
    console.warn('[Neta] 请在 .env 中配置 NETA_TOKEN');
    return null;
  }

  try {
    console.log(`[Neta] 🔍 搜索角色：${characterName} (${from})`);
    console.log(`[Neta] 📂 neta-skills 路径：${NETA_SKILLS_PATH}`);
    
    // 清理角色名和作品名
    const cleanName = characterName.replace(/[《》\[\]()]/g, '').trim();
    
    // 构建搜索关键词（尝试多个变体）
    const keywordsList = [
      cleanName,
      characterName,
      // 如果有作品名，也尝试组合搜索
      from ? `${cleanName} ${from}`.replace(/[《》]/g, '') : null,
    ].filter(Boolean);
    
    // 尝试不同的关键词
    for (const keywords of keywordsList) {
      try {
        console.log(`[Neta] 尝试关键词：${keywords}`);
        
        // 调用 neta-skills 的 search_character_or_elementum 命令
        const command = `node bin/cli.js search_character_or_elementum --keywords "${keywords}" --parent_type "character" --sort_scheme "best"`;
        
        const result = execSync(command, {
          cwd: NETA_SKILLS_PATH,
          encoding: 'utf8',
          env: { ...process.env, NETA_TOKEN },
        });
        
        const parsed = JSON.parse(result);
        
        console.log(`[Neta] 搜索结果：total=${parsed.total}`);
        
        if (parsed.total > 0 && parsed.list && parsed.list.length > 0) {
          // 找到匹配的角色
          // 尝试精确匹配角色名
          let char = parsed.list.find(c => 
            c.name === cleanName || c.name === characterName
          );
          
          // 如果没有精确匹配，使用第一个结果
          if (!char) {
            char = parsed.list[0];
          }
          
          console.log(`[Neta] ✅ 找到角色：${char.name}`);
          console.log(`[Neta] 🖼️ 头像 URL: ${char.avatar_img}`);
          
          return {
            name: char.name,
            uuid: char.uuid,
            avatar: char.avatar_img,
            from: from || 'Unknown',
          };
        }
      } catch (err) {
        console.warn(`[Neta] 关键词 "${keywords}" 搜索失败:`, err.message);
        continue;
      }
    }
    
    console.log('[Neta] ❌ 所有关键词都未找到匹配角色');
    return null;
  } catch (err) {
    console.error('[Neta] ❌ 搜索失败:', err.message);
    console.error('[Neta] 请检查：');
    console.error('[Neta]   1. NETA_TOKEN 是否正确');
    console.error('[Neta]   2. neta-skills 路径是否正确');
    console.error('[Neta]   3. neta-skills 是否已安装依赖 (pnpm i)');
    return null;
  }
}

/**
 * 获取角色详情（通过 UUID）
 * @param {string} uuid - 角色 UUID
 * @returns {Promise<Object|null>} 角色详情
 */
async function getCharacterByUUID(uuid) {
  if (!NETA_TOKEN) {
    return null;
  }

  try {
    const command = `node bin/cli.js request_character_or_elementum --uuid "${uuid}"`;
    
    const result = execSync(command, {
      cwd: NETA_SKILLS_PATH,
      encoding: 'utf8',
      env: { ...process.env, NETA_TOKEN },
    });
    
    const parsed = JSON.parse(result);
    
    if (parsed.detail) {
      return {
        name: parsed.detail.name,
        uuid: parsed.detail.uuid,
        avatar: parsed.detail.avatar_img,
        from: parsed.detail.occupation || 'Unknown',
        description: parsed.detail.description,
      };
    }
    
    return null;
  } catch (err) {
    console.error('[Neta] 获取详情失败:', err.message);
    return null;
  }
}

// ─── Exports ──────────────────────────────────────────────────────────
module.exports = {
  searchCharacter,
  getCharacterByUUID,
};
