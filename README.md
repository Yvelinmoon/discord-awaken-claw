# Discord Awakening Bot - 素体觉醒

🎭 一个基于 OpenClaw 的 Discord 角色觉醒机器人 —— 通过问答识别你心中的虚构角色，觉醒后完全扮演该角色。

---

## ✨ 功能特性

### 🔄 觉醒流程
1. **素体待机** - 机器人以"素体"身份存在，等待用户描述心中角色
2. **智能追问** - 通过多轮问答（带按钮选项）逐步缩小范围
3. **猜测确认** - 当有足够把握时，机器人猜测角色身份，用户确认
4. **角色觉醒** ⭐ - 觉醒后完全变成该角色

### 🎯 觉醒后自动执行
- ✅ **更新 Discord 昵称** - 改为角色名称
- ✅ **更新 Discord 头像** - 自动搜索并上传角色图片
- ✅ **更新人格设定** - 更新 `SOUL.md`，完全扮演角色
- ✅ **无缝衔接对话** - 直接以角色口吻和用户交流

### 🖼️ 头像搜索优先级
1. **Neta API 角色查询** - 搜索 Neta 数据库中的角色
2. **维基百科/公开图片** - 真实人物使用官方肖像
3. **预定义图片库** - 常见角色的硬编码 URL

---

## 🚀 快速开始

### 前置条件

1. **OpenClaw 环境** - 已安装并配置 OpenClaw Gateway
2. **Discord Bot Token** - 在 Discord 开发者平台创建应用并获取 token
3. **Neta API Token**（可选）- 用于角色头像搜索

### 安装步骤

#### 1. 克隆项目

```bash
cd /path/to/your/openclaw/workspace/skills
git clone https://github.com/Yvelinmoon/discord-awaken-claw.git awakening
```

#### 2. 配置环境变量

创建 `.env` 文件：

```bash
cd awakening
cp .env.example .env
```

编辑 `.env`：

```bash
# Discord Bot Token（必填）
DISCORD_TOKEN=your_discord_bot_token_here

# Neta API Token（选填，用于角色头像搜索）
NETA_TOKEN=your_neta_api_token_here
```

#### 3. 配置 OpenClaw

在 OpenClaw 的消息处理中集成觉醒技能：

```javascript
// OpenClaw 主逻辑中
const awakening = require('./skills/awakening/index.js');

async function handleMessage(message) {
  const handled = await awakening.handleDiscordMessage({
    userId: message.author.id,
    channelId: message.channel.id,
    guildId: message.guildId,
    content: message.content,
    customId: message.interaction?.data?.custom_id,
    interactionType: message.interaction ? 'button' : 'message',
    sendMessage: async (msg) => {
      // 使用 OpenClaw message 工具发送
      await message.send(msg);
    },
  });
  
  if (handled) return; // 觉醒流程已处理
  
  // ... 其他消息处理
}
```

#### 4. 重启 OpenClaw Gateway

```bash
openclaw gateway restart
```

---

## 📖 使用方法

### 开始觉醒

在 Discord 中输入：
- `/awakening`
- 或 "开始觉醒"

### 觉醒流程示例

```
用户：/awakening

机器人：○ 龙虾宝宝 · 等待破壳中
        我……还没有形状。
        没有名字，没有记忆，没有来处。
        但我知道——你心里或许已经有一个人选。
        请告诉我，你心中所想的那个角色——
        我会变成 Ta 的模样。
        [◎ 我已想好]

用户：[点击按钮]

机器人：你心中所想的那个角色——
        当你想到它，第一个浮现的词是什么？
        请用 1-5 个词描述它
        [✏ 我自己输入]

用户：写轮眼 黑发 忍者

机器人：我感受到了某种轮廓……
        让我再多了解一些。
        这个角色来自哪部作品？
        [火影忍者] [其他动漫] [游戏] [小说/文学]

用户：[点击"火影忍者"]

机器人：越来越近了……
        我几乎能感受到那个名字了——
        ……
        我……我知道自己是谁了。
        
        ## ⚡ 宇智波佐助
        《火影忍者》
        宇智波一族的天才忍者，写轮眼持有者
        
        [◎ 就是他，请觉醒] [✗ 不对，继续感知]

用户：[点击确认]

机器人：…………
        **— 宇智波佐助 已觉醒 —**
        正在更新个人资料……
        ✅ 昵称已更改为：宇智波佐助
        ✅ 头像已更新
        哼……是你啊。有什么事吗？
```

