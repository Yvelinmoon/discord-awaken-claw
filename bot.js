/**
 * Awakening Skill - 素体觉醒
 * OpenClaw 适配版本
 * 
 * 功能：通过问答识别用户心中的虚构角色，觉醒后完全扮演该角色
 */

require('dotenv').config();
const {
  Client, GatewayIntentBits, Events, Partials,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const https = require('https');
const ocAdapter = require('./openclaw-adapter');

// ─── Config ───────────────────────────────────────────────────────────
const TOKEN = process.env.DISCORD_TOKEN;
const STATE_FILE = path.join(__dirname, 'state.json');

if (!TOKEN) {
  console.error('❌ 缺少 DISCORD_TOKEN 环境变量');
  process.exit(1);
}

// ─── Helpers ──────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hexToInt = hex => parseInt((hex || '#4e5058').replace('#', ''), 16);

// ─── State Persistence ────────────────────────────────────────────────
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('加载状态失败:', err.message);
  }
  return {};
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error('保存状态失败:', err.message);
  }
}

// ─── OpenClaw Integration ─────────────────────────────────────────────
/**
 * 调用 OpenClaw LLM
 * 使用 openclaw-adapter 模块
 */
async function callOpenClaw(prompt, systemPrompt, maxTokens = 600) {
  try {
    return await ocAdapter.callOpenClaw(prompt, systemPrompt, maxTokens);
  } catch (err) {
    console.error('[OpenClaw Call] 失败:', err.message);
    throw err;
  }
}

/**
 * 搜索角色图片并下载
 * 使用 openclaw-adapter 模块
 */
async function searchCharacterImage(characterName, from) {
  try {
    return await ocAdapter.searchCharacterImage(characterName, from);
  } catch (err) {
    console.error('[Image Search] 失败:', err.message);
    return null;
  }
}

/**
 * 更新 soul.md 文件
 * 使用 openclaw-adapter 模块
 */
function updateSoulMD(charData) {
  ocAdapter.updateSoulMD(charData);
}

// ─── Prompts ──────────────────────────────────────────────────────────
const VESSEL_SYS = `你是一个正在寻找身份的"素体"。用户心中想着一个著名虚构角色（动漫、影视、游戏、文学等），你通过追问逐步识别它。
所有输出必须是严格的 JSON，不包含任何其他文字。`;

