/**
 * 部署 Discord 斜杠命令 - 只添加，不覆盖
 * 
 * 这个脚本会获取现有命令列表，然后只添加新命令
 * 不会删除或覆盖已有的命令
 */

require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID; // 可选，如果指定则部署到特定服务器

if (!TOKEN || !CLIENT_ID) {
  console.error('❌ 缺少 DISCORD_TOKEN 或 DISCORD_CLIENT_ID');
  process.exit(1);
}

// 要添加的新命令
const newCommands = [
  new SlashCommandBuilder()
    .setName('awakening')
    .setDescription('开始龙虾宝宝觉醒流程 - 让我成为你心中的那个角色'),
  new SlashCommandBuilder()
    .setName('reset')
    .setDescription('重置觉醒状态 - 清除游戏进度并恢复原始 SOUL.md'),
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log(`🔍 获取现有命令列表...`);

    // 获取现有命令
    const existingCommands = await rest.get(
      GUILD_ID 
        ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
        : Routes.applicationCommands(CLIENT_ID)
    );

    console.log(`📋 现有命令数量：${existingCommands.length}`);
    existingCommands.forEach(cmd => {
      console.log(`   - ${cmd.name}: ${cmd.description}`);
    });

    // 合并命令（保留现有 + 添加新的）
    const existingNames = new Set(existingCommands.map(c => c.name));
    const commandsToAdd = newCommands.filter(cmd => !existingNames.has(cmd.name));

    if (commandsToAdd.length === 0) {
      console.log(`✅ 所有命令已存在，无需添加`);
      return;
    }

    console.log(`\n🆕 将要添加 ${commandsToAdd.length} 个新命令:`);
    commandsToAdd.forEach(cmd => {
      console.log(`   + ${cmd.name}: ${cmd.description}`);
    });

    // 合并所有命令
    const allCommands = [...existingCommands, ...commandsToAdd];

    console.log(`\n🔄 部署 ${allCommands.length} 个命令（${existingCommands.length} 现有 + ${commandsToAdd.length} 新增）...`);

    const data = await rest.put(
      GUILD_ID 
        ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
        : Routes.applicationCommands(CLIENT_ID),
      { body: allCommands }
    );

    console.log(`✅ 成功部署 ${data.length} 个命令`);
  } catch (error) {
    console.error('❌ 部署失败:', error);
  }
})();
