const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const { lfgPosts } = require('../utils/lfgStore');

// Valorantのロール
const valorantRoles = [
    { name: 'Duelist', emoji: '⚔️', description: 'アタッカー' },
    { name: 'Initiator', emoji: '🔍', description: 'イニシエーター' },
    { name: 'Controller', emoji: '🛡️', description: 'コントローラー' },
    { name: 'Sentinel', emoji: '🏰', description: 'センチネル' }
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('randomroll')
        .setDescription('VCのメンバーにValorantのロールをランダムで割り振ります')
        .addChannelOption(option =>
            option.setName('voice')
                .setDescription('ロール分けするボイスチャンネル')
                .setRequired(true)
                .addChannelTypes(2)), // ChannelType.GuildVoice

    async execute(client, interaction) {
        const voiceChannel = interaction.options.getChannel('voice');

        // VCにいるメンバーを取得
        const vcChannel = await interaction.guild.channels.fetch(voiceChannel.id);
        if (!vcChannel) {
            return await interaction.reply({
                content: '指定されたボイスチャンネルが見つかりません。',
                ephemeral: true
            });
        }

        const vcMembers = Array.from(vcChannel.members.values())
            .filter(member => !member.user.bot); // BOTを除外

        if (vcMembers.length < 5) {
            return await interaction.reply({
                content: `ロール分けには最低5人必要です。現在VC人数: ${vcMembers.length}人`,
                ephemeral: true
            });
        }

        // 5人ちょうどの場合は即座にロール分け
        if (vcMembers.length === 5) {
            return await this.performRoleAssignment(interaction, vcMembers);
        }

        // 6人以上の場合は不参加者選択
        if (vcMembers.length >= 6) {
            const selectOptions = vcMembers.map(member => ({
                label: member.displayName,
                value: member.id,
                description: `${member.user.username}を不参加にする`
            }));

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('exclude_members')
                .setPlaceholder('不参加者を選択してください')
                .setMinValues(vcMembers.length - 5)
                .setMaxValues(vcMembers.length - 5)
                .addOptions(selectOptions);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            const embed = new EmbedBuilder()
                .setTitle('🎲 Random Roll - 不参加者選択')
                .setColor(0xFD4556)
                .setDescription(`VC人数: ${vcMembers.length}人\n5人でロール分けを行います。**${vcMembers.length - 5}人**の不参加者を選択してください。`)
                .addFields({
                    name: 'VCメンバー',
                    value: vcMembers.map(m => `• ${m.displayName}`).join('\n'),
                    inline: false
                });

            const response = await interaction.reply({
                embeds: [embed],
                components: [row],
                ephemeral: true
            });

            try {
                const selectInteraction = await response.awaitMessageComponent({
                    componentType: ComponentType.StringSelect,
                    time: 60000
                });

                const excludedIds = selectInteraction.values;
                const participatingMembers = vcMembers.filter(member => !excludedIds.includes(member.id));

                await selectInteraction.update({
                    embeds: [embed.setDescription('参加者が決定しました。ロール分けを実行します...')],
                    components: []
                });

                return await this.performRoleAssignment(interaction, participatingMembers, true);

            } catch (error) {
                await interaction.editReply({
                    content: '時間内に選択されませんでした。',
                    embeds: [],
                    components: []
                });
            }
        }
    },

    async performRoleAssignment(interaction, participants, isFollowUp = false) {
        // 参加者をシャッフル
        const shuffledParticipants = [...participants].sort(() => Math.random() - 0.5);
        
        // ロールをシャッフル
        const shuffledRoles = [...valorantRoles].sort(() => Math.random() - 0.5);

        // 各ロール1人ずつ + ランダムロール1人を割り当て
        const assignments = [];
        
        // 基本4ロールをランダムに割り当て
        for (let i = 0; i < 4; i++) {
            assignments.push({
                player: shuffledParticipants[i],
                role: shuffledRoles[i]
            });
        }

        // 5人目にランダムロールを割り当て
        const randomRole = valorantRoles[Math.floor(Math.random() * valorantRoles.length)];
        assignments.push({
            player: shuffledParticipants[4],
            role: randomRole,
            isRandom: true
        });

        // 結果のEmbedを作成
        const embed = new EmbedBuilder()
            .setTitle('🎲 Random Roll - ロール割り振り結果')
            .setColor(0xFD4556)
            .setDescription(`<#${vcChannel.id}> メンバー（5人）のロール分け`)
            .setTimestamp();

        // ロール割り振りを表示
        let roleAssignmentText = '';
        assignments.forEach((assignment, index) => {
            const randomText = assignment.isRandom ? ' 🎲' : '';
            roleAssignmentText += `**${assignment.player.displayName}**: ${assignment.role.emoji} ${assignment.role.name}${randomText}\n`;
        });

        embed.addFields(
            { name: '🎯 ロール割り振り結果', value: roleAssignmentText, inline: false },
            { name: '📝 説明', value: '各ロール1人ずつ + 5人目はランダムロール 🎲', inline: false },
            { name: '🔊 ボイスチャンネル', value: `<#${vcChannel.id}>`, inline: false }
        );

        if (isFollowUp) {
            await interaction.followUp({
                embeds: [embed]
            });
        } else {
            await interaction.reply({
                embeds: [embed]
            });
        }
    }
};