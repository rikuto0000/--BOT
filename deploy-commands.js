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
		
		// 各サーバーにコマンドをデプロイ
		for (const guildId of guildIds) {
			const data = await rest.put(
				Routes.applicationGuildCommands(clientId, guildId),
				{ body: commands },
			);
			console.log(`Successfully reloaded ${data.length} commands for server ${guildId}`);
		}
		
		console.log('All servers updated successfully!');
	} catch (error) {
		console.error(error);
	}
})();