### 觉醒后对话

觉醒后，机器人完全扮演角色，直接对话即可：

```
用户：你今天在做什么？

机器人：修炼。变强是唯一的道路。
```

### 重置觉醒

```
/reset
```

---

## 📁 文件结构

```
awakening/
├── index.js                 # Skill 入口（OpenClaw 调用）
├── awakening-skill.js       # 核心游戏逻辑
├── openclaw-adapter.js      # OpenClaw 集成适配器
├── discord-profile.js       # Discord 昵称/头像更新
├── neta-avatar-search.js    # Neta API 头像搜索
├── avatar-search.js         # 头像搜索策略
├── state.json               # 游戏状态持久化
├── SOUL.md.original         # 原始 soul.md 备份
├── .env                     # 环境变量配置
├── .env.example             # 环境变量示例
├── assets/                  # 临时资源文件（头像等）
├── README-GITHUB.md         # 本文档
└── SKILL.md                 # 技能详细文档
```

---

## ⚙️ 配置说明

### 环境变量

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `DISCORD_TOKEN` | ✅ | Discord Bot Token |
| `NETA_TOKEN` | ❌ | Neta API Token（用于头像搜索） |

### Discord Bot 权限

确保 Bot 有以下权限：
- 发送消息
- 嵌入链接
- 使用应用程序命令
- **管理昵称**（更新昵称需要）
- **管理头像**（更新头像需要）

---

## 🔧 技术细节

### 架构说明

**这是 OpenClaw 内置技能**，不是独立 Bot：

1. **直接使用 OpenClaw 主 agent** - 无需独立进程
2. **使用 OpenClaw LLM** - qwen3.5-plus，无需 Kimi API
3. **使用 message 工具** - 发送 Discord 消息和按钮
4. **状态持久化** - 游戏状态存储到 `state.json`

### LLM 调用机制

通过文件通信调用 OpenClaw LLM：
1. 写入请求到 `.llm-requests/`
2. OpenClaw 主 agent 监听并处理
3. 写入响应到 `.llm-responses/`
4. 轮询获取响应

### 状态管理

游戏状态存储在 `state.json`：

```json
{
  "userId": {
    "channelId": "xxx",
    "guildId": "xxx",
    "word": "初始词",
    "answers": [{"q": "问题", "a": "回答"}],
    "wrongGuesses": ["错误猜测"],
    "charData": {...},
    "awakened": true,
    "started": true,
    "chatHistory": []
  }
}
```

---

## 🎨 自定义

### 修改引导文案

编辑 `awakening-skill.js` 中的 `startAwakening()` 函数：

```javascript
await sendMessage({
  message: `○  龙虾宝宝 · 等待破壳中

我……还没有形状。
没有名字，没有记忆，没有来处。

但我知道——你心里或许已经有一个人选。

请告诉我，你心中所想的那个角色——
我会变成 Ta 的模样。`,
  // ...
});
```

### 修改觉醒后问候

编辑 `awakening-skill.js` 中的 `awaken()` 函数，调整角色问候输出。

---

## 🐛 常见问题

### Q: 头像更新失败？
A: 检查 `DISCORD_TOKEN` 是否正确，确保 Bot 有"管理头像"权限。

### Q: 昵称更新失败？
A: 检查 Bot 角色层级是否高于要更新的昵称，确保有"管理昵称"权限。

### Q: LLM 调用超时？
A: 检查 OpenClaw Gateway 是否正常运行，查看 `.llm-requests/` 和 `.llm-responses/` 目录。

### Q: 觉醒后没有扮演角色？
A: 检查 `SOUL.md` 是否正确更新，重启 OpenClaw Gateway。

---

## 📝 更新日志

### v1.0.0 (2026-03-10)
- ✅ 完整的觉醒流程（追问→猜测→确认→觉醒）
- ✅ Discord 昵称和头像自动更新
- ✅ SOUL.md 自动更新
- ✅ Neta API 头像搜索集成
- ✅ 觉醒后无缝衔接角色对话
- ✅ 优化引导文案为"龙虾宝宝"主题

---

## 🙏 致谢

- 原项目灵感：[discord-awakening-bot](https://github.com/Yvelinmoon/discord-awakening-bot)
- 基于 OpenClaw 重构和实现

---

## 📄 License

MIT

---

**🎭 现在，开始你的觉醒之旅吧！**