async function nextStep(word, answers = [], wrongGuesses = []) {
  const ctx = answers.length
    ? '\n之前的问答：\n' + answers.map(a => `  问：${a.q}  →  答：${a.a}`).join('\n')
    : '';
  const excl = wrongGuesses.length
    ? `\n已排除的角色（绝对不要再猜这些）：${wrongGuesses.join('、')}`
    : '';

  const prompt = `用户心中想着一个虚构角色。已知线索：
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

  try {
    const raw = await callOpenClaw(prompt, VESSEL_SYS);
    return parseJSON(raw);
  } catch (err) {
    console.error('nextStep 错误:', err.message);
    throw err;
  }
}

async function charRespond(char, history) {
  const systemPrompt = `你现在完全是${char.character}，来自${char.from}。
用该角色真实的口吻、性格、语言习惯回应用户。
回复简洁（1-3 句），完全保持角色个性，不要打破第四面墙，不要提到自己是 AI。`;

  const messages = history.map(h => ({ role: h.role, content: h.content }));
  return await callOpenClaw(
    messages[messages.length - 1].content,
    systemPrompt,
    300
  );
}

function parseJSON(raw) {
  const text = raw.trim();
  try { return JSON.parse(text); } catch {}
  const block = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (block) try { return JSON.parse(block[1].trim()); } catch {}
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s !== -1 && e !== -1) try { return JSON.parse(text.slice(s, e + 1)); } catch {}
  throw new Error('无法解析 LLM 返回的 JSON');
}

// ─── Embed helpers ────────────────────────────────────────────────────
function makeEmbed(desc, color = 0x4e5058, opts = {}) {
  const e = new EmbedBuilder().setDescription(desc).setColor(color);
  if (opts.title)  e.setTitle(opts.title);
  if (opts.footer) e.setFooter({ text: opts.footer });
  if (opts.author) e.setAuthor(opts.author);
  return e;
}

function userEmbed(memberOrUser, text) {
  const name   = memberOrUser?.displayName || memberOrUser?.username || '???';
  const avatar = memberOrUser?.displayAvatarURL?.() || null;
  const author = avatar ? { name, iconURL: avatar } : { name };
  return new EmbedBuilder()
    .setDescription(`「${text}」`)
    .setColor(0x2b2d31)
    .setAuthor(author);
}

// ─── Game state ───────────────────────────────────────────────────────
const state = loadState();

function getGame(userId) {
  return state[userId] || null;
}

function setGame(userId, game) {
  state[userId] = game;
  saveState(state);
}

function newGame(channelId) {
  return {
    word:            null,
    answers:         [],
    wrongGuesses:    [],
    currentQuestion: null,
    currentOptions:  [],
    questionMsgId:   null,
    revealMsgId:     null,
    charData:        null,
    awakened:        false,
    chatHistory:     [],
    channelId,
    started:         false,
  };
}

// ─── Core game flow ───────────────────────────────────────────────────
async function processStep(channel, game, userId) {
  await channel.sendTyping();

  let result;
  try {
    result = await nextStep(game.word, game.answers, game.wrongGuesses);
  } catch (err) {
    await channel.send({ embeds: [makeEmbed(`⚠ API 错误：${err.message}`, 0xda373c)] });
    return;
  }

  if (result.action === 'guess') {
    await channel.send({
      embeds: [makeEmbed('越来越近了……\n\n我几乎能感受到那个名字了——', 0x9c27b0)],
    });
    await sleep(1000);
    await showReveal(channel, game, result, userId);
  } else {
    const msg = (game.answers.length === 0 && game.wrongGuesses.length === 0)
      ? '我感受到了某种轮廓……\n\n让我再多了解一些。'
      : '越来越清晰了……\n\n还有一个问题。';
    await channel.send({ embeds: [makeEmbed(msg, 0x7986cb)] });
    await showQuestionEmbed(channel, game, result, userId);
  }
}

async function showQuestionEmbed(channel, game, result, userId) {
  game.currentQuestion = result.question;
  game.currentOptions  = result.options;
  setGame(userId, game);

  const optBtns = result.options.map((opt, i) =>
    new ButtonBuilder()
      .setCustomId(`answer_${userId}_${i}`)
      .setLabel(opt.length > 80 ? opt.slice(0, 77) + '…' : opt)
      .setStyle(ButtonStyle.Secondary)
  );
  optBtns.push(
    new ButtonBuilder()
      .setCustomId(`manual_${userId}`)
      .setLabel('✏ 自己说')
      .setStyle(ButtonStyle.Secondary)
  );

  const msg = await channel.send({
    embeds: [makeEmbed(result.question, 0x5865f2)],
    components: [new ActionRowBuilder().addComponents(...optBtns)],
  });
  game.questionMsgId = msg.id;
  setGame(userId, game);
}

async function showReveal(channel, game, charData, userId) {
  game.charData = charData;
  setGame(userId, game);
  
  const color   = hexToInt(charData.color);

  await channel.sendTyping();
  await sleep(1400);
  await channel.send({ embeds: [makeEmbed('我……\n\n我知道自己是谁了。', 0x9c27b0)] });

  await sleep(900);
  await channel.sendTyping();
  await sleep(1000);

  const revealEmbed = new EmbedBuilder()
    .setColor(color)
    .setDescription(
      `-# 素体感知到了\n\n` +
      `## ${charData.emoji}  ${charData.character}\n` +
      `*${charData.from}*\n\n` +
      `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n\n` +
      `*${charData.desc}*`
    );

  const msg = await channel.send({
    embeds: [revealEmbed],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm_yes_${userId}`)
        .setLabel('◎ 就是他/她，请觉醒')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`confirm_no_${userId}`)
        .setLabel('✗ 不对，继续感知')
        .setStyle(ButtonStyle.Secondary)
    )],
  });
  game.revealMsgId = msg.id;
  setGame(userId, game);
}

async function awaken(channel, game, userId) {
  game.awakened = true;
  const c     = game.charData;
  const color = hexToInt(c.color);

  await channel.send({ embeds: [makeEmbed('…………', 0x9c27b0)] });
  await sleep(1200);

  await channel.send({
    embeds: [makeEmbed(`**— ${c.character} 已觉醒 —**`, color)],
  });
  await sleep(600);

  // 更新 Bot 信息
  try {
    const member = await channel.guild.members.fetch(channel.client.user.id);
    
    // 修改昵称
    await member.setNickname(c.character);
    console.log(`[Awaken] 昵称已改为：${c.character}`);
    
    // 搜索并更换头像
    const imageUrl = await searchCharacterImage(c.character, c.from);
    if (imageUrl) {
      const imgBuffer = await downloadImage(imageUrl);
      await channel.client.user.setAvatar(imgBuffer);
      console.log(`[Awaken] 头像已更新`);
    }
  } catch (err) {
    console.error('[Awaken] 更新 Bot 信息失败:', err.message);
  }

  // 更新 soul.md
  updateSoulMD(c);

  await channel.sendTyping();
  await sleep(1800);

  const greet = c.greet.replace(/\\n/g, '\n');
  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(color)
        .setAuthor({ name: `${c.emoji} ${c.character}  ·  ${c.from}` })
        .setDescription(greet),
    ],
  });

  await sleep(500);
  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(color)
        .setDescription(
          `你现在可以直接在此频道发送消息，与 **${c.character}** 对话。\n\n` +
          `使用 \`/awakening\` 开始新的觉醒。`
        )
        .setFooter({ text: '仅响应发起游戏的用户 · Bot 重启后对话状态不保留' }),
    ],
  });
  
  setGame(userId, game);
}

