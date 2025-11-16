const { Client, GatewayIntentBits, SlashCommandBuilder, Routes, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { pipeline } = require('stream');
const { promisify } = require('util');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

const streamPipeline = promisify(pipeline);

function initializeBot(app, dbPool, port) {
    const {
        DISCORD_CLIENT_ID,
        DISCORD_BOT_TOKEN,
        DISCORD_GUILD_ID,
        DISCORD_ADMIN_BOT_CHANNEL,
        DISCORD_ROLE_IDS,
        TEAM_COLORS
    } = app.locals.config;

    const bot = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
        ],
    });

    bot.once('clientReady', () => {
        console.log(`Discord bot logged in as ${bot.user.tag}!`);
        app.locals.bot = bot;

        // Helper to map hex codes to colored square emojis
        const colorToEmoji = (hex) => {
            const simpleColors = {
                '#FF6B6B': '🟥', '#FFD93D': '🟨', '#6BCB77': '🟩', '#4D96FF': '🟦',
                '#9B59B6': '🟪', '#F7A072': '🟧', '#3498DB': '🟦', '#2ECC71': '🟩',
                '#F1C40F': '🟨', '#E74C3C': '🟥', '#1ABC9C': '🟩', '#E67E22': '🟧',
                '#54A0FF': '🟦', '#576574': '⬛', '#222F3E': '⬛', '#FECA57': '🟨',
                '#AEC6CF': '⬜', '#B39EB5': '🟪', '#FFDAB9': '🟧', '#C1E1C1': '🟩',
            };
            return simpleColors[hex.toUpperCase()] || '🎨';
        };

        // Register slash commands
        (async () => {
            try {
                const guild = await bot.guilds.fetch(DISCORD_GUILD_ID);
                if (!guild) {
                    console.error(`Could not find guild with ID ${DISCORD_GUILD_ID}`);
                    return;
                }

                const [teamsWithRoles] = await dbPool.query('SELECT role_id FROM Teams WHERE role_id IS NOT NULL');
                const roleIds = teamsWithRoles.map(t => t.role_id);

                const usedColors = new Set();
                for (const roleId of roleIds) {
                    try {
                        const role = await guild.roles.fetch(roleId);
                        if (role && role.color) {
                            const hexColor = '#' + role.color.toString(16).padStart(6, '0').toUpperCase();
                            usedColors.add(hexColor);
                        }
                    } catch (err) {
                        console.warn(`Could not fetch role ${roleId} to check color. It might have been deleted.`);
                    }
                }

                const availableColors = TEAM_COLORS.filter(color => !usedColors.has(color.toUpperCase()));

                const dynamicChangeColorCommand = new SlashCommandBuilder()
                    .setName('changecolor')
                    .setDescription('Captains can change their team\'s Discord role color.')
                    .addStringOption(option =>
                        option.setName('color')
                            .setDescription('The new color for your team role (hex code).')
                            .setRequired(true)
                            .addChoices(...availableColors.map(color => ({ name: `${colorToEmoji(color)} ${color}`, value: color }))));

                const changeTeamNameCommand = new SlashCommandBuilder()
                    .setName('changeteamname')
                    .setDescription("Captains can change their team's name.")
                    .addStringOption(option =>
                        option.setName('newname')
                            .setDescription('The new name for your team.')
                            .setRequired(true));

                const setTeamLogoCommand = new SlashCommandBuilder()
                    .setName('setteamlogo')
                    .setDescription("Captains can set their team's logo.")
                    .addAttachmentOption(option =>
                        option.setName('logo')
                            .setDescription('The image file for your team logo (PNG, JPG, GIF).')
                            .setRequired(true));

                const addPlayerCommand = new SlashCommandBuilder()
                    .setName('addplayer')
                    .setDescription('Request to add a player to your team.')
                    .addUserOption(option =>
                        option.setName('player')
                            .setDescription('The player you want to add.')
                            .setRequired(true));

                const killersCommand = new SlashCommandBuilder()
                    .setName('killers')
                    .setDescription('Lists all killers with their art and allowed status.');

                const setKillerStatusCommand = new SlashCommandBuilder()
                    .setName('setkillerstatus')
                    .setDescription('Enable or disable a killer.')
                    .addStringOption(option =>
                        option.setName('killer')
                            .setDescription('The name of the killer to update.')
                            .setRequired(true)
                            .setAutocomplete(true))
                    .addBooleanOption(option =>
                        option.setName('allowed')
                            .setDescription('Whether the killer is allowed or not.')
                            .setRequired(true));

                const createMissingVoiceChannelsCommand = new SlashCommandBuilder()
                    .setName('createmissingvoicechannels')
                    .setDescription('Staff: Creates voice channels for teams that are missing them.')
                    .setDefaultMemberPermissions(0); // Only for admins/staff

                const dynamicCommands = [dynamicChangeColorCommand.toJSON(), changeTeamNameCommand.toJSON(), setTeamLogoCommand.toJSON(), addPlayerCommand.toJSON(), killersCommand.toJSON(), setKillerStatusCommand.toJSON(), createMissingVoiceChannelsCommand.toJSON()];

                const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN);
                console.log('Started refreshing application (/) commands.');

                await rest.put(
                    Routes.applicationCommands(DISCORD_CLIENT_ID),
                    { body: [] },
                );

                await rest.put(
                    Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID),
                    { body: dynamicCommands },
                );

                console.log('Successfully reloaded application (/) commands.');
            } catch (error) {
                console.error('Error registering slash commands:', error);
            }
        })();

        app.listen(port, () => {
            console.log(`Server running on http://localhost:${port}`);
        });
    });

    bot.on('interactionCreate', async interaction => {
        if (interaction.isAutocomplete()) {
            const focusedOption = interaction.options.getFocused(true);

            if (focusedOption.name === 'killer') {
                try {
                    const [killers] = await dbPool.query('SELECT killer_name FROM Killers ORDER BY killer_name ASC');
                    const killerNames = killers.map(k => k.killer_name);
                    
                    const filtered = killerNames.filter(choice => choice.toLowerCase().includes(focusedOption.value.toLowerCase())).slice(0, 25);
                    await interaction.respond(
                        filtered.map(choice => ({ name: choice, value: choice })),
                    );
                } catch (error) {
                    console.error('Error fetching killer names for autocomplete:', error);
                    await interaction.respond([]);
                }
            }
            return;
        }

        if (interaction.isModalSubmit()) {
            const [action, ...args] = interaction.customId.split('_');
    
            if (action === 'addplayer-reject-modal') {
                // Acknowledge the modal submission immediately
                await interaction.deferUpdate();
    
                const [captainId, targetId, teamId] = args;
                const reason = interaction.fields.getTextInputValue('rejectionReason');
    
                try {
                    const guild = interaction.guild;
                    const targetMember = await guild.members.fetch(targetId);
    
                    const [teams] = await dbPool.query('SELECT channel_id FROM Teams WHERE team_id = ?', [teamId]);
                    let teamChannel = null;
                    if (teams.length > 0 && teams[0].channel_id) {
                        teamChannel = await guild.channels.fetch(teams[0].channel_id);
                    }
    
                    // Notify in the team channel with the reason
                    if (teamChannel) {
                        const rejectionEmbed = new EmbedBuilder()
                            .setColor('#ED4245') // Red
                            .setTitle('Player Request Rejected')
                            .setDescription(`The request to add ${targetMember.user.username} to the team has been **rejected**.`)
                            .addFields(
                                { name: 'Reason', value: reason }
                            );
                        await teamChannel.send({ content: `<@${captainId}>`, embeds: [rejectionEmbed] });
                    }
    
                    // Update the original staff message
                    const originalEmbed = interaction.message.embeds[0];
                    const updatedEmbed = EmbedBuilder.from(originalEmbed)
                        .setColor('#ED4245') // Red
                        .setTitle('Player Add Request - Rejected')
                        .addFields({ name: 'Reason', value: reason })
                        .setFooter({ text: `Rejected by ${interaction.user.username}` });
    
                    await interaction.editReply({ embeds: [updatedEmbed], components: [] });
    
                } catch (error) {
                    console.error('Error processing rejection modal:', error);
                    await interaction.editReply({ content: 'An error occurred while processing this rejection.', embeds: [], components: [] });
                }
            }
            return;
        }

        if (interaction.isButton()) {
            const [action, ...args] = interaction.customId.split('_');

            if (action.startsWith('killers-')) {
                // This is handled by the message component collector in the /killers command
                return;
            }

            if (!interaction.member.roles.cache.has(DISCORD_ROLE_IDS.STAFF_ROLE_ID)) {
                return interaction.reply({ content: 'You do not have permission to approve or reject requests.', ephemeral: true });
            }

            if (action === 'addplayer-approve' || action === 'addplayer-reject') {
                const [captainId, targetId, teamId] = args;
                let conn;
                try {
                    const guild = interaction.guild;
                    const captain = await guild.members.fetch(captainId);
                    const targetMember = await guild.members.fetch(targetId);

                    if (action === 'addplayer-approve') {
                        // Defer the interaction for the long-running approval process
                        await interaction.deferUpdate();

                        conn = await dbPool.getConnection();
                        await conn.beginTransaction();

                        // Ensure the user exists in the Users table before adding to TeamMembers
                        const [userExists] = await conn.execute('SELECT user_id FROM Users WHERE user_id = ?', [targetId]);
                        if (userExists.length === 0) {
                            await conn.execute('INSERT INTO Users (user_id, username) VALUES (?, ?)', [targetId, targetMember.user.username]);
                        }

                        await conn.execute('INSERT INTO TeamMembers (team_id, user_id) VALUES (?, ?)', [teamId, targetId]);

                        const [teams] = await conn.execute('SELECT role_id, team_name, channel_id FROM Teams WHERE team_id = ?', [teamId]);
                        let teamChannel = null;
                        if (teams.length > 0) {
                            const team = teams[0];
                            if (team.role_id) {
                                const teamRole = await guild.roles.fetch(team.role_id);
                                if (teamRole) {
                                    await targetMember.roles.add(teamRole);
                                }
                            }
                            if (team.channel_id) {
                                teamChannel = await guild.channels.fetch(team.channel_id);
                            }
                        }
                        
                        await conn.commit();

                        // Notify in the team channel instead of DM
                        if (teamChannel) {
                            await teamChannel.send({ content: `<@${captainId}>, your request to add ${targetMember.user.username} to the team has been **approved**!` });
                        }

                        const originalEmbed = interaction.message.embeds[0];
                        const updatedEmbed = EmbedBuilder.from(originalEmbed)
                            .setColor('#57F287')
                            .setTitle('Player Add Request - Approved')
                            .setFooter({ text: `Approved by ${interaction.user.username}` });

                        await interaction.editReply({ embeds: [updatedEmbed], components: [] });

                    } else { // 'addplayer-reject'
                        const modal = new ModalBuilder()
                            .setCustomId(`addplayer-reject-modal_${captainId}_${targetId}_${teamId}`)
                            .setTitle('Reject Player Request');
                        const reasonInput = new TextInputBuilder()
                            .setCustomId('rejectionReason')
                            .setLabel("Please provide a reason for rejection.")
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true);
                        const actionRow = new ActionRowBuilder().addComponents(reasonInput);
                        modal.addComponents(actionRow);
                        await interaction.showModal(modal);
                    }
                } catch (error) {
                    if (conn) await conn.rollback();
                    console.error('Error processing add player request:', error);
                    await interaction.editReply({ content: 'An error occurred while processing this request.', embeds: [], components: [] });
                } finally {
                    if (conn) conn.release();
                }
            }
            return;
        }

        if (!interaction.isChatInputCommand()) return;

        const { commandName } = interaction;

        if (commandName === 'changecolor') {
            const newColor = interaction.options.getString('color');
            const captainUserId = interaction.user.id;

            const member = await interaction.guild.members.fetch(captainUserId);
            if (!member.roles.cache.has(DISCORD_ROLE_IDS.CAPTAIN_ROLE_ID)) {
                return interaction.reply({ content: 'You must be a team captain to use this command.', ephemeral: true });
            }

            if (!TEAM_COLORS.includes(newColor.toUpperCase())) {
                return interaction.reply({ content: 'Invalid color. Please choose from the available colors.', ephemeral: true });
            }

            let conn;
            try {
                conn = await dbPool.getConnection();
                const [teams] = await conn.execute('SELECT team_id, team_name, role_id FROM Teams WHERE captain_id = ?', [captainUserId]);

                if (teams.length === 0) {
                    return interaction.reply({ content: 'You are not a captain of any team.', ephemeral: true });
                }
                const team = teams[0];
                const { team_name, role_id } = team;

                if (!role_id) {
                    return interaction.reply({ content: `Team ${team_name} does not have an associated Discord role.`, ephemeral: true });
                }

                const guild = interaction.guild;
                const discordRole = await guild.roles.fetch(role_id);

                if (!discordRole) {
                    return interaction.reply({ content: `Discord role with ID ${role_id} not found for team ${team_name}.`, ephemeral: true });
                }

                await discordRole.edit({ color: newColor }, `Team color updated by captain ${interaction.user.username} via slash command`);

                const adminChannel = await guild.channels.fetch(DISCORD_ADMIN_BOT_CHANNEL);
                if (adminChannel) {
                    const embed = new EmbedBuilder()
                        .setColor(newColor)
                        .setTitle('Team Color Updated!')
                        .addFields(
                            { name: 'Team Name', value: team_name, inline: true },
                            { name: 'Captain', value: `<@${captainUserId}>`, inline: true },
                            { name: 'New Color', value: newColor, inline: false }
                        )
                        .setTimestamp();
                    await adminChannel.send({ embeds: [embed] });
                }

                await interaction.reply({ content: `Team ${team_name} color updated successfully to ${newColor}.`, ephemeral: false });

            } catch (error) {
                console.error('Error updating team color via slash command:', error);
                await interaction.reply({ content: 'An error occurred while updating your team color.', ephemeral: true });
            } finally {
                if (conn) conn.release();
            }
        } else if (commandName === 'changeteamname') {
            const newTeamName = interaction.options.getString('newname');
            const captainUserId = interaction.user.id;

            const member = await interaction.guild.members.fetch(captainUserId);
            if (!member.roles.cache.has(DISCORD_ROLE_IDS.CAPTAIN_ROLE_ID)) {
                return interaction.reply({ content: 'You must be a team captain to use this command.', ephemeral: true });
            }

            let conn;
            try {
                conn = await dbPool.getConnection();
                await conn.beginTransaction();

                const [teams] = await conn.execute('SELECT team_id, team_name, role_id, channel_id FROM Teams WHERE captain_id = ?', [captainUserId]);

                if (teams.length === 0) {
                    await conn.rollback();
                    return interaction.reply({ content: 'You are not a captain of any team.', ephemeral: true });
                }

                const team = teams[0];
                const { team_id, team_name: oldTeamName, role_id, channel_id } = team;

                await conn.execute('UPDATE Teams SET team_name = ? WHERE team_id = ?', [newTeamName, team_id]);

                const guild = interaction.guild;

                if (role_id) {
                    const role = await guild.roles.fetch(role_id);
                    if (role) await role.edit({ name: newTeamName }, `Team name updated by captain ${interaction.user.username}`);
                }

                if (channel_id) {
                    const channel = await guild.channels.fetch(channel_id);
                    if (channel) await channel.edit({ name: newTeamName }, `Team name updated by captain ${interaction.user.username}`);
                }

                await conn.commit();

                const adminChannel = await guild.channels.fetch(DISCORD_ADMIN_BOT_CHANNEL);
                if (adminChannel) {
                    const embed = new EmbedBuilder()
                        .setColor('#0099ff')
                        .setTitle('Team Name Updated!')
                        .setDescription(`**"${oldTeamName}"** has been renamed to **"${newTeamName}"**`)
                        .addFields({ name: 'Updated By', value: `<@${captainUserId}>`, inline: true })
                        .setTimestamp();
                    await adminChannel.send({ embeds: [embed] });
                }

                await interaction.reply({ content: `Your team name has been successfully updated to "${newTeamName}".`, ephemeral: false });
            } catch (error) {
                if (conn) await conn.rollback();
                console.error('Error updating team name via slash command:', error);
                await interaction.reply({ content: 'An error occurred while updating your team name.', ephemeral: true });
            } finally {
                if (conn) conn.release();
            }
        } else if (commandName === 'setteamlogo') {
            const attachment = interaction.options.getAttachment('logo');
            const captainUserId = interaction.user.id;

            const member = await interaction.guild.members.fetch(captainUserId);
            if (!member.roles.cache.has(DISCORD_ROLE_IDS.CAPTAIN_ROLE_ID)) {
                return interaction.reply({ content: 'You must be a team captain to use this command.', ephemeral: true });
            }

            if (!attachment.contentType || !attachment.contentType.startsWith('image/')) {
                return interaction.reply({ content: 'Please upload a valid image file (PNG, JPG, GIF).', ephemeral: true });
            }

            let conn;
            try {
                conn = await dbPool.getConnection();
                await conn.beginTransaction();

                const [teams] = await conn.execute('SELECT team_id, team_name FROM Teams WHERE captain_id = ?', [captainUserId]);
                if (teams.length === 0) {
                    await conn.rollback();
                    return interaction.reply({ content: 'You are not a captain of any team.', ephemeral: true });
                }
                const team = teams[0];

                const response = await fetch(attachment.url);
                if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);

                const newFilename = `${Date.now()}${path.extname(attachment.name)}`;
                const savePath = path.join(__dirname, '../public/uploads', newFilename);
                const logoUrl = `/public/uploads/${newFilename}`;

                await streamPipeline(response.body, fs.createWriteStream(savePath));

                await conn.execute('UPDATE Teams SET logo_url = ? WHERE team_id = ?', [logoUrl, team.team_id]);

                await conn.commit();

                const adminChannel = await interaction.guild.channels.fetch(DISCORD_ADMIN_BOT_CHANNEL);
                if (adminChannel) {
                    const embed = new EmbedBuilder()
                        .setColor('#5865F2')
                        .setTitle('Team Logo Updated!')
                        .setDescription(`Logo for **${team.team_name}** was updated.`)
                        .addFields({ name: 'Updated By', value: `<@${captainUserId}>`, inline: true })
                        .setThumbnail(attachment.url)
                        .setTimestamp();
                    await adminChannel.send({ embeds: [embed] });
                }

                const replyEmbed = new EmbedBuilder()
                    .setColor('#57F287')
                    .setTitle('Logo Updated Successfully!')
                    .setDescription(`Your team logo has been updated.`)
                    .setThumbnail(attachment.url);

                await interaction.reply({ embeds: [replyEmbed], ephemeral: false });

            } catch (error) {
                if (conn) await conn.rollback();
                console.error('Error updating team logo via slash command:', error);
                await interaction.reply({ content: 'An error occurred while updating your team logo.', ephemeral: true });
            } finally {
                if (conn) conn.release();
            }
        } else if (commandName === 'addplayer') {
            const targetUser = interaction.options.getUser('player');
            const captainUser = interaction.user;

            if (targetUser.id === captainUser.id) {
                return interaction.reply({ content: "You cannot add yourself to your own team.", ephemeral: true });
            }

            let conn;
            try {
                conn = await dbPool.getConnection();

                const [isCaptain] = await conn.execute('SELECT team_id FROM Teams WHERE captain_id = ?', [targetUser.id]);
                if (isCaptain.length > 0) {
                    return interaction.reply({ content: `${targetUser.username} is already a captain of another team and cannot be added.`, ephemeral: true });
                }

                const [isMember] = await conn.execute('SELECT team_id FROM TeamMembers WHERE user_id = ?', [targetUser.id]);
                if (isMember.length > 0) {
                    return interaction.reply({ content: `${targetUser.username} is already on a team and cannot be added.`, ephemeral: true });
                }

                const [captainTeams] = await conn.execute('SELECT team_id, team_name FROM Teams WHERE captain_id = ?', [captainUser.id]);
                if (captainTeams.length === 0) {
                    return interaction.reply({ content: 'You are not the captain of any team.', ephemeral: true });
                }
                const team = captainTeams[0];

                const adminChannel = await interaction.guild.channels.fetch(DISCORD_ADMIN_BOT_CHANNEL);
                if (!adminChannel) {
                    console.error('Admin bot channel not found!');
                    return interaction.reply({ content: 'Could not send request to staff. Please contact an admin.', ephemeral: true });
                }

                const approvalEmbed = new EmbedBuilder()
                    .setColor('#FEE75C')
                    .setTitle('Player Add Request')
                    .setDescription(`${captainUser.username} wants to add a new player to their team.`)
                    .addFields(
                        { name: 'Captain', value: `<@${captainUser.id}>`, inline: true },
                        { name: 'Team', value: team.team_name, inline: true },
                        { name: 'Player to Add', value: `<@${targetUser.id}>`, inline: true }
                    )
                    .setTimestamp();

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`addplayer-approve_${captainUser.id}_${targetUser.id}_${team.team_id}`)
                            .setLabel('Approve')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId(`addplayer-reject_${captainUser.id}_${targetUser.id}_${team.team_id}`)
                            .setLabel('Reject')
                            .setStyle(ButtonStyle.Danger)
                    );
                
                await adminChannel.send({ embeds: [approvalEmbed], components: [row] });

                await interaction.reply({ content: `Your request to add ${targetUser.username} to your team has been sent to the staff for approval.`, ephemeral: true });

            } catch (error) {
                console.error('Error in /addplayer command:', error);
                await interaction.reply({ content: 'An error occurred while processing your request.', ephemeral: true });
            } finally {
                if (conn) conn.release();
            }
        } else if (commandName === 'killers') {
            try {
                // 1. Initial Fetch: Get just the list for the dropdowns
                const [killersList] = await dbPool.query('SELECT killer_id, killer_name, art_url, allowed FROM Killers ORDER BY killer_name ASC');

                if (killersList.length === 0) {
                    return interaction.reply({ content: 'No killers found in the database.', ephemeral: true });
                }

                // Helper: Sorts and formats rules into a string for the Embed
                const formatRules = (rules, targetSource, targetRole) => {
                    if (!rules) return 'None';
                    const filtered = rules.filter(r => r.source === targetSource && r.role === targetRole);
                    if (filtered.length === 0) return 'None';
                    
                    return filtered.map(r => `• **${r.category}:** ${r.text}`).join('\n');
                };

                // Helper: Generates the detailed Embed for a specific killer
                const generateDetailedEmbed = (data) => {
                    const killer = data;
                    const maps = killer.map_priorities || [];
                    const rules = killer.balancing_rules || [];

                    const embed = new EmbedBuilder()
                        .setColor(killer.allowed ? '#00ff00' : '#ff0000') // Green if allowed, Red if banned
                        .setTitle(killer.killer_name)
                        .setDescription(`**Tier:** ${killer.tier_name || 'Unassigned'}\n**Playable:** ${killer.allowed ? '✅ Yes' : '❌ No'}`)
                        .setThumbnail(killer.art_url);

                    // 1. MAPS
                    if (maps.length > 0) {
                        const mapString = maps
                            .sort((a, b) => a.priority - b.priority)
                            .map(m => `**${m.priority}.** ${m.map}`)
                            .join('\n');
                        embed.addFields({ name: '🗺️ Map Priority', value: mapString });
                    }

                    // 2. SPECIFIC BALANCING (Killer)
                    const specificKiller = formatRules(rules, 'Specific', 'Killer');
                    if (specificKiller !== 'None') {
                        embed.addFields({ name: '🔪 Killer Specific Rules', value: specificKiller.substring(0, 1024) });
                    }

                    // 3. SPECIFIC BALANCING (Survivor)
                    const specificSurvivor = formatRules(rules, 'Specific', 'Survivor');
                    if (specificSurvivor !== 'None') {
                        embed.addFields({ name: '🔦 Survivor Rules (vs This Killer)', value: specificSurvivor.substring(0, 1024) });
                    }

                    // 4. TIER BALANCING
                    const tierKiller = formatRules(rules, 'Tier', 'Killer');
                    if (tierKiller !== 'None') {
                        embed.addFields({ name: `⚖️ ${killer.tier_name} Rules (Killer)`, value: tierKiller.substring(0, 1024) });
                    }
                    
                    const tierSurvivor = formatRules(rules, 'Tier', 'Survivor');
                    if (tierSurvivor !== 'None') {
                        embed.addFields({ name: `⚖️ ${killer.tier_name} Rules (Survivor)`, value: tierSurvivor.substring(0, 1024) });
                    }

                    // 5. GENERAL BALANCING (Global + Killer General)
                    // We combine Global rules (like perk limits) and General Killer bans
                    const generalGlobal = formatRules(rules, 'General', 'Global');
                    const generalKiller = formatRules(rules, 'General', 'Killer');
                    
                    let generalText = '';
                    if (generalGlobal !== 'None') generalText += `${generalGlobal}\n`;
                    if (generalKiller !== 'None') generalText += `${generalKiller}`;

                    if (generalText.length > 0) {
                        if (generalText.length < 1024) {
                            embed.addFields({ name: '🌐 General Balancing', value: generalText });
                        } else {
                            // If too long, truncate neatly
                            embed.addFields({ name: '🌐 General Balancing', value: generalText.substring(0, 1020) + '...' });
                        }
                    }

                    return embed;
                };

                // 2. Build Dropdown Menus
                const rows = [];
                const killerChunks = [];
                const MAX_KILLERS_PER_MENU = 25;
                const MAX_MENUS = 5;

                for (let i = 0; i < Math.min(killersList.length, MAX_KILLERS_PER_MENU * MAX_MENUS); i += MAX_KILLERS_PER_MENU) {
                    killerChunks.push(killersList.slice(i, i + MAX_KILLERS_PER_MENU));
                }

                killerChunks.forEach((chunk, chunkIndex) => {
                    const startNumber = chunkIndex * MAX_KILLERS_PER_MENU + 1;
                    const endNumber = startNumber + chunk.length - 1;
                    const selectMenu = new StringSelectMenuBuilder()
                        .setCustomId(`killer-select-${chunkIndex}`)
                        .setPlaceholder(`Select Killer (${startNumber}-${endNumber})`)
                        .addOptions(chunk.map((k) => ({
                            label: k.killer_name,
                            value: k.killer_id,
                            description: k.allowed ? 'Allowed' : 'Banned',
                            emoji: k.allowed ? '✅' : '❌'
                        })));
                    rows.push(new ActionRowBuilder().addComponents(selectMenu));
                });

                // 3. Send Initial Message
                const initialEmbed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('Tournament Killers')
                    .setDescription('Select a killer from the dropdowns below to view their Tier, Maps, and Balancing rules.');

                const message = await interaction.reply({
                    embeds: [initialEmbed],
                    components: rows,
                    withResponse: true 
                });

                // 4. Collector Logic
                const collector = message.resource.message.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 600000 });

                collector.on('collect', async i => {
                    await i.deferUpdate();
                    
                    const selectedKillerId = i.values[0];

                    // 5. RUN THE HEAVY QUERY
                    // We use ? placeholders to prevent "Unknown column" errors
                    const detailedQuery = `
                        SELECT 
                            k.killer_name, k.art_url, t.tier_name, k.allowed,
                            (SELECT JSON_ARRAYAGG(JSON_OBJECT('priority', priority, 'map', map_name))
                            FROM (
                                SELECT km.priority, m.map_name 
                                FROM KillerMaps km 
                                JOIN Maps m ON km.map_id = m.map_id 
                                WHERE km.killer_id = ? 
                                ORDER BY km.priority ASC
                            ) as sorted_maps
                            ) as map_priorities,
                            (SELECT JSON_ARRAYAGG(JSON_OBJECT('source', source, 'role', role, 'category', category, 'text', rule_text))
                            FROM (
                                SELECT 1 as sort_order, 'General' as source, role, category, rule_text FROM TierRules WHERE tier_id = 0
                                UNION ALL
                                SELECT 2, 'Tier', role, category, rule_text FROM TierRules WHERE tier_id = (SELECT tier FROM Killers WHERE killer_id = ?)
                                UNION ALL
                                SELECT 3, 'Specific', role, category, rule_text FROM KillerRules WHERE killer_id = ?
                                ORDER BY sort_order, role, category
                            ) as all_rules
                            ) as balancing_rules
                        FROM Killers k
                        LEFT JOIN Tiers t ON k.tier = t.tier_id
                        WHERE k.killer_id = ?
                    `;

                    try {
                        // Named 'dbResult' to avoid shadowing the 'rows' UI component
                        const [dbResult] = await dbPool.query(detailedQuery, [selectedKillerId, selectedKillerId, selectedKillerId, selectedKillerId]);
                        
                        if (dbResult.length > 0) {
                            const detailedData = dbResult[0];
                            if (typeof detailedData.map_priorities === 'string') detailedData.map_priorities = JSON.parse(detailedData.map_priorities);
                            if (typeof detailedData.balancing_rules === 'string') detailedData.balancing_rules = JSON.parse(detailedData.balancing_rules);

                            await i.editReply({
                                embeds: [generateDetailedEmbed(detailedData)],
                                components: rows 
                            });
                        }
                    } catch (err) {
                        console.error('Error fetching detailed killer info:', err);
                        await i.followUp({ content: 'Failed to fetch killer details.', ephemeral: true });
                    }
                });

                collector.on('end', () => {
                    const disabledRows = rows.map(row => {
                        const menu = row.components[0];
                        menu.setDisabled(true);
                        return new ActionRowBuilder().addComponents(menu);
                    });
                    message.edit({ components: disabledRows }).catch(() => {});
                });

            } catch (error) {
                console.error('Error in /killers command:', error);
                await interaction.reply({ content: 'An error occurred while fetching the killers list.', ephemeral: true });
            }
        } else if (commandName === 'setkillerstatus') {
            if (!interaction.member.roles.cache.has(DISCORD_ROLE_IDS.STAFF_ROLE_ID) && !interaction.member.roles.cache.has(DISCORD_ROLE_IDS.ADMIN_ROLE_ID)) {
                return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
            }

            const killerName = interaction.options.getString('killer');
            const isAllowed = interaction.options.getBoolean('allowed');

            let conn;
            try {
                conn = await dbPool.getConnection();
                const [result] = await conn.execute('UPDATE Killers SET allowed = ? WHERE killer_name = ?', [isAllowed, killerName]);

                if (result.affectedRows === 0) {
                    return interaction.reply({ content: `Killer "${killerName}" not found. Please check the name and try again. Note that killer names are case-sensitive.`, ephemeral: true });
                }

            } finally {
                if (conn) conn.release();
                console.log(`Killer "${killerName}" status updated to ${isAllowed ? 'allowed' : 'not allowed'} by ${interaction.user.username}`);
            }
            return interaction.reply({ content: `Killer "${killerName}" has been successfully updated to ${isAllowed ? 'allowed' : 'not allowed'}.`, ephemeral: false });
        } else if (commandName === 'createmissingvoicechannels') {
            if (!interaction.member.roles.cache.has(DISCORD_ROLE_IDS.STAFF_ROLE_ID) && !interaction.member.roles.cache.has(DISCORD_ROLE_IDS.ADMIN_ROLE_ID)) {
                return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true }); // Defer reply as this might take some time

            let conn;
            try {
                conn = await dbPool.getConnection();
                const guild = interaction.guild;
                const categoryId = '1438912415852007474'; // Same category as text channels

                const [teamsMissingVoice] = await conn.execute(
                    'SELECT team_id, team_name, role_id FROM Teams WHERE channel_id IS NOT NULL AND voice_channel_id IS NULL'
                );

                if (teamsMissingVoice.length === 0) {
                    return interaction.editReply({ content: 'No teams found missing voice channels.' });
                }

                const createdChannels = [];
                for (const team of teamsMissingVoice) {
                    try {
                        const teamRole = await guild.roles.fetch(team.role_id);
                        if (!teamRole) {
                            console.warn(`Role ${team.role_id} not found for team ${team.team_name}. Skipping voice channel creation.`);
                            continue;
                        }

                        const newVoiceChannel = await guild.channels.create({
                            name: `${team.team_name}-voice`,
                            type: 2, // GUILD_VOICE
                            parent: categoryId,
                            permissionOverwrites: [
                                { id: guild.id, deny: ['ViewChannel'] },
                                { id: team.role_id, allow: ['ViewChannel', 'Connect', 'Speak'] },
                            ],
                        });

                        await conn.execute(
                            'UPDATE Teams SET voice_channel_id = ? WHERE team_id = ?',
                            [newVoiceChannel.id, team.team_id]
                        );
                        createdChannels.push(`- **${team.team_name}**: <#${newVoiceChannel.id}>`);
                    } catch (channelError) {
                        console.error(`Error creating voice channel for team ${team.team_name}:`, channelError);
                        createdChannels.push(`- **${team.team_name}**: Failed to create voice channel.`);
                    }
                }

                let replyContent = `**Voice channel creation complete!**\n\n`;
                if (createdChannels.length > 0) {
                    replyContent += `Successfully created/updated voice channels for the following teams:\n${createdChannels.join('\n')}`;
                } else {
                    replyContent += `No new voice channels were created due to errors.`;
                }

                await interaction.editReply({ content: replyContent });

            } catch (error) {
                console.error('Error in /createmissingvoicechannels command:', error);
                await interaction.editReply({ content: 'An error occurred while processing the request.' });
            } finally {
                if (conn) conn.release();
            }
        }
    });

    bot.startPickBan = async function(matchId, initiatingUser) {
        console.log(`Pick/ban process initiated for match ${matchId} by ${initiatingUser.username}`);
        const guild = await bot.guilds.fetch(DISCORD_GUILD_ID);
        if (!guild) {
            console.error(`Could not find guild with ID ${DISCORD_GUILD_ID}`);
            return;
        }

        let conn;
        try {
            conn = await dbPool.getConnection();
            const [matches] = await conn.execute('SELECT team_a_id, team_b_id FROM matchups WHERE match_id = ?', [matchId]);
            if (matches.length === 0) {
                console.error(`Match with ID ${matchId} not found.`);
                return;
            }
            const match = matches[0];

            if (!match.team_a_id || !match.team_b_id) {
                console.error(`Match ${matchId} does not have two teams assigned.`);
                // Optionally, notify the initiating user in Discord
                return;
            }

            const [teamA_rows] = await conn.execute('SELECT team_name, captain_id FROM Teams WHERE team_id = ?', [match.team_a_id]);
            const [teamB_rows] = await conn.execute('SELECT team_name, captain_id FROM Teams WHERE team_id = ?', [match.team_b_id]);

            if (teamA_rows.length === 0 || teamB_rows.length === 0) {
                console.error(`Could not find one or both teams for match ${matchId}.`);
                return;
            }
            const teamA = teamA_rows[0];
            const teamB = teamB_rows[0];

            if (!teamA.captain_id || !teamB.captain_id) {
                console.error(`One or both teams in match ${matchId} do not have a captain.`);
                return;
            }

            const channelName = `${teamA.team_name}-vs-${teamB.team_name}`.toLowerCase().replace(/\s+/g, '-');
            const matchCategory = '1438849202733056133';

            const teamACaptainMember = await guild.members.fetch(teamA.captain_id);
            const teamBCaptainMember = await guild.members.fetch(teamB.captain_id);

            const newChannel = await guild.channels.create({
                name: channelName,
                type: 0, // GUILD_TEXT
                parent: matchCategory,
                permissionOverwrites: [
                    {
                        id: guild.id, // @everyone
                        deny: ['ViewChannel'],
                    },
                    {
                        id: teamACaptainMember.id,
                        allow: ['ViewChannel', 'SendMessages'],
                    },
                    {
                        id: teamBCaptainMember.id,
                        allow: ['ViewChannel', 'SendMessages'],
                    },
                    {
                        id: DISCORD_ROLE_IDS.STAFF_ROLE_ID,
                        allow: ['ViewChannel', 'SendMessages', 'ManageMessages'],
                    },
                     {
                        id: DISCORD_ROLE_IDS.ADMIN_ROLE_ID,
                        allow: ['ViewChannel', 'SendMessages', 'ManageMessages'],
                    }
                ],
            });

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`Match: ${teamA.team_name} vs ${teamB.team_name}`)
                .setDescription('Welcome Captains! The pick and ban phase has begun.')
                .addFields(
                    { name: 'Team A', value: `<@${teamA.captain_id}>`, inline: true },
                    { name: 'Team B', value: `<@${teamB.captain_id}>`, inline: true },
                    { name: 'Instructions', value: 'The interactive pick/ban process will be implemented soon. For now, please coordinate with the staff member who initiated this.' }
                )
                .setFooter({ text: `Match ID: ${matchId} | Initiated by ${initiatingUser.username}` });

            await newChannel.send({ content: `Let the picks and bans begin! <@${teamA.captain_id}>, <@${teamB.captain_id}>`, embeds: [embed] });

        } catch (error) {
            console.error('Error in startPickBan function:', error);
        } finally {
            if (conn) conn.release();
        }
    };

    console.log('Attempting to log in Discord bot...');
    bot.login(DISCORD_BOT_TOKEN).catch(error => {
        console.error('Discord bot login failed:', error);
    });
}

module.exports = { initializeBot };