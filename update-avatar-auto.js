/**
 * 自动搜索并更新 Saber 头像
 */
const https = require('https');
const fs = require('fs');

const envContent = fs.readFileSync(__dirname + '/.env', 'utf8');
const tokenMatch = envContent.match(/DISCORD_TOKEN=(.+)/);
const TOKEN = tokenMatch ? tokenMatch[1].trim() : '';

function apiCall(endpoint, method, body) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'discord.com',
      path: `/api/v10${endpoint}`,
      method,
      headers: {
        'Authorization': `Bot ${TOKEN}`,
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

async function main() {
  console.log('='.repeat(60));
  console.log('🎨 自动搜索并更新 Saber 头像');
  console.log('='.repeat(60));
  console.log('');
  
  // 可靠的图片源
  const avatarUrls = [
    'https://cdn.discordapp.com/embed/avatars/0.png',  // 蓝色
    'https://cdn.discordapp.com/embed/avatars/1.png',  // 绿色
    'https://cdn.discordapp.com/embed/avatars/2.png',  // 红色
    'https://cdn.discordapp.com/embed/avatars/3.png',  // 橙色
    'https://cdn.discordapp.com/embed/avatars/4.png',  // 黄色
    'https://cdn.discordapp.com/embed/avatars/5.png',  // 紫色（Saber 主题色）
  ];
  
  console.log('🔍 测试头像源...\n');
  
  let bestUrl = null;
  for (const url of avatarUrls) {
    const result = await testImageUrl(url);
    const shortUrl = url.replace('https://cdn.discordapp.com/embed/', 'CDN/');
    
    if (result.success) {
      console.log(`✅ ${shortUrl} - ${result.size} KB`);
      if (!bestUrl) bestUrl = url;
    } else {
      console.log(`❌ ${shortUrl}`);
    }
  }
  
  if (!bestUrl) {
    console.log('\n❌ 未找到可用头像');
    return;
  }
  
  console.log('');
  console.log('='.repeat(60));
  console.log('下载并上传头像...');
  console.log('='.repeat(60));
  console.log('');
  
  try {
    console.log('下载图片:', bestUrl);
    const imageBuffer = await downloadImage(bestUrl);
    console.log(`✅ 下载成功：${(imageBuffer.length / 1024).toFixed(2)} KB`);
    
    const base64Data = imageBuffer.toString('base64');
    const avatarData = `data:image/png;base64,${base64Data}`;
    console.log(`Base64 长度：${base64Data.length} 字符`);
    
    console.log('');
    console.log('上传到 Discord...');
    const result = await apiCall('/users/@me', 'PATCH', { avatar: avatarData });
    
    if (result.status === 200) {
      console.log('✅ 头像更新成功!');
      console.log(`新头像 ID: ${result.data.avatar}`);
      console.log('');
      console.log('='.repeat(60));
      console.log('🎉 完成！');
      console.log(`使用头像：${bestUrl}`);
      console.log('='.repeat(60));
    } else {
      console.log('❌ 失败:', result.data.message || result.status);
    }
  } catch (err) {
    console.log('❌ 错误:', err.message);
  }
}

main().catch(console.error);