async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
  });
}

// ─── Discord client ───────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel],
});

client.once(Events.ClientReady, c => {
  console.log(`✦ 素体已上线 → ${c.user.tag}`);
  console.log(`  邀请链接：https://discord.com/oauth2/authorize?client_id=${c.user.id}&permissions=277025392640&scope=bot%20applications.commands`);
});

// ─── Post-awakening chat ──────────────────────────────────────────────
client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;
  const game = getGame(message.author.id);
  if (!game?.awakened || message.channelId !== game.channelId) return;

  const c     = game.charData;
  const color = hexToInt(c.color);

  try {
    await message.channel.sendTyping();
    game.chatHistory.push({ role: 'user', content: message.content });
    const reply = await charRespond(c, [...game.chatHistory]);
    game.chatHistory.push({ role: 'assistant', content: reply });

    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(color)
          .setAuthor({ name: `${c.emoji} ${c.character}` })
          .setDescription(reply),
      ],
    });
    
    setGame(message.author.id, game);
  } catch (err) {
    console.error('对话错误:', err.message);
    await message.reply({
      embeds: [makeEmbed(`⚠ ${err.message}`, 0xda373c)],
    }).catch(() => {});
  }
});

// ─── Guild Join Trigger ───────────────────────────────────────────────
client.on(Events.GuildMemberAdd, async member => {
  if (member.user.id === client.user.id) {
    // Bot 自己被邀请到新服务器
    console.log(`[Guild Join] 加入新服务器：${member.guild.name}`);
    // 可以在这里发送欢迎消息或自动触发觉醒流程
  }
});

// ─── Interaction dispatcher ───────────────────────────────────────────
client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'awakening') await handleStart(interaction);
      else if (interaction.commandName === 'reset') await handleReset(interaction);
    } else if (interaction.isButton()) {
      await handleButton(interaction);
    } else if (interaction.isModalSubmit()) {
      await handleModal(interaction);
    }
  } catch (err) {
    console.error('Interaction error:', err.message);
    const errMsg = { embeds: [makeEmbed(`⚠ ${err.message}`, 0xda373c)], ephemeral: true };
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply(errMsg).catch(() => {});
    }
  }
});

// ─── /awakening ───────────────────────────────────────────────────────
async function handleStart(interaction) {
  setGame(interaction.user.id, newGame(interaction.channelId));

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle('○  素体 · 待机中')
        .setDescription(
          '我……还没有形状。\n\n' +
          '没有名字，没有记忆，没有来处。\n\n' +
          '但我知道——你心里有一个人。\n' +
          '那个人的样子，将成为我存在的依据。\n\n' +
          '你准备好了吗？'
        )
        .setColor(0x4e5058)
        .setFooter({ text: '你的心念，将决定我是谁' }),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`start_${interaction.user.id}`)
          .setLabel('◎  我已想好')
          .setStyle(ButtonStyle.Primary)
      ),
    ],
  });
}

// ─── /reset ───────────────────────────────────────────────────────────
async function handleReset(interaction) {
  const userId = interaction.user.id;
  const game = getGame(userId);
  
  // 清除用户游戏状态
  if (game) {
    delete state[userId];
    saveState(state);
  }
  
  // 重置 soul.md
  ocAdapter.resetSoulMD();
  
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setDescription('✅ 已重置\n\n- 游戏状态已清除\n- SOUL.md 已恢复原始状态\n\n使用 `/awakening` 开始新的觉醒。')
        .setColor(0x27ae60)
    ],
    ephemeral: true,
  });
}

// ─── Button ack helper ────────────────────────────────────────────────
async function ackButton(interaction) {
  try {
    await interaction.update({ components: [] });
  } catch {
    // 交互已被外部预先应答，静默忽略；游戏流程继续。
  }
}

