/**
 * Awakening Skill 启动脚本
 * 
 * 此脚本负责：
 * 1. 检查并安装依赖
 * 2. 验证环境配置
 * 3. 启动 bot.js 进程
 * 4. 处理进程崩溃重启
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const SKILL_DIR = __dirname;
const BOT_SCRIPT = path.join(SKILL_DIR, 'bot.js');
const ENV_FILE = path.join(SKILL_DIR, '.env');
const STATE_FILE = path.join(SKILL_DIR, 'state.json');

console.log('🌱 Awakening Skill 启动中...\n');

// 检查 .env 文件
if (!fs.existsSync(ENV_FILE)) {
  console.error('❌ 缺少 .env 文件');
  console.error('   请复制 .env.example 并填入配置：');
  console.error(`   cp ${path.join(SKILL_DIR, '.env.example')} ${ENV_FILE}`);
  process.exit(1);
}

// 检查必要环境变量
const envContent = fs.readFileSync(ENV_FILE, 'utf8');
const hasToken = envContent.includes('DISCORD_TOKEN=') && !envContent.match(/DISCORD_TOKEN=\s*$/m);
const hasClientId = envContent.includes('DISCORD_CLIENT_ID=') && !envContent.match(/DISCORD_CLIENT_ID=\s*$/m);

if (!hasToken || !hasClientId) {
  console.error('❌ .env 配置不完整');
  console.error('   需要设置：DISCORD_TOKEN 和 DISCORD_CLIENT_ID');
  process.exit(1);
}

// 检查 node_modules
const nodeModules = path.join(SKILL_DIR, 'node_modules');
if (!fs.existsSync(nodeModules)) {
  console.log('📦 首次运行，安装依赖...');
  const npm = spawn('npm', ['install'], {
    cwd: SKILL_DIR,
    stdio: 'inherit',
  });
  
  npm.on('close', (code) => {
    if (code !== 0) {
      console.error('❌ 依赖安装失败');
      process.exit(1);
    }
    console.log('✅ 依赖安装完成\n');
    startBot();
  });
} else {
  startBot();
}

function startBot() {
  console.log('🤖 启动 Discord Bot...\n');
  
  let botProcess = null;
  let restartDelay = 1000; // 重启延迟（毫秒）
  const maxRestartDelay = 30000; // 最大延迟 30 秒

  function spawnBot() {
    botProcess = spawn('node', [BOT_SCRIPT], {
      cwd: SKILL_DIR,
      env: { ...process.env },
      stdio: 'inherit',
    });

    botProcess.on('error', (err) => {
      console.error('❌ Bot 进程启动失败:', err.message);
    });

    botProcess.on('exit', (code, signal) => {
      console.log(`\n⚠️  Bot 进程退出 (code: ${code}, signal: ${signal})`);
      
      if (code !== 0) {
        console.log(`🔄 ${restartDelay / 1000}秒后重启...`);
        setTimeout(() => {
          restartDelay = Math.min(restartDelay * 1.5, maxRestartDelay);
          spawnBot();
        }, restartDelay);
      }
    });
  }

  // 优雅关闭
  process.on('SIGINT', () => {
    console.log('\n👋 正在关闭 Bot...');
    if (botProcess) {
      botProcess.kill('SIGTERM');
    }
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n👋 收到终止信号，关闭 Bot...');
    if (botProcess) {
      botProcess.kill('SIGTERM');
    }
    process.exit(0);
  });

  spawnBot();
}
