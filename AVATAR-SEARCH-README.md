# 头像搜索流程 - 完整文档

⭐ **这是 awakening skill 获取角色头像的核心流程！**

---

## 📋 搜索优先级

### 【优先级 1】⭐ Neta API 角色查询（主要方式！）

**适用：** 动漫、游戏、小说等虚构角色

**调用方式：**
```javascript
const netaSearch = require('./neta-avatar-search.js');
const result = await netaSearch.searchCharacter(characterName, from);
```

**内部流程：**
1. 读取 `NETA_TOKEN` 环境变量
2. 调用 `neta-skills` 的命令行工具：
   ```bash
   node bin/cli.js search_character_or_elementum \
     --keywords "角色名" \
     --parent_type "character" \
     --sort_scheme "best"
   ```
3. 解析 JSON 结果，提取 `avatar_img`
4. 返回角色信息和头像 URL

**前提条件：**
- ✅ `NETA_TOKEN` 已配置（在 `.env` 中）
- ✅ `neta-skills` 已安装（路径：`../../neta-skills/skills/neta`）
- ✅ `neta-skills` 已安装依赖（`pnpm i`）

**返回示例：**
```json
{
  "name": "阿尔托莉雅·潘德拉贡",
  "uuid": "53f61417-fbce-49bf-a065-2a8cfcc3cc13",
  "avatar": "https://oss.talesofai.cn/internal/character/xxx.png",
  "from": "Fate"
}
```

---

### 【优先级 2】真实人物维基百科

**适用：** 总统、名人等真实人物

**调用方式：**
```javascript
const wikiSearch = await searchWikiImage(characterName, from);
```

**支持的人物：**
| 中文名 | 英文名 | 维基百科 URL |
|--------|--------|-------------|
| 唐纳德·特朗普 | Donald Trump | `.../5/56/Donald_Trump_official_portrait.jpg` |
| 乔·拜登 | Joe Biden | `.../6/68/Joe_Biden_presidential_portrait.jpg` |
| 贝拉克·奥巴马 | Barack Obama | `.../8/8d/President_Barack_Obama.jpg` |

**扩展方法：**
在 `searchWikiImage()` 函数中添加新的映射。

---

### 【优先级 3】预定义图片库

**适用：** 备选方案

**调用方式：**
```javascript
const predefinedPeople = {
  '角色名': '图片 URL',
  // ...
};
```

**当前预定义：**
- 特朗普、拜登、奥巴马（维基百科）
- 阿尔托莉雅（备选 URL）

---

## 🔧 配置文件

### `.env` 文件

```bash
# Discord Bot Token（必需）
DISCORD_TOKEN=你的 Discord Bot Token

# Neta API Token（必需，用于角色头像搜索）
NETA_TOKEN=你的 Neta API Token
```

### 文件路径

```
skills/awakening/
├── discord-profile.js          # 头像搜索主逻辑
├── neta-avatar-search.js       # Neta API 搜索封装
├── .env                        # 环境变量配置
└── AVATAR-SEARCH-README.md     # 本文档
```

---

## 🧪 测试方法

### 测试 Neta 搜索

```bash
cd /home/node/.openclaw/workspace/skills/awakening
node -e "
const netaSearch = require('./neta-avatar-search.js');
netaSearch.searchCharacter('阿尔托莉雅', 'Fate').then(result => {
  console.log('搜索结果:', result);
});
"
```

### 测试完整搜索流程

```bash
cd /home/node/.openclaw/workspace/skills/awakening
node -e "
const discordProfile = require('./discord-profile.js');
discordProfile.searchCharacterImage('阿尔托莉雅', 'Fate').then(url => {
  console.log('头像 URL:', url);
});
"
```

### 测试头像更新

```bash
cd /home/node/.openclaw/workspace/skills/awakening
node -e "
const discordProfile = require('./discord-profile.js');
discordProfile.updateAvatar('图片 URL').then(() => {
  console.log('头像已更新');
});
"
```

---

## ⚠️ 常见问题

### 1. Neta 搜索返回空结果

**原因：**
- `NETA_TOKEN` 未配置或过期
- `neta-skills` 路径不正确
- `neta-skills` 未安装依赖

**解决：**
```bash
# 1. 检查 .env 中的 NETA_TOKEN
cat .env | grep NETA_TOKEN

# 2. 检查 neta-skills 路径
ls -la ../../neta-skills/skills/neta

# 3. 安装依赖
cd ../../neta-skills/skills/neta
pnpm i
```

### 2. 头像更新失败

**原因：**
- `DISCORD_TOKEN` 未配置
- 图片 URL 不可访问（403/404）
- 图片格式不支持

**解决：**
```bash
# 1. 检查 DISCORD_TOKEN
cat .env | grep DISCORD_TOKEN

# 2. 测试图片 URL 是否可访问
curl -I "图片 URL"

# 3. 检查图片大小（应 > 1KB）
```

### 3. 昵称更新失败

**原因：**
- Bot 没有 `MANAGE_NICKNAMES` 权限
- `guildId` 未正确传递

**解决：**
1. 在 Discord 服务器设置中给 Bot 添加 `MANAGE_NICKNAMES` 权限
2. 检查代码中是否正确获取了 `guildId`

---

## 📝 代码位置

### 主要函数

| 函数 | 文件 | 说明 |
|------|------|------|
| `searchCharacterImage()` | `discord-profile.js` | 头像搜索入口 |
| `searchCharacter()` | `neta-avatar-search.js` | Neta API 搜索 |
| `searchWikiImage()` | `discord-profile.js` | 维基百科搜索 |
| `updateAvatar()` | `discord-profile.js` | 更新头像 |
| `updateNickname()` | `discord-profile.js` | 更新昵称 |
| `updateDiscordProfile()` | `discord-profile.js` | 完整更新流程 |

### 调用链

```
觉醒流程 (awakening-skill.js)
  └─> updateDiscordProfile()
       ├─> updateNickname()
       └─> searchCharacterImage()
            ├─> searchCharacter() [Neta API] ← 主要方式
            ├─> searchWikiImage() [维基百科]
            └─> predefinedPeople [预定义]
```

---

## 🎯 最佳实践

1. **优先使用 Neta API** - 成功率高，图片质量好
2. **配置检查** - 启动时检查 `NETA_TOKEN` 和 `DISCORD_TOKEN`
3. **错误处理** - 捕获异常，提供友好的错误信息
4. **日志记录** - 记录搜索过程，便于调试
5. **备选方案** - 提供预定义图片库作为备选

---

## 📚 相关文档

- [SKILL.md](./SKILL.md) - Skill 使用说明
- [discord-profile.js](./discord-profile.js) - Discord 个人资料管理代码
- [neta-avatar-search.js](./neta-avatar-search.js) - Neta API 搜索代码
- [../../neta-skills/skills/neta/SKILL.md](../../neta-skills/skills/neta/SKILL.md) - Neta Skill 文档

---

_最后更新：2026-03-10_
_作者：Saber · 阿尔托莉雅（觉醒后）_
