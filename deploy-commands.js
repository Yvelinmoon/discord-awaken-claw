/**
 * 部署 Discord 斜杠命令
 */

require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;

if (!TOKEN || !CLIENT_ID) {
  console.error('❌ 缺少 DISCORD_TOKEN 或 DISCORD_CLIENT_ID');
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName('awakening')
    .setDescription('开始素体觉醒流程 - 让我成为你心中的那个角色'),
  new SlashCommandBuilder()
    .setName('reset')
    .setDescription('重置觉醒状态 - 清除游戏进度并恢复原始 SOUL.md'),
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log(`🔄 开始部署 ${commands.length} 个命令...`);

    const data = await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );

    console.log(`✅ 成功部署 ${data.length} 个命令`);
  } catch (error) {
    console.error('❌ 部署失败:', error);
  }
})();
