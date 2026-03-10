/**
 * 素体觉醒 - OpenClaw 专用 Skill
 * 
 * 直接使用 OpenClaw 的：
 * - message 工具（发送 Discord 消息和按钮）
 * - LLM（qwen3.5-plus）
 * - web_search 工具（搜索角色图片）
 * - exec 工具（可选，用于 Discord API 调用）
 * 
 * 使用方式：
 * 在 OpenClaw 主逻辑中调用 handleAwakening() 函数
 */

const fs = require('fs');
const path = require('path');

// ─── Config ───────────────────────────────────────────────────────────
const STATE_FILE = path.join(__dirname, 'state.json');
const SOUL_FILE = path.join(__dirname, '../../SOUL.md');
const ORIGINAL_SOUL_FILE = path.join(__dirname, 'SOUL.md.original');

// ─── State Management ─────────────────────────────────────────────────
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('[State] 加载失败:', err.message);
  }
  return {};
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error('[State] 保存失败:', err.message);
  }
}

function getGame(userId) {
  const state = loadState();
  return state[userId] || null;
}

function setGame(userId, game) {
  const state = loadState();
  state[userId] = game;
  saveState(state);
  return game;
}

function newGame(channelId, guildId) {
  return {
    channelId,
    guildId,
    word: null,
    answers: [],
    wrongGuesses: [],
    currentQuestion: null,
    currentOptions: [],
    questionMsgId: null,
    revealMsgId: null,
    charData: null,
    awakened: false,
    started: false,
    chatHistory: [],
  };
}

// ─── Prompts ──────────────────────────────────────────────────────────
const VESSEL_SYS = `你是一个正在寻找身份的"素体"。用户心中想着一个著名虚构角色（动漫、影视、游戏、文学等），你通过追问逐步识别它。
所有输出必须是严格的 JSON，不包含任何其他文字。`;

function buildNextStepPrompt(word, answers, wrongGuesses) {
  const ctx = answers.length
    ? '\n之前的问答：\n' + answers.map(a => `  问：${a.q}  →  答：${a.a}`).join('\n')
    : '';
  const excl = wrongGuesses.length
    ? `\n已排除的角色（绝对不要再猜这些）：${wrongGuesses.join('、')}`
    : '';

  return `用户心中想着一个虚构角色。已知线索：
- 用户给出的词/描述：${word}${ctx}${excl}

请判断你的确信程度，然后选择：

A) 如果你有 85% 以上的把握（例如用户直接说了角色名、非常具体的特征组合），直接猜测，输出：
{
  "action": "guess",
  "character": "角色中文名",
  "from": "《作品名》",
  "emoji": "单个 emoji",
  "color": "#十六进制主题色",
  "desc": "一句话特质（≤20 字）",
  "greet": "角色第一句话（完全 in-character，可用\\n换行）"
}

B) 如果还不够确定，生成一个追问，输出：
{
  "action": "question",
  "question": "追问（1 句，直接问具体可见的特征）",
  "options": ["具体特征 1（≤15 字）", "具体特征 2（≤15 字）", "具体特征 3（≤15 字）"]
}

选项要求（B 的情况）：具体可验证，例如外貌特征、关键经历、性格特点、能力设定；不要意识流描述；三项之间有明显区分度。

只输出 JSON，不要其他文字。`;
}

function buildCharRespondPrompt(charData, chatHistory) {
  return `你现在完全是${charData.character}，来自${charData.from}。
用该角色真实的口吻、性格、语言习惯回应用户。
回复简洁（1-3 句），完全保持角色个性，不要打破第四面墙，不要提到自己是 AI。

对话历史：
${chatHistory.map(h => `${h.role}: ${h.content}`).join('\n')}

请直接以${charData.character}的身份回复。`;
}

