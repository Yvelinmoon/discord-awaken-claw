/**
 * OpenClaw LLM 请求监听器
 * 
 * 这是一个辅助脚本，用于：
 * 1. 监听 .llm-requests/ 目录中的请求文件
 * 2. 调用 OpenClaw sessions_spawn 处理请求
 * 3. 将响应写入 .llm-responses/
 * 
 * 使用方式：
 * node llm-listener.js
 * 
 * 或者集成到 OpenClaw 主 agent 中
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REQUEST_DIR = path.join(__dirname, '.llm-requests');
const RESPONSE_DIR = path.join(__dirname, '.llm-responses');

// 确保目录存在
if (!fs.existsSync(REQUEST_DIR)) fs.mkdirSync(REQUEST_DIR);
if (!fs.existsSync(RESPONSE_DIR)) fs.mkdirSync(RESPONSE_DIR);

console.log('🎧 LLM 监听器已启动');
console.log(`   监听目录：${REQUEST_DIR}`);
console.log(`   响应目录：${RESPONSE_DIR}`);
console.log('   按 Ctrl+C 停止\n');

// 已处理的请求 ID（避免重复处理）
const processedRequests = new Set();

// 主循环
async function main() {
  while (true) {
    try {
      await processRequests();
    } catch (err) {
      console.error('[Listener Error]:', err.message);
    }
    await sleep(1000); // 每秒检查一次
  }
}

async function processRequests() {
  const files = fs.readdirSync(REQUEST_DIR);
  
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    
    const requestId = file.replace('.json', '');
    if (processedRequests.has(requestId)) continue;
    
    const requestPath = path.join(REQUEST_DIR, file);
    
    try {
      const request = JSON.parse(fs.readFileSync(requestPath, 'utf8'));
      console.log(`\n📩 新请求：${requestId}`);
      console.log(`   提示：${request.prompt.slice(0, 50)}...`);
      
      // 调用 OpenClaw LLM
      const response = await callOpenClawLLM(request);
      
      // 写入响应
      const responsePath = path.join(RESPONSE_DIR, `${requestId}.json`);
      fs.writeFileSync(responsePath, JSON.stringify(response, null, 2), 'utf8');
      console.log(`✅ 响应已写入：${requestId}`);
      
      processedRequests.add(requestId);
    } catch (err) {
      console.error(`❌ 处理请求失败：${requestId}`);
      console.error(`   错误：${err.message}`);
      
      // 写入错误响应
      const responsePath = path.join(RESPONSE_DIR, `${requestId}.json`);
      fs.writeFileSync(responsePath, JSON.stringify({
        id: requestId,
        error: err.message,
        createdAt: Date.now(),
      }, null, 2), 'utf8');
      
      processedRequests.add(requestId);
    }
  }
}

async function callOpenClawLLM(request) {
  // 使用 sessions_spawn 创建子代理
  const task = buildTask(request);
  
  console.log(`   创建子代理任务...`);
  
  try {
    // 调用 OpenClaw sessions_spawn
    // 注意：这需要在 OpenClaw 环境中运行
    const result = await spawnSubagent(task);
    
    return {
      id: request.id,
      content: result,
      createdAt: Date.now(),
    };
  } catch (err) {
    throw new Error(`子代理调用失败：${err.message}`);
  }
}

function buildTask(request) {
  return `请作为 LLM 助手回答以下问题。

系统提示：
${request.systemPrompt}

用户问题：
${request.prompt}

请直接输出回答内容，不要包含额外说明。`;
}

async function spawnSubagent(task) {
  // 方案 A: 使用 OpenClaw sessions_spawn API
  // 这需要在 OpenClaw 环境中运行
  
  // 由于这是独立脚本，我们使用 openclaw 命令行工具
  // 或者通过 HTTP API 调用
  
  // 临时实现：使用 openclaw 命令行
  // 实际部署时应该使用 sessions_spawn API
  
  try {
    // 尝试使用 openclaw 命令行工具
    const result = execSync(`openclaw sessions spawn --task "${escapeShell(task)}" --runtime subagent --mode run --timeout 30`, {
      encoding: 'utf8',
      timeout: 35000,
    });
    
    // 解析结果（需要根据实际输出格式调整）
    return parseSpawnResult(result);
  } catch (err) {
    // 如果 openclaw 命令不可用，尝试其他方案
    console.warn('   openclaw 命令不可用，尝试备选方案...');
    
    // 备选方案：直接调用 LLM API
    // 这需要配置 OPENCLAW_API_URL
    if (process.env.OPENCLAW_API_URL) {
      return await callViaHttp(task);
    }
    
    throw new Error('无法调用 OpenClaw LLM - 请配置 OPENCLAW_API_URL 或确保 openclaw 命令可用');
  }
}

function parseSpawnResult(output) {
  // 解析 openclaw sessions spawn 的输出
  // 这需要根据实际输出格式调整
  try {
    const json = JSON.parse(output);
    return json.response || json.content || json.message || output;
  } catch {
    return output;
  }
}

async function callViaHttp(task) {
  const https = require('https');
  
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      prompt: task,
      maxTokens: 600,
    });
    
    const url = new URL('/api/chat', process.env.OPENCLAW_API_URL);
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(json.error || `HTTP ${res.statusCode}`));
          } else {
            resolve(json.response || json.content || json.message);
          }
        } catch (e) {
          reject(new Error('响应解析失败'));
        }
      });
    });
    
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function escapeShell(str) {
  return str.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// 启动监听器
main().catch(err => {
  console.error('监听器启动失败:', err.message);
  process.exit(1);
});
