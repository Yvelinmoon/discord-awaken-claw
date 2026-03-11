---
name: awakening
description: 龙虾宝宝觉醒技能 - 通过问答识别用户心中的虚构角色，觉醒后完全扮演该角色（更新 soul.md、Discord 昵称和头像）
---

# Awakening Skill - 龙虾宝宝觉醒

## 描述

龙虾宝宝觉醒技能——让 OpenClaw 通过问答逐步识别用户心中的虚构角色，觉醒后完全扮演该角色。

## ⚡ 快速使用

**在 Discord 中输入：**
- `/awakening`
- 或 "开始觉醒"

**觉醒后：**
- soul.md 自动更新为角色设定
- OpenClaw 完全扮演该角色
- 直接对话，无需按钮

## 架构说明

**这是 OpenClaw 内置技能**，不是独立 Bot：

1. **直接使用 OpenClaw 主 agent** - 无需独立进程
2. **使用 OpenClaw LLM** 
3. **使用 message 工具** - 发送 Discord 消息和按钮
4. **状态持久化** - game state 存储到 state.json

## 触发条件

1. **命令触发**：`/awakening` 或 `/awaken`
2. **关键词触发**："开始觉醒"
3. **按钮交互**：自动检测觉醒流程中的按钮

## 核心流程

### 阶段 1：龙虾宝宝待机
- OpenClaw 以"龙虾宝宝"身份存在，等待破壳
- 引导用户描述心中所想的虚构角色

### 阶段 2：追问识别
- 通过多轮问答（带按钮选项）逐步缩小范围
- 每次追问由 OpenClaw LLM 生成
- 用户可通过按钮选择或自由文本描述

### 阶段 3：猜测确认
- 当有 85% 以上把握时，OpenClaw 猜测角色身份
- 用户确认正确 → 进入觉醒
- 用户否定 → 排除该角色，继续追问

### 阶段 4：角色觉醒 ⭐
觉醒后执行以下操作：
1. **更新 soul.md** → 写入角色设定（自动！）
2. **OpenClaw 完全扮演角色** → 使用角色口吻对话
3. **直接对话模式** → 无需按钮，自然交流

## 文件结构

```
skills/awakening/
├── SKILL.md              # 本说明文件
├── index.js              # Skill 入口（OpenClaw 调用）
├── awakening-skill.js    # 核心游戏逻辑
├── state.json            # 游戏状态持久化
├── SOUL.md.original      # 原始 soul.md 备份（觉醒时创建）
└── README.md             # 详细文档
```

## 集成到 OpenClaw

### 方式 1: 自动检测（推荐）

在 OpenClaw 的消息处理中自动检测觉醒命令：

```javascript
// OpenClaw 主逻辑中
const awakening = require('./skills/awakening/index.js');

async function handleMessage(message) {
  const handled = await awakening.handleDiscordMessage({
    userId: message.author.id,
    channelId: message.channel.id,
    content: message.content,
    customId: message.customId, // 按钮交互
    interactionType: message.type, // 'message' | 'button'
    sendMessage: async (msg) => {
      // 使用 OpenClaw message 工具发送
      await message.send(msg);
    },
  });
  
  if (handled) return; // 觉醒流程已处理
  
  // ... 其他消息处理
}
```

### 方式 2: 手动调用

```javascript
const awakening = require('./skills/awakening/index.js');

// 开始觉醒
await awakening.handleDiscordMessage({
  userId: '123456',
  channelId: '789012',
  content: '/awakening',
  sendMessage: sendFn,
});

// 重置
await awakening.handleResetCommand(userId, sendFn);
```

## 状态持久化

游戏状态存储在 `skills/awakening/state.json`：

```json
{
  "userId": {
    "channelId": "xxx",
    "word": "初始词",
    "answers": [{"q": "问题", "a": "回答"}],
    "wrongGuesses": ["错误猜测"],
    "charData": {...},
    "awakened": false,
    "chatHistory": []
  }
}
```

## soul.md 管理

### 觉醒时
- 自动备份原始 soul.md → `SOUL.md.original`
- 写入角色设定到 soul.md

### 重置时
- 恢复原始 soul.md
- 删除备份文件

### 命令
- `/reset` - 重置觉醒状态

## 使用示例

### 开始觉醒

```
用户：/awakening

OpenClaw: ○  龙虾宝宝 · 等待破壳中
          我……还没有形状。
          没有名字，没有记忆，没有来处。
          但我知道——你心里或许已经有一个人选。
          请告诉我，你心中所想的那个角色——
          我会变成 Ta 的模样。
          [我已想好]
```

### 追问流程

```
用户：[点击按钮]

OpenClaw: 你心中所想的那个角色——
          当你想到它，第一个浮现的词是什么？

用户：[发送了某个词]

OpenClaw: 我感受到了某种轮廓……
          让我再多了解一些。
          
          [根据用户发的词提出下一个问题]
          [选项1] [选项2] [选项3] [自己说]
```