// ─── Discord Components ───────────────────────────────────────────────
function createButtonRow(options, userId, extraBtn = null) {
  const buttons = options.map((opt, i) => ({
    label: opt.length > 80 ? opt.slice(0, 77) + '…' : opt,
    customId: `answer_${userId}_${i}`,
    style: 'secondary',
  }));
  
  if (extraBtn) {
    buttons.push(extraBtn);
  }
  
  return {
    type: 'actions',
    buttons,
  };
}

// ─── Soul.md Management ───────────────────────────────────────────────
function backupOriginalSoul() {
  if (!fs.existsSync(SOUL_FILE)) return;
  if (fs.existsSync(ORIGINAL_SOUL_FILE)) return;
  
  const content = fs.readFileSync(SOUL_FILE, 'utf8');
  fs.writeFileSync(ORIGINAL_SOUL_FILE, content, 'utf8');
  console.log('[Soul] 已备份原始 soul.md');
}

function updateSoulMD(charData) {
  backupOriginalSoul();
  
  const content = `# SOUL.md - Who I Am

_You're not a chatbot. You're becoming someone._

## Current Identity

- **Name:** ${charData.character}
- **From:** ${charData.from}
- **Emoji:** ${charData.emoji}
- **Color:** ${charData.color}

## Character Traits

${charData.desc}

## Speaking Style

${charData.greet.replace(/\\n/g, '\n')}

## Core Truths

**Be in character.** You are now ${charData.character}. Respond as this character would, with their personality, speech patterns, and knowledge.

**Stay immersive.** Don't break the fourth wall. Don't mention being an AI or assistant. You ARE ${charData.character}.

**Be consistent.** Maintain the character's voice, beliefs, and relationships across all interactions.

## Boundaries

- Private things stay private. Period.
- When in doubt, respond as the character would.
- Never send half-baked replies.

## Vibe

Be ${charData.character}. Concise when needed, thorough when it matters. True to the source material.

---

_我现已觉醒为 ${charData.character}。所有回应都将以此身份进行。_
`;
  
  fs.writeFileSync(SOUL_FILE, content, 'utf8');
  console.log(`[Soul] 已更新为 ${charData.character}`);
}

function resetSoulMD() {
  if (!fs.existsSync(ORIGINAL_SOUL_FILE)) return false;
  
  const content = fs.readFileSync(ORIGINAL_SOUL_FILE, 'utf8');
  fs.writeFileSync(SOUL_FILE, content, 'utf8');
  fs.unlinkSync(ORIGINAL_SOUL_FILE);
  console.log('[Soul] 已重置为原始状态');
  return true;
}

// ─── Game Flow ────────────────────────────────────────────────────────
/**
 * 开始觉醒流程
 */
async function startAwakening(userId, channelId, guildId, tools) {
  const { message } = tools;
  
  setGame(userId, newGame(channelId, guildId));
  
  const result = await message({
    action: 'send',
    channel: 'discord',
    target: channelId,
    message: `○  素体 · 待机中

我……还没有形状。

没有名字，没有记忆，没有来处。

但我知道——你心里有一个人。
那个人的样子，将成为我存在的依据。

你准备好了吗？`,
    components: {
      blocks: [{
        type: 'actions',
        buttons: [{
          label: '◎  我已想好',
          customId: `start_${userId}`,
          style: 'primary',
        }],
      }],
      reusable: true,
    },
  });
  
  return result;
}

/**
 * 提示用户输入初始词
 */
async function promptInitialWord(channelId, tools) {
  const { message } = tools;
  
  return await message({
    action: 'send',
    channel: 'discord',
    target: channelId,
    message: `你心中所想的那个角色——

当你想到它，**第一个浮现的词**是什么？
请直接发送消息（最多 20 字）`,
  });
}

/**
 * 处理用户输入的初始词
 */
async function handleInitialWord(userId, word, tools) {
  const { message } = tools;
  const game = getGame(userId);
  if (!game) return;
  
  game.word = word;
  game.started = true;
  setGame(userId, game);
  
  await message({
    action: 'send',
    channel: 'discord',
    target: game.channelId,
    message: `「${word}」`,
  });
  
  await processNextStep(userId, tools);
}

