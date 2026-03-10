/**
 * 头像获取策略 - 三优先级方案
 * 
 * 1. 外部图片搜索
 * 2. Neta 角色查询
 * 3. Discord CDN 默认头像（降级）
 */

const https = require('https');
const { exec } = require('child_process');
const path = require('path');

const NETA_DIR = path.join(__dirname, '../neta');

/**
 * 测试图片 URL 是否可用
 */
function testImageUrl(url) {
  return new Promise((resolve) => {
    https.get(url, { timeout: 10000 }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        testImageUrl(res.headers.location).then(resolve).catch(() => resolve({ success: false }));
        return;
      }
      
      if (res.statusCode !== 200) {
        resolve({ success: false, status: res.statusCode, url });
        return;
      }
      
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const sizeKB = (buffer.length / 1024).toFixed(2);
        const contentType = res.headers['content-type'];
        const isValidImage = contentType && contentType.startsWith('image/');
        
        resolve({
          success: isValidImage && buffer.length > 100,
          size: sizeKB,
          contentType,
          url,
          finalUrl: res.headers.location || url,
        });
      });
    }).on('error', () => {
      resolve({ success: false, url });
    });
  });
}

/**
 * 下载图片
 */
async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 10000 }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        downloadImage(res.headers.location).then(resolve).catch(reject);
        return;
      }
      
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

/**
 * 优先级 1: 外部图片搜索
 */
async function searchExternalImages(characterName) {
  console.log('🔍 [优先级 1] 外部图片搜索...');
  
  // Discord CDN 头像（最稳定）
  const discordAvatars = [
    'https://cdn.discordapp.com/embed/avatars/0.png',
    'https://cdn.discordapp.com/embed/avatars/1.png',
    'https://cdn.discordapp.com/embed/avatars/2.png',
    'https://cdn.discordapp.com/embed/avatars/3.png',
    'https://cdn.discordapp.com/embed/avatars/4.png',
    'https://cdn.discordapp.com/embed/avatars/5.png',
  ];
  
  for (const url of discordAvatars) {
    const result = await testImageUrl(url);
    if (result.success) {
      console.log(`  ✅ 找到可用头像：${url}`);
      return { success: true, url, source: 'discord_cdn' };
    }
  }
  
  console.log('  ❌ 未找到可用外部图片');
  return { success: false };
}

/**
 * 优先级 2: Neta 角色查询
 */
async function getCharacterFromNeta(characterName) {
  console.log('\n🔍 [优先级 2] Neta 角色查询...');
  console.log(`  角色名：${characterName}`);
  
  return new Promise((resolve, reject) => {
    const cmd = `cd ${NETA_DIR} && pnpm start request_character_or_elementum --name "${characterName}" --parent_type "character"`;
    
    exec(cmd, { timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        console.log(`  ❌ 执行失败：${error.message}`);
        reject(error);
        return;
      }
      
      try {
        const output = stdout.trim();
        
        // 移除 npm/pnpm 输出，只保留 JSON
        const jsonStart = output.indexOf('{');
        const jsonEnd = output.lastIndexOf('}');
        
        if (jsonStart === -1 || jsonEnd === -1) {
          throw new Error('未找到 JSON 输出');
        }
        
        const jsonStr = output.substring(jsonStart, jsonEnd + 1);
        const result = JSON.parse(jsonStr);
        
        if (result.error) {
          console.log(`  ❌ Neta 错误：${result.error.message}`);
          resolve({ success: false, error: result.error.message });
          return;
        }
        
        if (result && result.detail) {
          const character = result.detail;
          console.log(`  ✅ 找到角色：${character.name}`);
          console.log(`  头像 URL: ${character.avatar_img || '无'}`);
          
          resolve({
            success: true,
            character: character,
            avatarUrl: character.avatar_img,
            source: 'neta',
          });
        } else {
          resolve({ success: false, error: '未找到角色' });
        }
      } catch (e) {
        console.log(`  ❌ 解析失败：${e.message}`);
        resolve({ success: false, error: e.message });
      }
    });
  });
}

/**
 * 优先级 3: Discord CDN 降级
 */
function getDiscordFallbackAvatar(characterColor) {
  console.log('\n🔍 [优先级 3] Discord CDN 降级方案...');
  
  // 根据角色主题色选择最接近的 Discord 头像
  const colorMap = {
    '#0056b3': 'https://cdn.discordapp.com/embed/avatars/5.png',  // 蓝色/紫色
    '#000000': 'https://cdn.discordapp.com/embed/avatars/0.png',  // 黑色
    '#ff0000': 'https://cdn.discordapp.com/embed/avatars/2.png',  // 红色
    '#ffa500': 'https://cdn.discordapp.com/embed/avatars/3.png',  // 橙色
    '#ffff00': 'https://cdn.discordapp.com/embed/avatars/4.png',  // 黄色
    '#008000': 'https://cdn.discordapp.com/embed/avatars/1.png',  // 绿色
  };
  
  const fallbackUrl = colorMap[characterColor] || 'https://cdn.discordapp.com/embed/avatars/5.png';
  
  console.log(`  选择头像：${fallbackUrl}`);
  console.log(`  匹配主题色：${characterColor || '默认'}`);
  
  return {
    success: true,
    url: fallbackUrl,
    source: 'discord_cdn_fallback',
  };
}

/**
 * 完整头像获取流程
 * 
 * @param {string} characterName - 角色名称
 * @param {string} characterColor - 角色主题色（可选）
 * @returns {Promise<{success: boolean, url?: string, source?: string}>}
 */
async function getAvatarForCharacter(characterName, characterColor) {
  console.log('='.repeat(60));
  console.log('🎨 头像获取 - 三优先级策略');
  console.log('='.repeat(60));
  console.log(`角色：${characterName}`);
  console.log(`主题色：${characterColor || '未指定'}`);
  console.log('');
  
  // 优先级 1: 外部搜索
  const external = await searchExternalImages(characterName);
  if (external.success) {
    console.log('');
    console.log('✅ 使用外部搜索头像');
    return external;
  }
  
  // 优先级 2: Neta 查询
  const neta = await getCharacterFromNeta(characterName);
  if (neta.success && neta.avatarUrl) {
    console.log('');
    console.log('✅ 使用 Neta 角色头像');
    return neta;
  }
  
  // 优先级 3: Discord CDN 降级
  const fallback = getDiscordFallbackAvatar(characterColor);
  console.log('');
  console.log('✅ 使用 Discord CDN 降级头像');
  return fallback;
}

module.exports = {
  getAvatarForCharacter,
  getCharacterFromNeta,
  searchExternalImages,
  downloadImage,
  testImageUrl,
};
