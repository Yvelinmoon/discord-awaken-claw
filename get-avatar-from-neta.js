/**
 * 从 Neta 获取角色头像
 * 
 * 用法：
 * const { getCharacterFromNeta } = require('./get-avatar-from-neta');
 * 
 * const character = await getCharacterFromNeta('角色名');
 * if (character && character.avatar_img) {
 *   // 使用 Neta 头像
 * } else {
 *   // 降级到 Discord CDN
 * }
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// ─── Config ───────────────────────────────────────────────────────────
const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const discordTokenMatch = envContent.match(/DISCORD_TOKEN=(.+)/);
const DISCORD_TOKEN = discordTokenMatch ? discordTokenMatch[1].trim() : '';
const GUILD_ID = '1090688813115899965';
const BOT_ID = '1478656768002490420';

// Neta 配置
const NETA_DIR = path.join(__dirname, '../neta');
const NETA_ENV = path.join(NETA_DIR, '.env.local');

// ─── Discord API ──────────────────────────────────────────────────────
function apiCall(endpoint, method = 'GET', body = null) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'discord.com',
      path: `/api/v10${endpoint}`,
      method,
      headers: {
        'Authorization': `Bot ${DISCORD_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    
    req.on('error', (err) => {
      resolve({ status: 0, data: { message: err.message } });
    });
    
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

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

async function updateAvatar(imageUrl) {
  console.log('🖼️ 更新头像...');
  console.log(`  来源：${imageUrl}`);
  
  try {
    const imageBuffer = await downloadImage(imageUrl);
    console.log(`  下载成功：${(imageBuffer.length / 1024).toFixed(2)} KB`);
    
    const base64Data = imageBuffer.toString('base64');
    const avatarData = `data:image/png;base64,${base64Data}`;
    
    console.log('  上传到 Discord...');
    const result = await apiCall('/users/@me', 'PATCH', { avatar: avatarData });
    
    if (result.status === 200) {
      console.log('  ✅ 头像更新成功!');
      console.log(`  新头像 ID: ${result.data.avatar}`);
      return { success: true, avatarId: result.data.avatar };
    } else {
      console.log(`  ❌ 失败：${result.data.message || result.status}`);
      return { success: false, error: result.data.message };
    }
  } catch (err) {
    console.log(`  ❌ 错误：${err.message}`);
    return { success: false, error: err.message };
  }
}

async function updateNickname(nickname) {
  console.log('\n📛 更新昵称...');
  console.log(`  目标：${nickname}`);
  
  const result = await apiCall(`/guilds/${GUILD_ID}/members/@me`, 'PATCH', { nick: nickname });
  
  if (result.status === 200) {
    console.log('  ✅ 昵称更新成功!');
    console.log(`  新昵称：${result.data.nick || nickname}`);
    return { success: true, nick: result.data.nick || nickname };
  } else {
    console.log(`  ❌ 失败：${result.data.message || result.status}`);
    return { success: false, error: result.data.message };
  }
}

// ─── Neta Integration ─────────────────────────────────────────────────
/**
 * 从 Neta 获取角色信息
 */
async function getCharacterFromNeta(characterName) {
  console.log('\n🔍 从 Neta 搜索角色...');
  console.log(`  角色名：${characterName}`);
  
  return new Promise((resolve, reject) => {
    // 检查 Neta 环境
    if (!fs.existsSync(NETA_ENV)) {
      reject(new Error('Neta .env.local 文件不存在'));
      return;
    }
    
    // 执行 Neta 命令
    const cmd = `cd ${NETA_DIR} && pnpm start request_character_or_elementum --name "${characterName}" --parent_type "character"`;
    
    console.log(`  执行：${cmd}`);
    
    exec(cmd, { timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        console.log(`  ❌ 执行失败：${error.message}`);
        reject(error);
        return;
      }
      
      try {
        // 解析输出
        const output = stdout.trim();
        console.log('  Neta 响应:', output.substring(0, 500));
        
        // 尝试解析 JSON
        let result;
        try {
          result = JSON.parse(output);
        } catch (e) {
          // 如果不是 JSON，尝试从输出中提取
          const jsonMatch = output.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            result = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('无法解析 Neta 响应');
          }
        }
        
        if (result && result.detail) {
          const character = result.detail;
          console.log(`  ✅ 找到角色：${character.name}`);
          console.log(`  头像 URL: ${character.avatar_img || '无'}`);
          resolve(character);
        } else {
          reject(new Error('未找到角色'));
        }
      } catch (e) {
        console.log(`  ❌ 解析失败：${e.message}`);
        reject(e);
      }
    });
  });
}

// ─── Main Flow ────────────────────────────────────────────────────────
async function main() {
  console.log('='.repeat(60));
  console.log('🎭 觉醒技能 - 从 Neta 获取角色头像');
  console.log('='.repeat(60));
  console.log('');
  
  // 测试角色（Saber）
  const characterName = '阿尔托莉雅';
  
  try {
    // 1. 从 Neta 获取角色信息
    const character = await getCharacterFromNeta(characterName);
    
    if (!character.avatar_img) {
      console.log('\n⚠️  Neta 未提供头像 URL，使用降级方案');
      // 降级到 Discord CDN
      await updateAvatar('https://cdn.discordapp.com/embed/avatars/5.png');
      return;
    }
    
    // 2. 更新头像
    console.log('');
    console.log('='.repeat(60));
    await updateAvatar(character.avatar_img);
    
    // 3. 更新昵称
    console.log('');
    console.log('='.repeat(60));
    if (character.name) {
      await updateNickname(character.name);
    }
    
    console.log('');
    console.log('='.repeat(60));
    console.log('🎉 完成！');
    console.log('='.repeat(60));
    
  } catch (err) {
    console.log('');
    console.log('='.repeat(60));
    console.log('❌ Neta 获取失败，使用降级方案');
    console.log('='.repeat(60));
    console.log(`错误：${err.message}`);
    console.log('');
    
    // 降级方案：使用 Discord CDN
    console.log('使用 Discord CDN 紫色头像（Saber 主题色）');
    await updateAvatar('https://cdn.discordapp.com/embed/avatars/5.png');
  }
}

main().catch(console.error);