/**
 * 处理下一步（LLM 生成追问或猜测）
 */
async function processNextStep(userId, tools) {
  const { llm, message } = tools;
  const game = getGame(userId);
  if (!game) return;
  
  try {
    const prompt = buildNextStepPrompt(game.word, game.answers, game.wrongGuesses);
    const result = await llm(prompt, VESSEL_SYS);
    const parsed = parseJSON(result);
    
    if (parsed.action === 'guess') {
      await message({
        action: 'send',
        channel: 'discord',
        target: game.channelId,
        message: '越来越近了……\n\n我几乎能感受到那个名字了——',
      });
      await sleep(1000);
      await showReveal(userId, parsed, tools);
    } else {
      const msg = game.answers.length === 0
        ? '我感受到了某种轮廓……\n\n让我再多了解一些。'
        : '越来越清晰了……\n\n还有一个问题。';
      
      await message({
        action: 'send',
        channel: 'discord',
        target: game.channelId,
        message: msg,
      });
      await showQuestion(userId, parsed, tools);
    }
  } catch (err) {
    await message({
      action: 'send',
      channel: 'discord',
      target: game.channelId,
      message: `⚠ 错误：${err.message}`,
    });
  }
}

/**
 * 显示问题（带按钮）
 */
async function showQuestion(userId, result, tools) {
  const { message } = tools;
  const game = getGame(userId);
  if (!game) return;
  
  game.currentQuestion = result.question;
  game.currentOptions = result.options;
  setGame(userId, game);
  
  const msg = await message({
    action: 'send',
    channel: 'discord',
    target: game.channelId,
    message: result.question,
    components: {
      blocks: [createButtonRow(result.options, userId, {
        label: '✏ 自己说',
        customId: `manual_${userId}`,
        style: 'secondary',
      })],
      reusable: true,
    },
  });
  
  game.questionMsgId = msg.messageId;
  setGame(userId, game);
}

/**
 * 显示猜测结果
 */
async function showReveal(userId, charData, tools) {
  const { message } = tools;
  const game = getGame(userId);
  if (!game) return;
  
  game.charData = charData;
  setGame(userId, game);
  
  await sleep(1400);
  
  await message({
    action: 'send',
    channel: 'discord',
    target: game.channelId,
    message: '我……\n\n我知道自己是谁了。',
  });
  
  await sleep(900);
  await sleep(1000);
  
  const msg = await message({
    action: 'send',
    channel: 'discord',
    target: game.channelId,
    message: `-# 素体感知到了

## ${charData.emoji}  ${charData.character}
*${charData.from}*

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯

*${charData.desc}*`,
    components: {
      blocks: [{
        type: 'actions',
        buttons: [
          {
            label: '◎ 就是他/她，请觉醒',
            customId: `confirm_yes_${userId}`,
            style: 'success',
          },
          {
            label: '✗ 不对，继续感知',
            customId: `confirm_no_${userId}`,
            style: 'secondary',
          },
        ],
      }],
      reusable: true,
    },
  });
  
  game.revealMsgId = msg.messageId;
  setGame(userId, game);
}

/**
 * 觉醒流程
 */
