const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { lfgPosts } = require('../utils/lfgStore');

// Valorantのマップリスト
const valorantMaps = [
    { name: 'バインド', value: 'bind', emoji: '🟫' },
    { name: 'ヘイヴン', value: 'haven', emoji: '🟩' },
    { name: 'スプリット', value: 'split', emoji: '🟪' },
    { name: 'アセント', value: 'ascent', emoji: '⬜' },
    { name: 'アイスボックス', value: 'icebox', emoji: '🟦' },
    { name: 'ブリーズ', value: 'breeze', emoji: '🟨' },
    { name: 'フラクチャー', value: 'fracture', emoji: '🟥' },
    { name: 'パール', value: 'pearl', emoji: '🔵' },
    { name: 'ロータス', value: 'lotus', emoji: '🟢' },
    { name: 'サンセット', value: 'sunset', emoji: '🟠' },
    { name: 'アビス', value: 'abyss', emoji: '⚫' },
    { name: 'カロード', value: 'caroude', emoji: '🔴' }
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mapvote')
        .setDescription('VCのメンバーでプレイするマップを投票で決めます')
        .addChannelOption(option =>
            option.setName('voice')
                .setDescription('マップ投票するボイスチャンネル')
                .setRequired(true)
                .addChannelTypes(2)), // ChannelType.GuildVoice

    async execute(client, interaction) {
        const voiceChannel = interaction.options.getChannel('voice');

        // VCにいるメンバーを取得
        const vcChannel = await interaction.guild.channels.fetch(voiceChannel.id);
        if (!vcChannel) {
            return await interaction.reply({
                content: '指定されたボイスチャンネルが見つかりません。',
                flags: 64
            });
        }

        const participants = Array.from(vcChannel.members.values())
            .filter(member => !member.user.bot); // BOTを除外

        if (participants.length < 2) {
            return await interaction.reply({
                content: `マップ投票には最低2人必要です。現在VC人数: ${participants.length}人`,
                flags: 64
            });
        }

        // 投票データを初期化
        const voteData = {
            votes: new Map(), // userId -> mapValue
            mapCounts: new Map(), // mapValue -> count
            voters: new Set(), // 投票済みユーザー
            endTime: Date.now() + 120000 // 2分後
        };

        // マップの投票数を初期化
        valorantMaps.forEach(map => {
            voteData.mapCounts.set(map.value, 0);
        });

        // ボタンを2行に分けて作成（6個 + 6個）
        const row1 = new ActionRowBuilder();
        const row2 = new ActionRowBuilder();

        for (let i = 0; i < valorantMaps.length; i++) {
            const map = valorantMaps[i];
            const button = new ButtonBuilder()
                .setCustomId(`mapvote_${map.value}`)
                .setLabel(map.name)
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(map.emoji);

            if (i < 6) {
                row1.addComponents(button);
            } else {
                row2.addComponents(button);
            }
        }

        // 初期Embedを作成
        const embed = this.createVoteEmbed(voteData, participants.length, vcChannel);

        const response = await interaction.reply({
            embeds: [embed],
            components: [row1, row2]
        });

        // 投票の収集
        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 120000
        });

        collector.on('collect', async (buttonInteraction) => {
            // VCのメンバーのみ投票可能
            if (!participants.some(p => p.id === buttonInteraction.user.id)) {
                return await buttonInteraction.reply({
                    content: 'このボイスチャンネルのメンバーのみ投票できます。',
                    flags: 64
                });
            }

            const mapValue = buttonInteraction.customId.replace('mapvote_', '');
            const previousVote = voteData.votes.get(buttonInteraction.user.id);

            // 前の投票があれば削除
            if (previousVote) {
                const prevCount = voteData.mapCounts.get(previousVote) || 0;
                voteData.mapCounts.set(previousVote, Math.max(0, prevCount - 1));
            }

            // 新しい投票を記録
            voteData.votes.set(buttonInteraction.user.id, mapValue);
            const newCount = (voteData.mapCounts.get(mapValue) || 0) + 1;
            voteData.mapCounts.set(mapValue, newCount);
            voteData.voters.add(buttonInteraction.user.id);

            // Embedを更新
            const updatedEmbed = this.createVoteEmbed(voteData, participants.length, vcChannel);

            await buttonInteraction.update({
                embeds: [updatedEmbed],
                components: [row1, row2]
            });
        });

        collector.on('end', async () => {
            // 結果を決定
            const result = this.determineResult(voteData);
            
            // 最終結果のEmbedを作成
            const finalEmbed = this.createResultEmbed(result, voteData, participants.length, vcChannel);

            // ボタンを無効化
            const disabledRow1 = ActionRowBuilder.from(row1);
            const disabledRow2 = ActionRowBuilder.from(row2);
            
            disabledRow1.components.forEach(button => button.setDisabled(true));
            disabledRow2.components.forEach(button => button.setDisabled(true));

            await interaction.editReply({
                embeds: [finalEmbed],
                components: [disabledRow1, disabledRow2]
            });
        });
    },

    createVoteEmbed(voteData, totalParticipants, vcChannel) {
        const remainingTime = Math.max(0, Math.ceil((voteData.endTime - Date.now()) / 1000));
        const minutes = Math.floor(remainingTime / 60);
        const seconds = remainingTime % 60;

        const embed = new EmbedBuilder()
            .setTitle('🗺️ マップ投票開始！')
            .setColor(0xFD4556)
            .setDescription(`🔊 対象: <#${vcChannel.id}>\n⏱️ 残り時間: ${minutes}:${seconds.toString().padStart(2, '0')}\n👥 投票済み: ${voteData.voters.size}/${totalParticipants}人`)
            .setTimestamp();

        // 投票状況を表示
        let voteStatusText = '';
        const sortedMaps = Array.from(voteData.mapCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8); // 上位8マップのみ表示

        sortedMaps.forEach(([mapValue, count], index) => {
            const map = valorantMaps.find(m => m.value === mapValue);
            const bar = '█'.repeat(Math.min(count, 10));
            const isLeading = index === 0 && count > 0;
            const prefix = isLeading ? '🏆' : '📍';
            
            voteStatusText += `${prefix} ${map.emoji} ${map.name}: ${bar} ${count}票\n`;
        });

        if (voteStatusText) {
            embed.addFields({
                name: '📊 投票状況',
                value: voteStatusText,
                inline: false
            });
        }

        return embed;
    },

    determineResult(voteData) {
        // 最多得票数を取得
        const maxVotes = Math.max(...Array.from(voteData.mapCounts.values()));
        
        if (maxVotes === 0) {
            // 投票がない場合はランダム
            const randomMap = valorantMaps[Math.floor(Math.random() * valorantMaps.length)];
            return {
                map: randomMap,
                votes: 0,
                method: 'random'
            };
        }

        // 最多得票のマップを取得
        const topMaps = Array.from(voteData.mapCounts.entries())
            .filter(([, votes]) => votes === maxVotes)
            .map(([mapValue]) => valorantMaps.find(m => m.value === mapValue));

        // 同票の場合はランダム選択
        const selectedMap = topMaps[Math.floor(Math.random() * topMaps.length)];
        
        return {
            map: selectedMap,
            votes: maxVotes,
            method: topMaps.length > 1 ? 'tie_random' : 'vote'
        };
    },

    createResultEmbed(result, voteData, totalParticipants, vcChannel) {
        const embed = new EmbedBuilder()
            .setTitle('🏆 マップ投票結果発表！')
            .setColor(0x00FF00)
            .setTimestamp();

        let resultText = `**選ばれたマップ: ${result.map.emoji} ${result.map.name}**\n`;
        
        if (result.method === 'random') {
            resultText += '（投票がなかったため、ランダムで選択）';
        } else if (result.method === 'tie_random') {
            resultText += `（${result.votes}票で同票のため、ランダムで決定）`;
        } else {
            resultText += `（${result.votes}票で決定）`;
        }

        embed.setDescription(resultText);

        // 最終投票状況
        let finalStatusText = '';
        const sortedResults = Array.from(voteData.mapCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        sortedResults.forEach(([mapValue, count]) => {
            const map = valorantMaps.find(m => m.value === mapValue);
            const bar = '█'.repeat(Math.min(count, 10));
            finalStatusText += `${map.emoji} ${map.name}: ${bar} ${count}票\n`;
        });

        if (finalStatusText) {
            embed.addFields({
                name: '📊 最終投票結果',
                value: finalStatusText,
                inline: false
            });
        }

        embed.addFields(
            {
                name: '👥 投票参加者',
                value: `${voteData.voters.size}/${totalParticipants}人が投票`,
                inline: true
            },
            {
                name: '🔊 ボイスチャンネル',
                value: `<#${vcChannel.id}>`,
                inline: true
            }
        );

        return embed;
    }
};