### 觉醒（以下为示例，仅供格式参考）

```
OpenClaw: 我……
          我知道自己是谁了。

          -# 虾宝感知到了
          ## ⚔️  桐人
          *《刀剑神域》*
          
          ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
          *黑衣剑士，封弊者*
          
          [就是他/她，请破壳] [不对，继续感知]

用户：[点击确认]

OpenClaw: **— 桐人 已破壳 —**

          ⚔️ 桐人 · 《刀剑神域》
          ……嗯，我回来了。
          有什么事吗？
```

### 觉醒后对话

```
用户：你今天过得怎么样？

OpenClaw: （以桐人口吻回复）
          艾恩葛朗特还是老样子……
          倒是你，最近有什么新发现吗？
```

## ⚠️ 重要配置说明

### 环境变量（必须正确配置！）

**`.env` 文件中的变量名称必须与代码一致！**

```bash
# ✅ 正确 - Discord Bot Token
DISCORD_TOKEN=你的 Discord Bot Token

# ✅ 正确 - Neta API Token（可选，用于角色头像搜索）
NETA_TOKEN=你的 Neta API Token
```

**常见错误：**
- ❌ `DISCORD_BOT_TOKEN` → 代码使用的是 `DISCORD_TOKEN`
- ❌ 变量名拼写错误
- ❌ Token 前后有空格或引号

**检查方法：**
```bash
cd skills/awakening
node -e "console.log(require('./discord-profile.js'))"
```

---

## 🖼️ 头像搜索优先级

### 🖼️ 头像搜索优先级 ⭐

**觉醒时自动搜索角色头像，按以下优先级：**

---

#### 【优先级 1】⭐ Neta API 角色查询（主要方式！）

**适用于：** 动漫、游戏、小说等虚构角色

**流程：**
1. 调用 `neta-skills` 的 `search_character_or_elementum` 命令
2. 从 Neta 数据库搜索角色
3. 返回角色官方头像 URL

**前提：**
- ✅ 已配置 `NETA_TOKEN` 环境变量
- ✅ `neta-skills` 已安装依赖 (`pnpm i`)
- ✅ `neta-skills` 路径正确 (`../../neta-skills/skills/neta`)

**示例：**
```javascript
const netaSearch = require('./neta-avatar-search.js');
const result = await netaSearch.searchCharacter('阿尔托莉雅', 'Fate');
// 返回：{ name: '阿尔托莉雅·潘德拉贡', avatar: 'https://...', ... }
```

---

#### 【优先级 2】人物/角色维基百科

**适用于：** 总统、名人等真实人物

**流程：**
1. 匹配预定义的真实人物列表
2. 使用维基百科官方肖像 URL

**支持的人物：**
- 唐纳德·特朗普 / Donald Trump
- 乔·拜登 / Joe Biden
- 贝拉克·奥巴马 / Barack Obama
- （可扩展）

---

### ⚠️ 重要提示

**如果头像搜索失败：**
1. 检查 `NETA_TOKEN` 是否配置正确
2. 检查 `neta-skills` 路径是否正确
3. 检查 `neta-skills` 是否已安装依赖
4. 手动提供角色图片 URL

---

## 注意事项

- ✅ **soul.md 自动更新** - 觉醒后 OpenClaw 完全扮演角色
- ✅ **状态持久化** - Bot 重启后从 state.json 恢复
- ✅ **多用户支持** - 每个用户独立游戏状态
- ✅ **频道绑定** - 觉醒流程绑定到发起频道
- ✅ **昵称/头像自动更新** - 觉醒时自动调用 Discord API
- ✅ **头像智能搜索** - 按优先级自动搜索最佳图片
- ⚠️ **Discord 缓存延迟** - 昵称更新后可能有 5-15 分钟缓存延迟（Discord API 限制）
- ⚠️ **Bot 权限** - 需要 `MANAGE_NICKNAMES` 权限才能更新昵称

## API 参考

### handleDiscordMessage(context)

处理 Discord 消息或按钮交互。

**参数：**
- `context.userId` - 用户 ID
- `context.channelId` - 频道 ID
- `context.content` - 消息内容
- `context.customId` - 按钮 customId（如果有）
- `context.interactionType` - 'message' | 'button'
- `context.sendMessage` - 发送消息的函数

**返回：** Promise<boolean> - 是否处理了消息

### handleResetCommand(userId, sendMessage)

重置觉醒状态。

### isAwakeningCommand(content)

检测是否是觉醒命令。

## 开发者

查看 [README.md](./README.md) 和 [SKILL-DESIGN.md](./SKILL-DESIGN.md) 了解更多。