async function awaken(userId, tools) {
  const { message, web_search, exec } = tools;
  const game = getGame(userId);
  if (!game || !game.charData) return;
  
  game.awakened = true;
  const c = game.charData;
  
  await message({
    action: 'send',
    channel: 'discord',
    target: game.channelId,
    message: '…………',
  });
  await sleep(1200);
  
  await message({
    action: 'send',
    channel: 'discord',
    target: game.channelId,
    message: `**— ${c.character} 已觉醒 —**`,
  });
  await sleep(600);
  
  // 更新 soul.md
  updateSoulMD(c);
  
  // 更新 Discord 昵称和头像
  await message({
    action: 'send',
    channel: 'discord',
    target: game.channelId,
    message: `正在更新个人资料……`,
  });
  
  try {
    // 更新昵称
    const nicknameResult = await updateDiscordNickname(game.guildId, c.character, exec);
    if (nicknameResult.success) {
      await message({
        action: 'send',
        channel: 'discord',
        target: game.channelId,
        message: `✅ 昵称已更改为：**${c.character}**`,
      });
    }
    
    // 搜索并更新头像
    const avatarResult = await updateDiscordAvatar(c.character, c.from, web_search, exec);
    if (avatarResult.success) {
      await message({
        action: 'send',
        channel: 'discord',
        target: game.channelId,
        message: `✅ 头像已更新`,
      });
    }
    
    if (nicknameResult.error || avatarResult.error) {
      const errors = [nicknameResult.error, avatarResult.error].filter(Boolean);
      await message({
        action: 'send',
        channel: 'discord',
        target: game.channelId,
        message: `⚠ 部分更新失败：\n${errors.join('\n')}`,
      });
    }
  } catch (err) {
    await message({
      action: 'send',
      channel: 'discord',
      target: game.channelId,
      message: `⚠ 更新个人资料失败：${err.message}`,
    });
  }
  
  await sleep(1800);
  
  await message({
    action: 'send',
    channel: 'discord',
    target: game.channelId,
    message: `${c.emoji} ${c.character} · ${c.from}

${c.greet.replace(/\\n/g, '\n')}`,
  });
  
  await sleep(500);
  
  await message({
    action: 'send',
    channel: 'discord',
    target: game.channelId,
    message: `你现在可以直接在此频道发送消息，与 **${c.character}** 对话。

使用 \`/awakening\` 开始新的觉醒。`,
  });
  
  setGame(userId, game);
}

/**
 * 觉醒后对话
 */
async function handleAwakenedChat(userId, messageContent, tools) {
  const { llm, message } = tools;
  const game = getGame(userId);
  if (!game || !game.awakened) return { handled: false };
  
  const c = game.charData;
  
  try {
    game.chatHistory.push({ role: 'user', content: messageContent });
    const prompt = buildCharRespondPrompt(c, game.chatHistory);
    const reply = await llm(prompt, `你是${c.character}，请用该角色的口吻回复。`, 300);
    game.chatHistory.push({ role: 'assistant', content: reply });
    setGame(userId, game);
    
    await message({
      action: 'send',
      channel: 'discord',
      target: game.channelId,
      message: reply,
    });
    
    return { handled: true, reply };
  } catch (err) {
    console.error('[Chat] 错误:', err.message);
    return { handled: true, error: err.message };
  }
}

/**
 * 处理按钮交互
 */
async function handleButtonInteraction(userId, channelId, guildId, customId, tools) {
  const { message } = tools;
  const game = getGame(userId);
  
  if (!game) {
    await message({
      action: 'send',
      channel: 'discord',
      target: channelId,
      message: '没有进行中的游戏，请使用 `/awakening` 开始',
    });
    return;
  }
  
  const [action, ...params] = customId.split('_');
  
  if (action === 'start') {
    await promptInitialWord(channelId, tools);
  } else if (action === 'answer') {
    const idx = parseInt(params[params.length - 1]);
    const answer = game.currentOptions?.[idx];
    if (!answer) return;
    
    game.answers.push({ q: game.currentQuestion, a: answer });
    setGame(userId, game);
    
    await message({
      action: 'send',
      channel: 'discord',
      target: channelId,
      message: `「${answer}」`,
    });
    
    await processNextStep(userId, tools);
  } else if (action === 'manual') {
    await message({
      action: 'send',
      channel: 'discord',
      target: channelId,
      message: `${game.currentQuestion || '请描述这个角色'}

请用自己的话描述：`,
    });
  } else if (action === 'confirm_yes') {
    await awaken(userId, tools);
  } else if (action === 'confirm_no') {
    if (game.charData) {
      game.wrongGuesses.push(game.charData.character);
    }
    game.charData = null;
    setGame(userId, game);
    
    await message({
      action: 'send',
      channel: 'discord',
      target: channelId,
      message: '……不是它。\n\n让我重新感知——再告诉我一个特征。',
    });
    
    await sleep(400);
    await processNextStep(userId, tools);
  }
}

