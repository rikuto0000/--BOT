const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { lfgPosts } = require('../utils/lfgStore');

// Valorantのランク
const ranks = [
    { name: 'なんでも', value: 'any' },
    { name: 'アイアン', value: 'iron' },
    { name: 'ブロンズ', value: 'bronze' },
    { name: 'シルバー', value: 'silver' },
    { name: 'ゴールド', value: 'gold' },
    { name: 'プラチナ', value: 'platinum' },
    { name: 'ダイヤモンド', value: 'diamond' },
    { name: 'アセンダント', value: 'ascendant' },
    { name: 'イモータル', value: 'immortal' },
    { name: 'レディアント', value: 'radiant' }
];

// ゲームモード
const gameModes = [
    { name: 'コンペティティブ', value: 'competitive' },
    { name: 'アンレート', value: 'unrated' },
    { name: 'スパイクラッシュ', value: 'spikerush' },
    { name: 'デスマッチ', value: 'deathmatch' },
    { name: 'エスカレーション', value: 'escalation' },
    { name: 'レプリケーション', value: 'replication' },
    { name: 'カスタム', value: 'custom' }
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lfg')
        .setDescription('Valorantの募集を作成します')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('新しい募集を作成します')
                .addStringOption(option =>
                    option.setName('mode')
                        .setDescription('ゲームモード')
                        .setRequired(true)
                        .addChoices(...gameModes))
                .addStringOption(option =>
                    option.setName('rank')
                        .setDescription('募集ランク帯')
                        .setRequired(true)
                        .addChoices(...ranks))
                .addStringOption(option =>
                    option.setName('players')
                        .setDescription('募集タイプ')
                        .setRequired(true)
                        .addChoices(
                            { name: 'デュオ（2人）', value: 'duo' },
                            { name: 'トリオ（3人）', value: 'trio' },
                            { name: 'フルパ（5人）', value: 'full' },
                            { name: 'カスタム（10人）', value: 'custom' }
                        ))
                .addStringOption(option =>
                    option.setName('time')
                        .setDescription('開始時間')
                        .setRequired(true)
                        .addChoices(
                            { name: '今から', value: 'now' },
                            { name: '時刻指定', value: 'time' },
                            { name: '日付指定', value: 'date' }
                        ))
                .addChannelOption(option =>
                    option.setName('voice')
                        .setDescription('使用するボイスチャンネル（今からを選んだ場合のみ必要）')
                        .setRequired(false)
                        .addChannelTypes(2)) // ChannelType.GuildVoice
                .addStringOption(option =>
                    option.setName('customtime')
                        .setDescription('時刻（例: 15:30）※時刻指定の場合のみ')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('customdate')
                        .setDescription('日付と時刻（例: 12/25 20:00、2024/1/1 15:30）※日付指定の場合のみ')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('description')
                        .setDescription('募集の説明（任意）')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('現在の募集一覧を表示します'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('自分の募集を削除します')),

    async execute(client, interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'create') {
            const mode = interaction.options.getString('mode');
            const rank = interaction.options.getString('rank');
            const playersType = interaction.options.getString('players');
            const timeOption = interaction.options.getString('time');
            const voiceChannel = interaction.options.getChannel('voice');
            const customTime = interaction.options.getString('customtime');
            const customDate = interaction.options.getString('customdate');
            const description = interaction.options.getString('description') || 'なし';
            const userId = interaction.user.id;

            // 募集タイプから人数を決定
            const playerCounts = {
                'duo': 2,
                'trio': 3,
                'full': 5,
                'custom': 10
            };
            const totalPlayers = playerCounts[playersType];
            const playersNeeded = totalPlayers - 1; // 自分を除いた必要人数

            // 既に募集を作成しているか確認
            if (lfgPosts.has(userId)) {
                return await interaction.reply({
                    content: '既に募集を作成しています。新しい募集を作成する前に、現在の募集を削除してください。',
                    flags: 64
                });
            }

            // 「今から」の場合、VCが必要
            if (timeOption === 'now' && !voiceChannel) {
                return await interaction.reply({
                    content: '「今から」を選んだ場合は、ボイスチャンネルを指定してください',
                    flags: 64
                });
            }

            // 時刻指定の場合、入力をチェック
            if (timeOption === 'time' && !customTime) {
                return await interaction.reply({
                    content: '時刻指定を選んだ場合は、開始時刻を入力してください（例: 15:30）',
                    flags: 64
                });
            }

            // 日付指定の場合、入力をチェック
            if (timeOption === 'date' && !customDate) {
                return await interaction.reply({
                    content: '日付指定を選んだ場合は、日付と時刻を入力してください（例: 12/25 20:00、2024/1/1 15:30）',
                    flags: 64
                });
            }

            // 開始時刻を計算
            let startTime = null;
            let startTimeText = '今から';
            
            if (timeOption === 'time') {
                // 時刻入力のバリデーション
                const timeRegex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
                if (!timeRegex.test(customTime)) {
                    return await interaction.reply({
                        content: '時刻の形式が正しくありません。HH:MM形式で入力してください（例: 15:30、9:00、22:45）',
                        flags: 64
                    });
                }

                // 現在の日付で指定時刻を作成
                const [hours, minutes] = customTime.split(':').map(Number);
                const now = new Date();
                startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
                
                // 過去の時刻の場合は翌日に設定
                if (startTime < now) {
                    startTime.setDate(startTime.getDate() + 1);
                    startTimeText = `明日 ${customTime}`;
                } else {
                    startTimeText = customTime;
                }
                
            } else if (timeOption === 'date') {
                // 日付時刻入力のバリデーション
                const dateTimeRegex1 = /^(\d{1,2})\/(\d{1,2})\s+([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/; // MM/DD HH:MM
                const dateTimeRegex2 = /^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/; // YYYY/MM/DD HH:MM
                
                let targetDate = null;
                const now = new Date();
                
                if (dateTimeRegex1.test(customDate)) {
                    const [, month, day, hours, minutes] = customDate.match(dateTimeRegex1);
                    targetDate = new Date(now.getFullYear(), parseInt(month) - 1, parseInt(day), parseInt(hours), parseInt(minutes));
                    
                    // 過去の日付の場合は翌年に設定
                    if (targetDate < now) {
                        targetDate.setFullYear(targetDate.getFullYear() + 1);
                    }
                    
                } else if (dateTimeRegex2.test(customDate)) {
                    const [, year, month, day, hours, minutes] = customDate.match(dateTimeRegex2);
                    targetDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hours), parseInt(minutes));
                    
                } else {
                    return await interaction.reply({
                        content: '日付時刻の形式が正しくありません。「MM/DD HH:MM」または「YYYY/MM/DD HH:MM」形式で入力してください\\n（例: 12/25 20:00、2024/1/1 15:30）',
                        flags: 64
                    });
                }
                
                if (targetDate < now) {
                    return await interaction.reply({
                        content: '指定された日時が過去になっています。未来の日時を指定してください。',
                        flags: 64
                    });
                }
                
                startTime = targetDate;
                const month = targetDate.getMonth() + 1;
                const day = targetDate.getDate();
                const hours = targetDate.getHours();
                const minutes = targetDate.getMinutes();
                startTimeText = `${month}/${day} ${hours}:${minutes.toString().padStart(2, '0')}`;
            }

            // 募集IDを生成
            const lfgId = Date.now().toString();

            // 募集データを作成
            const lfgData = {
                id: lfgId,
                author: interaction.user,
                mode: gameModes.find(m => m.value === mode).name,
                rank: ranks.find(r => r.value === rank).name,
                playersType: playersType,
                totalPlayers: totalPlayers,
                playersNeeded: playersNeeded,
                currentPlayers: [],
                description: description,
                timeOption: timeOption,
                startTime: startTime,
                startTimeText: startTimeText,
                voiceChannelId: voiceChannel ? voiceChannel.id : null,
                voiceChannelName: voiceChannel ? voiceChannel.name : null,
                createdAt: new Date(),
                messageId: null
            };

            // 募集Embedを作成
            const embed = new EmbedBuilder()
                .setTitle('🎮 Valorant 募集')
                .setColor(0xFD4556)
                .setAuthor({
                    name: interaction.user.tag,
                    iconURL: interaction.user.displayAvatarURL()
                })
            const embedFields = [
                { name: 'ゲームモード', value: lfgData.mode, inline: true },
                { name: 'ランク帯', value: lfgData.rank, inline: true },
                { name: '募集人数', value: `${lfgData.currentPlayers.length}/${lfgData.totalPlayers}人`, inline: true },
                { name: '開始時間', value: startTimeText, inline: true }
            ];

            // 「今から」の場合のみボイスチャンネルを表示
            if (timeOption === 'now' && voiceChannel) {
                embedFields.push({ name: 'ボイスチャンネル', value: `<#${voiceChannel.id}>`, inline: true });
            }

            embedFields.push(
                { name: '説明', value: description, inline: false },
                { name: '参加者', value: 'なし（参加ボタンから参加してください）', inline: false }
            );

            embed.addFields(...embedFields)
                .setTimestamp()
                .setFooter({ text: `募集ID: ${lfgId}` });

            // ボタンを作成
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`lfg_join_${lfgId}`)
                        .setLabel('参加する')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('✅'),
                    new ButtonBuilder()
                        .setCustomId(`lfg_join_role_${lfgId}`)
                        .setLabel('ロール希望で参加')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🎯'),
                    new ButtonBuilder()
                        .setCustomId(`lfg_leave_${lfgId}`)
                        .setLabel('キャンセル')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('❌'),
                    new ButtonBuilder()
                        .setCustomId(`lfg_end_${lfgId}`)
                        .setLabel('募集終了')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('🔒')
                );

            const message = await interaction.reply({
                embeds: [embed],
                components: [row],
                withResponse: true
            });

            // メッセージIDを保存
            lfgData.messageId = message.id;
            lfgPosts.set(userId, lfgData);

            // 「今から」の場合、募集者を指定されたVCに移動
            if (timeOption === 'now' && voiceChannel) {
                try {
                    const member = await interaction.guild.members.fetch(interaction.user.id);
                    if (member.voice.channel) {
                        await member.voice.setChannel(voiceChannel);
                        await interaction.followUp({
                            content: `🔊 <#${voiceChannel.id}> に移動しました。参加者も自動的にこのチャンネルに移動されます。`,
                            flags: 64
                        });
                    } else {
                        await interaction.followUp({
                            content: `🔊 募集が作成されました。<#${voiceChannel.id}> に移動してください。\n参加者は自動的にこのチャンネルに移動されます。`,
                            flags: 64
                        });
                    }
                } catch (error) {
                    console.error('VC移動に失敗:', error);
                }
            }

        } else if (subcommand === 'list') {
            if (lfgPosts.size === 0) {
                return await interaction.reply({
                    content: '現在、募集はありません。',
                    flags: 64
                });
            }

            const embed = new EmbedBuilder()
                .setTitle('📋 現在の募集一覧')
                .setColor(0xFD4556)
                .setTimestamp();

            lfgPosts.forEach((lfg) => {
                embed.addFields({
                    name: `${lfg.mode} | ${lfg.rank}`,
                    value: `募集者: <@${lfg.author.id}>\n人数: ${lfg.currentPlayers.length}/${lfg.totalPlayers}人\n説明: ${lfg.description}`,
                    inline: false
                });
            });

            await interaction.reply({
                embeds: [embed],
                flags: 64 // MessageFlags.Ephemeral
            });

        } else if (subcommand === 'delete') {
            const userId = interaction.user.id;

            if (!lfgPosts.has(userId)) {
                return await interaction.reply({
                    content: '削除する募集がありません。',
                    flags: 64 // MessageFlags.Ephemeral
                });
            }

            lfgPosts.delete(userId);
            await interaction.reply({
                content: '募集を削除しました。',
                flags: 64 // MessageFlags.Ephemeral
            });
        }
    },

    getRoleEmoji(role) {
        const roleEmojis = {
            'duelist': '⚔️',
            'initiator': '🔍',
            'controller': '🛡️',
            'sentinel': '🏰',
            'any': '🎲'
        };
        return roleEmojis[role] || '❓';
    },

    getRoleName(role) {
        const roleNames = {
            'duelist': 'Duelist',
            'initiator': 'Initiator',
            'controller': 'Controller',
            'sentinel': 'Sentinel',
            'any': 'なんでもOK'
        };
        return roleNames[role] || '不明';
    }
};