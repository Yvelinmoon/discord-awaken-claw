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

    // 更新或添加命令（保留其他命令，只更新我们的命令）
    const existingMap = new Map(existingCommands.map(c => [c.name, c]));
    
    // 合并：新命令覆盖旧的，保留其他命令
    const allCommands = [...existingCommands];
    const commandsToUpdate = [];
    
    newCommands.forEach(newCmd => {
      const existing = existingMap.get(newCmd.name);
      if (existing) {
        // 检查是否需要更新（描述可能不同）
        if (existing.description !== newCmd.description) {
          console.log(`🔄 更新命令：${newCmd.name}`);
          console.log(`   旧：${existing.description}`);
          console.log(`   新：${newCmd.description}`);
          commandsToUpdate.push(newCmd);
        }
      } else {
        console.log(`🆕 添加命令：${newCmd.name}`);
        commandsToUpdate.push(newCmd);
      }
    });
    
    if (commandsToUpdate.length === 0) {
      console.log(`✅ 所有命令已是最新，无需更新`);
      return;
    }
    
    // 替换或添加
    commandsToUpdate.forEach(newCmd => {
      const idx = allCommands.findIndex(c => c.name === newCmd.name);
      if (idx >= 0) {
        allCommands[idx] = newCmd;
      } else {
        allCommands.push(newCmd);
      }
    });

    console.log(`\n🔄 部署 ${allCommands.length} 个命令...`);

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
