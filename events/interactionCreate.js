const { Events, EmbedBuilder, ChannelType, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const { lfgPosts } = require('../utils/lfgStore');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

        // LFGボタンの処理
        if (interaction.customId.startsWith('lfg_')) {
            const parts = interaction.customId.split('_');
            let action, lfgId;
            
            if (parts.length === 4 && parts[2] === 'role') {
                // lfg_join_role_lfgId の場合
                action = 'join_role';
                lfgId = parts[3];
            } else {
                // 通常の lfg_action_lfgId の場合
                action = parts[1];
                lfgId = parts[2];
            }
            
            // 募集データを探す
            let lfgData = null;
            let authorId = null;
            for (const [userId, data] of lfgPosts.entries()) {
                if (data.id === lfgId) {
                    lfgData = data;
                    authorId = userId;
                    break;
                }
            }

            if (!lfgData) {
                return await interaction.reply({
                    content: 'この募集は既に終了しているか、存在しません。',
                    flags: 64
                });
            }

            if (action === 'join') {
                // 既に参加しているか確認
                if (lfgData.currentPlayers.some(p => p.user.id === interaction.user.id)) {
                    return await interaction.reply({
                        content: '既にこの募集に参加しています。',
                        flags: 64
                    });
                }

                // 満員か確認
                if (lfgData.currentPlayers.length >= lfgData.totalPlayers) {
                    return await interaction.reply({
                        content: 'この募集は既に満員です。',
                        flags: 64
                    });
                }

                // 参加者を追加
                lfgData.currentPlayers.push({
                    user: interaction.user,
                    preferredRole: null
                });

                // 「今から」の募集でVCが指定されている場合、参加者を自動移動
                if (lfgData.timeOption === 'now' && lfgData.voiceChannelId) {
                    try {
                        const member = await interaction.guild.members.fetch(interaction.user.id);
                        if (member.voice.channel) {
                            const voiceChannel = await interaction.guild.channels.fetch(lfgData.voiceChannelId);
                            if (voiceChannel) {
                                await member.voice.setChannel(voiceChannel);
                            }
                        }
                    } catch (error) {
                        console.error('参加者のVC移動に失敗:', error);
                    }
                }

                // Embedを更新
                const embed = new EmbedBuilder()
                    .setTitle('🎮 Valorant 募集')
                    .setColor(0xFD4556)
                    .setAuthor({
                        name: lfgData.author.tag,
                        iconURL: lfgData.author.displayAvatarURL()
                    })
            
            const embedFields = [
                { name: 'ゲームモード', value: lfgData.mode, inline: true },
                { name: 'ランク帯', value: lfgData.rank, inline: true },
                { name: '募集人数', value: `${lfgData.currentPlayers.length}/${lfgData.totalPlayers}人`, inline: true },
                { name: '開始時間', value: lfgData.startTimeText || '未設定', inline: true }
            ];

            // 「今から」の場合のみボイスチャンネルを表示
            if (lfgData.timeOption === 'now' && lfgData.voiceChannelId) {
                embedFields.push({ name: 'ボイスチャンネル', value: `<#${lfgData.voiceChannelId}>`, inline: true });
            }

            // 参加者リストを作成
            const participantsList = lfgData.currentPlayers.map(p => {
                const lfgCommand = require('../commands/lfg.js');
                const roleText = p.preferredRole ? ` (${lfgCommand.getRoleEmoji(p.preferredRole)} ${lfgCommand.getRoleName(p.preferredRole)}希望)` : '';
                return `<@${p.user.id}>${roleText}`;
            }).join('\n');

            embedFields.push(
                { name: '説明', value: lfgData.description, inline: false },
                { name: '参加者', value: participantsList || 'なし', inline: false }
            );

            embed.addFields(...embedFields)
                    .setTimestamp()
                    .setFooter({ text: `募集ID: ${lfgId}` });

                // 満員になった場合
                if (lfgData.currentPlayers.length >= lfgData.totalPlayers) {
                    embed.setColor(0x00FF00);
                    embed.setTitle('🎮 Valorant 募集【満員】');
                }

                await interaction.update({ embeds: [embed] });

                // 満員になったら通知
                if (lfgData.currentPlayers.length >= lfgData.totalPlayers) {
                    await interaction.followUp({
                        content: `<@${lfgData.author.id}> 募集が満員になりました！「開始する」ボタンを押してボイスチャンネルを作成してください。`,
                    });
                }

            } else if (action === 'join_role') {
                // 既に参加しているか確認
                if (lfgData.currentPlayers.some(p => p.user.id === interaction.user.id)) {
                    return await interaction.reply({
                        content: '既にこの募集に参加しています。',
                        flags: 64
                    });
                }

                // 満員か確認
                if (lfgData.currentPlayers.length >= lfgData.totalPlayers) {
                    return await interaction.reply({
                        content: 'この募集は既に満員です。',
                        flags: 64
                    });
                }

                // ロール選択メニューを表示
                const roleOptions = [
                    { label: 'Duelist', value: 'duelist', emoji: '⚔️' },
                    { label: 'Initiator', value: 'initiator', emoji: '🔍' },
                    { label: 'Controller', value: 'controller', emoji: '🛡️' },
                    { label: 'Sentinel', value: 'sentinel', emoji: '🏰' },
                    { label: 'なんでもOK', value: 'any', emoji: '🎲' }
                ];

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId(`role_select_${lfgId}_${interaction.user.id}`)
                    .setPlaceholder('希望ロールを選択してください')
                    .addOptions(roleOptions);

                const row = new ActionRowBuilder().addComponents(selectMenu);

                await interaction.reply({
                    content: '🎯 希望ロールを選択してください:',
                    components: [row],
                    flags: 64
                });

            } else if (action === 'leave') {
                // 募集者は離脱できない
                if (interaction.user.id === lfgData.author.id) {
                    return await interaction.reply({
                        content: '募集者は離脱できません。募集を削除するには `/lfg delete` を使用してください。',
                        flags: 64
                    });
                }

                // 参加していない場合
                if (!lfgData.currentPlayers.some(p => p.user.id === interaction.user.id)) {
                    return await interaction.reply({
                        content: 'この募集に参加していません。',
                        flags: 64
                    });
                }

                // 参加者から削除
                lfgData.currentPlayers = lfgData.currentPlayers.filter(p => p.user.id !== interaction.user.id);

                // Embedを更新
                const embed = new EmbedBuilder()
                    .setTitle('🎮 Valorant 募集')
                    .setColor(0xFD4556)
                    .setAuthor({
                        name: lfgData.author.tag,
                        iconURL: lfgData.author.displayAvatarURL()
                    })
            
            const embedFields = [
                { name: 'ゲームモード', value: lfgData.mode, inline: true },
                { name: 'ランク帯', value: lfgData.rank, inline: true },
                { name: '募集人数', value: `${lfgData.currentPlayers.length}/${lfgData.totalPlayers}人`, inline: true },
                { name: '開始時間', value: lfgData.startTimeText || '未設定', inline: true }
            ];

            // 「今から」の場合のみボイスチャンネルを表示
            if (lfgData.timeOption === 'now' && lfgData.voiceChannelId) {
                embedFields.push({ name: 'ボイスチャンネル', value: `<#${lfgData.voiceChannelId}>`, inline: true });
            }

            // 参加者リストを作成
            const participantsList = lfgData.currentPlayers.map(p => {
                const lfgCommand = require('../commands/lfg.js');
                const roleText = p.preferredRole ? ` (${lfgCommand.getRoleEmoji(p.preferredRole)} ${lfgCommand.getRoleName(p.preferredRole)}希望)` : '';
                return `<@${p.user.id}>${roleText}`;
            }).join('\n');

            embedFields.push(
                { name: '説明', value: lfgData.description, inline: false },
                { name: '参加者', value: participantsList || 'なし', inline: false }
            );

            embed.addFields(...embedFields)
                    .setTimestamp()
                    .setFooter({ text: `募集ID: ${lfgId}` });

                await interaction.update({ embeds: [embed] });

            } else if (action === 'end') {
                // 募集者のみ終了できる
                if (interaction.user.id !== lfgData.author.id) {
                    return await interaction.reply({
                        content: '募集者のみが募集を終了できます。',
                        flags: 64
                    });
                }

                // 募集終了のEmbed作成
                const endEmbed = new EmbedBuilder()
                    .setTitle('🔒 Valorant 募集【終了】')
                    .setColor(0x999999)
                    .setAuthor({
                        name: lfgData.author.tag,
                        iconURL: lfgData.author.displayAvatarURL()
                    })
            
            const embedFields = [
                { name: 'ゲームモード', value: lfgData.mode, inline: true },
                { name: 'ランク帯', value: lfgData.rank, inline: true },
                { name: '最終人数', value: `${lfgData.currentPlayers.length}/${lfgData.totalPlayers}人`, inline: true },
                { name: '開始時間', value: lfgData.startTimeText || '未設定', inline: true }
            ];

            // 「今から」の場合のみボイスチャンネルを表示
            if (lfgData.timeOption === 'now' && lfgData.voiceChannelId) {
                embedFields.push({ name: 'ボイスチャンネル', value: `<#${lfgData.voiceChannelId}>`, inline: true });
            }

            // 参加者リストを作成（終了時）
            const finalParticipantsList = lfgData.currentPlayers.map(p => {
                const roleText = p.preferredRole ? ` (${this.getRoleEmoji(p.preferredRole)} ${this.getRoleName(p.preferredRole)}希望)` : '';
                return `<@${p.user.id}>${roleText}`;
            }).join('\n');

            embedFields.push(
                { name: '説明', value: lfgData.description, inline: false },
                { name: '参加者', value: finalParticipantsList || 'なし', inline: false },
                { name: 'ステータス', value: '**この募集は終了しました**', inline: false }
            );

            endEmbed.addFields(...embedFields)
                    .setTimestamp()
                    .setFooter({ text: `募集ID: ${lfgId}` });

                // ボタンを無効化
                const disabledRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`lfg_join_${lfgId}`)
                            .setLabel('参加する')
                            .setStyle(ButtonStyle.Success)
                            .setEmoji('✅')
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId(`lfg_join_role_${lfgId}`)
                            .setLabel('ロール希望で参加')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('🎯')
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId(`lfg_leave_${lfgId}`)
                            .setLabel('キャンセル')
                            .setStyle(ButtonStyle.Danger)
                            .setEmoji('❌')
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId(`lfg_end_${lfgId}`)
                            .setLabel('募集終了')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('🔒')
                            .setDisabled(true)
                    );

                await interaction.update({
                    embeds: [endEmbed],
                    components: [disabledRow]
                });

                // 募集データを削除
                lfgPosts.delete(authorId);

                // 参加者に終了を通知
                const mentions = lfgData.currentPlayers.map(p => `<@${p.user.id}>`).join(' ');
                await interaction.followUp({
                    content: `${mentions}\n\n募集が終了されました。`,
                });
            }
        }

        // ロール選択の処理
        if (interaction.isStringSelectMenu() && interaction.customId.startsWith('role_select_')) {
            const [, , lfgId, userId] = interaction.customId.split('_');
            
            if (interaction.user.id !== userId) {
                return await interaction.reply({
                    content: 'この選択メニューはあなた用ではありません。',
                    flags: 64
                });
            }

            // 募集データを探す
            let lfgData = null;
            for (const [authorId, data] of lfgPosts.entries()) {
                if (data.id === lfgId) {
                    lfgData = data;
                    break;
                }
            }

            if (!lfgData) {
                return await interaction.reply({
                    content: 'この募集は既に終了しているか、存在しません。',
                    flags: 64
                });
            }

            // 満員チェック
            if (lfgData.currentPlayers.length >= lfgData.totalPlayers) {
                return await interaction.reply({
                    content: 'この募集は既に満員です。',
                    flags: 64
                });
            }

            const selectedRole = interaction.values[0];

            // 参加者を追加
            lfgData.currentPlayers.push({
                user: interaction.user,
                preferredRole: selectedRole
            });

            // 「今から」の募集でVCが指定されている場合、参加者を自動移動
            if (lfgData.timeOption === 'now' && lfgData.voiceChannelId) {
                try {
                    const member = await interaction.guild.members.fetch(interaction.user.id);
                    if (member.voice.channel) {
                        const voiceChannel = await interaction.guild.channels.fetch(lfgData.voiceChannelId);
                        if (voiceChannel) {
                            await member.voice.setChannel(voiceChannel);
                        }
                    }
                } catch (error) {
                    console.error('参加者のVC移動に失敗:', error);
                }
            }

            // Embedを更新
            const embed = new EmbedBuilder()
                .setTitle('🎮 Valorant 募集')
                .setColor(0xFD4556)
                .setAuthor({
                    name: lfgData.author.tag,
                    iconURL: lfgData.author.displayAvatarURL()
                });

            const embedFields = [
                { name: 'ゲームモード', value: lfgData.mode, inline: true },
                { name: 'ランク帯', value: lfgData.rank, inline: true },
                { name: '募集人数', value: `${lfgData.currentPlayers.length}/${lfgData.totalPlayers}人`, inline: true },
                { name: '開始時間', value: lfgData.startTimeText || '未設定', inline: true }
            ];

            // 「今から」の場合のみボイスチャンネルを表示
            if (lfgData.timeOption === 'now' && lfgData.voiceChannelId) {
                embedFields.push({ name: 'ボイスチャンネル', value: `<#${lfgData.voiceChannelId}>`, inline: true });
            }

            // 参加者リストを作成
            const participantsList = lfgData.currentPlayers.map(p => {
                const lfgCommand = require('../commands/lfg.js');
                const roleText = p.preferredRole ? ` (${lfgCommand.getRoleEmoji(p.preferredRole)} ${lfgCommand.getRoleName(p.preferredRole)}希望)` : '';
                return `<@${p.user.id}>${roleText}`;
            }).join('\n');

            embedFields.push(
                { name: '説明', value: lfgData.description, inline: false },
                { name: '参加者', value: participantsList || 'なし', inline: false }
            );

            embed.addFields(...embedFields)
                .setTimestamp()
                .setFooter({ text: `募集ID: ${lfgId}` });

            // 満員になった場合
            if (lfgData.currentPlayers.length >= lfgData.totalPlayers) {
                embed.setColor(0x00FF00);
                embed.setTitle('🎮 Valorant 募集【満員】');
            }

            // 元のメッセージを更新
            const originalMessage = await interaction.channel.messages.fetch(lfgData.messageId);
            await originalMessage.edit({ embeds: [embed] });

            const lfgCommand = require('../commands/lfg.js');
            await interaction.reply({
                content: `✅ ${lfgCommand.getRoleEmoji(selectedRole)} ${lfgCommand.getRoleName(selectedRole)}希望で募集に参加しました！`,
                flags: 64
            });

            // 満員になったら通知
            if (lfgData.currentPlayers.length >= lfgData.totalPlayers) {
                await interaction.followUp({
                    content: `<@${lfgData.author.id}> 募集が満員になりました！`,
                });
            }
        }
    },

};