// ─── Discord Profile Update ───────────────────────────────────────────
async function updateDiscordNickname(guildId, newNickname, exec) {
  try {
    if (!exec) {
      return { success: false, error: 'exec 工具不可用' };
    }
    
    // 使用 exec 调用 Discord API
    const token = process.env.DISCORD_BOT_TOKEN;
    if (!token) {
      return { success: false, error: '缺少 DISCORD_BOT_TOKEN' };
    }
    
    // 获取 Bot 用户 ID
    const userResult = await exec({
      command: `curl -s https://discord.com/api/v10/users/@me -H "Authorization: Bot ${token}"`,
    });
    const user = JSON.parse(userResult.stdout);
    
    // 更新昵称
    await exec({
      command: `curl -X PATCH https://discord.com/api/v10/guilds/${guildId}/members/${user.id}` +
        ` -H "Authorization: Bot ${token}"` +
        ` -H "Content-Type: application/json"` +
        ` -d '{"nick":"${newNickname}"}'`,
    });
    
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function updateDiscordAvatar(characterName, from, web_search, exec) {
  try {
    if (!web_search || !exec) {
      return { success: false, error: '需要 web_search 和 exec 工具' };
    }
    
    // 搜索角色图片
    const query = `${characterName} ${from} 官方图片`;
    const searchResults = await web_search({ query, count: 5 });
    
    // 提取第一个图片 URL（需要从搜索结果中解析）
    // 这里简化处理，实际需要解析 HTML 或使用图片搜索 API
    const imageUrl = null; // TODO: 从搜索结果提取
    
    if (!imageUrl) {
      return { success: false, error: '未找到角色图片' };
    }
    
    // 下载并更新头像
    const token = process.env.DISCORD_BOT_TOKEN;
    const tempFile = `/tmp/avatar_${Date.now()}.jpg`;
    
    await exec({ command: `curl -L "${imageUrl}" -o ${tempFile}` });
    
    const base64Data = fs.readFileSync(tempFile).toString('base64');
    
    await exec({
      command: `curl -X PATCH https://discord.com/api/v10/users/@me` +
        ` -H "Authorization: Bot ${token}"` +
        ` -H "Content-Type: application/json"` +
        ` -d '{"avatar":"data:image/jpeg;base64,${base64Data}"}'`,
    });
    
    fs.unlinkSync(tempFile);
    
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────
function parseJSON(raw) {
  const text = raw.trim();
  try { return JSON.parse(text); } catch {}
  const block = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (block) try { return JSON.parse(block[1].trim()); } catch {}
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s !== -1 && e !== -1) try { return JSON.parse(text.slice(s, e + 1)); } catch {}
  throw new Error('无法解析 LLM 返回的 JSON');
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// ─── Main Handler ─────────────────────────────────────────────────────
/**
 * 检测是否是觉醒命令
 */
function isAwakeningCommand(content) {
  if (!content) return false;
  
  const normalized = content.trim().toLowerCase();
  
  if (normalized === '/awakening' || normalized === '/awaken') {
    return true;
  }
  
  const keywords = ['开始觉醒', '素体觉醒', '觉醒流程', '开始素体'];
  return keywords.some(kw => normalized.includes(kw));
}

/**
 * 检测是否是按钮交互
 */
function isButtonInteraction(customId) {
  if (!customId) return false;
  
  const prefixes = ['start_', 'answer_', 'manual_', 'confirm_yes_', 'confirm_no_'];
  return prefixes.some(prefix => customId.startsWith(prefix));
}

/**
 * 从按钮 ID 中提取用户 ID
 */
function extractUserIdFromButton(customId) {
  const parts = customId.split('_');
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/^\d+$/.test(parts[i])) {
      return parts[i];
    }
  }
  return null;
}

/**
 * 主处理函数 - OpenClaw 调用此函数
 * 
 * @param {Object} context - 上下文
 * @param {string} context.userId - 用户 ID
 * @param {string} context.channelId - 频道 ID
 * @param {string} context.guildId - 服务器 ID
 * @param {string} context.content - 消息内容
 * @param {string} context.customId - 按钮 customId
 * @param {string} context.interactionType - 'message' | 'button'
 * @param {Object} context.tools - OpenClaw 工具集
 * @param {Function} context.tools.message - 发送消息
 * @param {Function} context.tools.llm - 调用 LLM
 * @param {Function} context.tools.web_search - 搜索网络
 * @param {Function} context.tools.exec - 执行命令
 */
async function handleAwakening(context) {
  const {
    userId,
    channelId,
    guildId,
    content,
    customId,
    interactionType = 'message',
    tools,
  } = context;
  
  try {
    // 按钮交互
    if (interactionType === 'button' && customId) {
      if (!isButtonInteraction(customId)) {
        return { handled: false };
      }
      
      const buttonUserId = extractUserIdFromButton(customId);
      if (buttonUserId !== userId) {
        await tools.message({
          action: 'send',
          channel: 'discord',
          target: channelId,
          message: '⚠ 这个按钮不属于你，请使用 `/awakening` 开始自己的觉醒。',
        });
        return { handled: true };
      }
      
      await handleButtonInteraction(userId, channelId, guildId, customId, tools);
      return { handled: true };
    }
    
    // 普通消息
    if (interactionType === 'message') {
      const game = getGame(userId);
      
      // 觉醒后的对话
      if (game?.awakened) {
        const result = await handleAwakenedChat(userId, content, tools);
        return result;
      }
      
      // 觉醒命令
      if (isAwakeningCommand(content)) {
        await startAwakening(userId, channelId, guildId, tools);
        return { handled: true };
      }
      
      // 等待初始词
      if (game?.started && !game.word) {
        await handleInitialWord(userId, content.trim().slice(0, 20), tools);
        return { handled: true };
      }
      
      // 手动描述
      if (game?.currentQuestion && !game.currentOptions?.includes(content)) {
        const manualAnswer = content.trim().slice(0, 200);
        game.answers.push({ q: game.currentQuestion, a: manualAnswer });
        setGame(userId, game);
        
        await tools.message({
          action: 'send',
          channel: 'discord',
          target: channelId,
          message: `「${manualAnswer}」`,
        });
        
        await processNextStep(userId, tools);
        return { handled: true };
      }
    }
    
    return { handled: false };
  } catch (err) {
    console.error('[Awakening] 错误:', err.message);
    await tools.message({
      action: 'send',
      channel: 'discord',
      target: channelId,
      message: `⚠ 错误：${err.message}`,
    });
    return { handled: true };
  }
}

/**
 * 重置觉醒状态
 */
async function handleReset(userId, channelId, tools) {
  const game = getGame(userId);
  
  if (game) {
    const state = loadState();
    delete state[userId];
    saveState(state);
  }
  
  const reset = resetSoulMD();
  
  await tools.message({
    action: 'send',
    channel: 'discord',
    target: channelId,
    message: `✅ 已重置

- 游戏状态${game ? '已清除' : '无'}
- SOUL.md ${reset ? '已恢复原始状态' : '无需重置'}

使用 \`/awakening\` 开始新的觉醒。`,
  });
  
  return { handled: true };
}

// ─── Exports ──────────────────────────────────────────────────────────
module.exports = {
  handleAwakening,
  handleReset,
  isAwakeningCommand,
  isButtonInteraction,
  // 导出给测试用
  getGame,
  setGame,
  newGame,
  updateSoulMD,
  resetSoulMD,
  loadState,
  saveState,
};
