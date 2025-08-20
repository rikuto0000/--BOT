require('dotenv').config();
const { REST, Routes } = require('discord.js');
const { clientId, guildIds } = require('./config.json');
const fs = require('node:fs');

const commands = [];
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
	const command = require(`./commands/${file}`);
	commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
	try {
		console.log(`Started refreshing ${commands.length} application (/) commands for ${guildIds.length} servers.`);
		
		let successCount = 0;
		let errorCount = 0;
		
		// 各サーバーにコマンドをデプロイ
		for (const guildId of guildIds) {
			try {
				const data = await rest.put(
					Routes.applicationGuildCommands(clientId, guildId),
					{ body: commands },
				);
				console.log(`✅ Successfully reloaded ${data.length} commands for server ${guildId}`);
				successCount++;
			} catch (error) {
				if (error.code === 50001) {
					console.log(`❌ Missing access to server ${guildId}. Bot may not be added to this server or lacks permissions.`);
				} else {
					console.log(`❌ Failed to deploy commands to server ${guildId}:`, error.message);
				}
				errorCount++;
			}
		}
		
		console.log(`\n=== Deploy Summary ===`);
		console.log(`✅ Success: ${successCount}/${guildIds.length} servers`);
		console.log(`❌ Failed: ${errorCount}/${guildIds.length} servers`);
		
		if (errorCount > 0) {
			console.log(`\n📝 Note: Failed servers may require bot re-invitation or permission adjustments.`);
		}
		
	} catch (error) {
		console.error('Unexpected error:', error);
	}
})();