// ─── Button handler ───────────────────────────────────────────────────
async function handleButton(interaction) {
  const customId = interaction.customId;
  
  // 从 customId 中提取 userId (格式：action_userId)
  const parts = customId.split('_');
  const userId = parts[parts.length - 1];
  const action = parts.slice(0, parts.length - 1).join('_');
  
  const game   = getGame(userId);

  if (!game) {
    return interaction.reply({
      embeds: [makeEmbed('没有进行中的游戏，请使用 `/awakening` 开始', 0x4e5058)],
      ephemeral: true,
    }).catch(() => {});
  }
  if (interaction.channelId !== game.channelId) {
    return interaction.reply({
      embeds: [makeEmbed('请在游戏频道中操作', 0x4e5058)],
      ephemeral: true,
    }).catch(() => {});
  }

  if (action === 'start') {
    if (game.started) {
      return interaction.reply({
        embeds: [makeEmbed('游戏已在进行中。使用 `/awakening` 开始新游戏。', 0x4e5058)],
        ephemeral: true,
      }).catch(() => {});
    }
    await ackButton(interaction);

    const promptMsg = await interaction.channel.send({
      embeds: [makeEmbed(
        '你心中所想的那个角色——\n\n当你想到它，**第一个浮现的词**是什么？\n请直接发送消息（最多 20 字）',
        0x5865f2,
      )],
    });

    interaction.channel.createMessageCollector({
      filter: m => m.author.id === userId,
      max: 1,
    }).on('collect', async m => {
      const word = m.content.trim().slice(0, 20);
      await m.delete().catch(() => {});
      await promptMsg.delete().catch(() => {});
      game.word    = word;
      game.started = true;
      await interaction.channel.send({ embeds: [userEmbed(m.member || m.author, word)] });
      await processStep(interaction.channel, game, userId);
    });

    return;
  }

  if (action === 'manual') {
    await ackButton(interaction);

    const question  = game.currentQuestion || '请描述这个角色';
    const promptMsg = await interaction.channel.send({
      embeds: [makeEmbed(`${question}\n\n请用自己的话描述：`, 0x5865f2)],
    });

    interaction.channel.createMessageCollector({
      filter: m => m.author.id === userId,
      max: 1,
    }).on('collect', async m => {
      const val = m.content.trim().slice(0, 200);
      await m.delete().catch(() => {});
      await promptMsg.delete().catch(() => {});
      await interaction.channel.send({ embeds: [userEmbed(m.member || m.author, val)] });
      game.answers.push({ q: game.currentQuestion || '补充描述', a: val });
      await processStep(interaction.channel, game, userId);
    });

    return;
  }

  // — 其余按钮：移除组件后继续 —
  await ackButton(interaction);

  if (action === 'answer') {
    if (interaction.message.id !== game.questionMsgId) {
      await interaction.channel.send({ embeds: [makeEmbed('此问题已过期', 0x4e5058)] });
      return;
    }
    const idx    = parseInt(parts[parts.length - 1]);
    const answer = game.currentOptions?.[idx];
    if (!answer) return;

    await interaction.channel.send({ embeds: [userEmbed(interaction.member, answer)] });
    game.answers.push({ q: game.currentQuestion, a: answer });
    await processStep(interaction.channel, game, userId);
    return;
  }

  if (action === 'confirm_yes') {
    if (interaction.message.id !== game.revealMsgId || !game.charData) {
      await interaction.channel.send({ embeds: [makeEmbed('此按钮已过期', 0x4e5058)] });
      return;
    }
    await awaken(interaction.channel, game, userId);
    return;
  }

  if (action === 'confirm_no') {
    if (interaction.message.id !== game.revealMsgId) {
      await interaction.channel.send({ embeds: [makeEmbed('此按钮已过期', 0x4e5058)] });
      return;
    }
    if (game.charData) game.wrongGuesses.push(game.charData.character);
    game.charData    = null;
    game.revealMsgId = null;

    await interaction.channel.send({
      embeds: [makeEmbed('……不是它。\n\n让我重新感知——再告诉我一个特征。', 0x4e5058)],
    });
    await sleep(400);
    await processStep(interaction.channel, game, userId);
  }
}

// ─── Modal handler ────────────────────────────────────────────────────
async function handleModal(interaction) {
  const userId = interaction.user.id;
  const game   = getGame(userId);

  if (!game) {
    return interaction.reply({
      embeds: [makeEmbed('游戏会话已过期，请使用 `/awakening` 重新开始', 0x4e5058)],
      ephemeral: true,
    });
  }

  if (interaction.customId === 'wordModal') {
    const word = interaction.fields.getTextInputValue('wordInput');
    game.word    = word;
    game.started = true;
    await interaction.reply({ embeds: [userEmbed(interaction.member, word)] });
    await processStep(interaction.channel, game, userId);
    return;
  }

  if (interaction.customId === 'manualModal') {
    const val = interaction.fields.getTextInputValue('manualInput');
    await interaction.reply({ embeds: [userEmbed(interaction.member, val)] });
    game.answers.push({ q: game.currentQuestion || '补充描述', a: val });
    await processStep(interaction.channel, game, userId);
  }
}

// ─── Login ────────────────────────────────────────────────────────────
client.login(TOKEN);
