const { Client, GatewayIntentBits, SlashCommandBuilder, Routes, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, ComponentType, AttachmentBuilder } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { pipeline } = require('stream');
const { promisify } = require('util');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('ws');

const streamPipeline = promisify(pipeline);
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

    bot.pickBanSessions = new Map();

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

                const playerProfileCommand = new SlashCommandBuilder()
                    .setName('player')
                    .setDescription("Get a player's profile, including their team and stats.")
                    .addStringOption(option =>
                        option.setName('player')
                            .setDescription('The player to look up.')
                            .setRequired(true)
                            .setAutocomplete(true));
                
                const editProfileCommand = new SlashCommandBuilder()
                    .setName('editprofile')
                    .setDescription('Update your player profile (platform, region, hours). Must be on a team to use.')
                    .addStringOption(option =>
                        option.setName('platform')
                            .setDescription('The platform you play on.')
                            .setRequired(false)
                            .addChoices(
                                { name: 'PC (Steam)', value: 'PC' },
                                { name: 'PlayStation', value: 'PlayStation' },
                                { name: 'Xbox', value: 'Xbox' },
                                { name: 'Nintendo Switch', value: 'Switch' }
                            ))
                    .addStringOption(option =>
                        option.setName('region')
                            .setDescription('Your competitive region.')
                            .setRequired(false)
                            .addChoices(
                                { name: 'North America (NA)', value: 'NA' },
                                { name: 'Europe (EU)', value: 'EU' },
                                { name: 'South America (SA)', value: 'SA' },
                                { name: 'Asia (AS)', value: 'AS' },
                                { name: 'Oceania (OC)', value: 'OC' }
                            ))
                    .addIntegerOption(option =>
                        option.setName('hours')
                            .setDescription('Your total hours played in the game.')
                            .setRequired(false)
                            .setMinValue(0));
                
                const teamProfileCommand = new SlashCommandBuilder()
                    .setName('team')
                    .setDescription("Get a team's profile, including its roster and player stats.")
                    .addStringOption(option =>
                        option.setName('team')
                            .setDescription('The team to look up.')
                            .setRequired(true)
                            .setAutocomplete(true));

                const startPickBanCommand = new SlashCommandBuilder()
                    .setName('startpickban')
                    .setDescription('Staff: Starts the pick/ban process for the match in this channel.');

                const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN);
                const dynamicCommands = [dynamicChangeColorCommand, changeTeamNameCommand, setTeamLogoCommand, addPlayerCommand, killersCommand, setKillerStatusCommand, createMissingVoiceChannelsCommand, playerProfileCommand, editProfileCommand, teamProfileCommand, startPickBanCommand].map(cmd => cmd.toJSON());
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

        const server = app.listen(port, () => {
            console.log(`Server running on http://localhost:${port}`);
        });

        const wss = new WebSocketServer({ server });
        app.locals.wss = wss;

        wss.on('connection', (ws) => {
            console.log('Client connected to WebSocket');
            ws.on('close', () => {
                console.log('Client disconnected');
            });
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
            } else if (focusedOption.name === 'player') {
                try {
                    // We fetch both username and user_id. We show the username, but the value will be the ID.
                    const [users] = await dbPool.query(`
                        SELECT u.user_id, u.username 
                        FROM Users u
                        JOIN TeamMembers tm ON u.user_id = tm.user_id
                        ORDER BY u.username ASC`);
                    
                    const filtered = users.filter(choice => choice.username.toLowerCase().includes(focusedOption.value.toLowerCase())).slice(0, 25);
                    await interaction.respond(
                        filtered.map(choice => ({ name: choice.username, value: choice.user_id })),
                    );
                } catch (error) {
                    console.error('Error fetching user names for autocomplete:', error);
                    await interaction.respond([]);
                }
            } else if (focusedOption.name === 'team') {
                try {
                    const [teams] = await dbPool.query('SELECT team_name FROM Teams ORDER BY team_name ASC');
                    
                    const filtered = teams.filter(choice => choice.team_name.toLowerCase().includes(focusedOption.value.toLowerCase())).slice(0, 25);
                    await interaction.respond(
                        filtered.map(choice => ({ name: choice.team_name, value: choice.team_name })),
                    );
                } catch (error) {
                    console.error('Error fetching team names for autocomplete:', error);
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


            if (action === 'addplayer-approve' || action === 'addplayer-reject') {
                
                if (!interaction.member.roles.cache.has(DISCORD_ROLE_IDS.STAFF_ROLE_ID)) {
                    return interaction.reply({ content: 'You do not have permission to approve or reject requests.', ephemeral: true });
                }
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
                const [killersList] = await dbPool.query('SELECT killer_id, killer_name, art_url, allowed FROM Killers ORDER BY allowed DESC, killer_order ASC');
                if (killersList.length === 0) {
                    return interaction.reply({ content: 'No killers found in the database.', ephemeral: true });
                }

                const formatRules = (rules, targetSource, targetRole) => {
                    if (!rules) return 'None';
                    const filtered = rules.filter(r => r.source === targetSource && r.role === targetRole);
                    if (filtered.length === 0) return 'None';
                    return filtered.map(rule => {
                        let category = rule.category;
                        let text = rule.text;
                        if (category.toLowerCase().includes('offering')) {
                            const count = (text.match(/,/g) || []).length + 1;
                            category = `Forced Offerings (${count})`;
                        } else if (category.toLowerCase().includes('item')) {
                            category = 'Allowed Items';
                        }
                        if (text.includes(',')) {
                            const items = text.split(',').map(item => `  - ${item.trim()}`);
                            text = '\n' + items.join('\n');
                        }
                        return `• **${category}:** ${text}`;
                    }).join('\n');
                };

                const generatePagedEmbeds = (data) => {
                    const killer = data;
                    const maps = killer.map_priorities || [];
                    const rules = killer.balancing_rules || [];
                    const pages = [];
                    const pageTitles = [];

                    // Page 1: Specific
                    const page1 = new EmbedBuilder()
                        .setColor(killer.allowed ? '#00ff00' : '#ff0000')
                        .setTitle(killer.killer_name)
                        .setDescription(`**Tier:** ${killer.tier_name || 'Unassigned'}\n**Playable:** ${killer.allowed ? '✅ Yes' : '❌ No'}`)
                        .setThumbnail(killer.art_url);
                    if (maps.length > 0) {
                        const mapString = maps.sort((a, b) => a.priority - b.priority).map(m => `**${m.priority}.** ${m.map}`).join('\n');
                        page1.addFields({ name: '🗺️ Map Priority', value: mapString });
                    }
                    const specificKiller = formatRules(rules, 'Specific', 'Killer');
                    if (specificKiller !== 'None') page1.addFields({ name: '🔪 Killer Specific Rules', value: specificKiller.substring(0, 1024) });
                    const specificSurvivor = formatRules(rules, 'Specific', 'Survivor');
                    if (specificSurvivor !== 'None') page1.addFields({ name: '🔦 Survivor Rules (vs This Killer)', value: specificSurvivor.substring(0, 1024) });
                    
                    if (page1.data.fields?.length > 0) {
                        pages.push(page1);
                        pageTitles.push('Specific Rules');
                    }

                    // Page 2: Tier
                    const page2 = new EmbedBuilder()
                        .setColor(killer.allowed ? '#00ff00' : '#ff0000')
                        .setTitle(`${killer.killer_name} - Tier Rules`)
                        .setThumbnail(killer.art_url);

                    const tierKiller = formatRules(rules, 'Tier', 'Killer');
                    const tierSurvivor = formatRules(rules, 'Tier', 'Survivor');
 
                    if (tierKiller !== 'None' || tierSurvivor !== 'None') {
                        if (tierKiller !== 'None') page2.addFields({ name: `⚖️ ${killer.tier_name} Rules (Killer)`, value: tierKiller.substring(0, 1024) });
                        if (tierSurvivor !== 'None') page2.addFields({ name: `⚖️ ${killer.tier_name} Rules (Survivor)`, value: tierSurvivor.substring(0, 1024) });
                        pages.push(page2);
                        pageTitles.push('Tier Rules');
                    }
                    // Page 3: General
                    const page3 = new EmbedBuilder()
                        .setColor(killer.allowed ? '#00ff00' : '#ff0000')
                        .setTitle(`${killer.killer_name} - General Rules`)
                        .setThumbnail(killer.art_url);
                    const generalGlobal = formatRules(rules, 'General', 'Global');
                    const generalKiller = formatRules(rules, 'General', 'Killer');
                    const generalSurvivor = formatRules(rules, 'General', 'Survivor');
                    let killerBalancing = [generalGlobal, generalKiller].filter(r => r !== 'None').join('\n');
                    if (killerBalancing) page3.addFields({ name: '🌐 General Killer Balancing', value: killerBalancing.substring(0, 1024) });
                    if (generalSurvivor !== 'None') page3.addFields({ name: '🌐 General Survivor Balancing', value: generalSurvivor.substring(0, 1024) });

                    if (page3.data.fields?.length > 0) {
                        pages.push(page3);
                        pageTitles.push('General Rules');
                    }

                    if (pages.length === 0) {
                        const defaultPage = new EmbedBuilder()
                            .setColor(killer.allowed ? '#00ff00' : '#ff0000')
                            .setTitle(killer.killer_name)
                            .setDescription(`**Tier:** ${killer.tier_name || 'Unassigned'}\n**Playable:** ${killer.allowed ? '✅ Yes' : '❌ No'}`)
                            .setThumbnail(killer.art_url)
                            .addFields({ name: 'No Rules Found', value: 'This killer has no specific, tier, or general balancing rules assigned.' });
                        pages.push(defaultPage);
                        pageTitles.push('No Rules');
                    }
                    
                    pages.forEach((p, i) => p.setFooter({ text: `Page ${i + 1}/${pages.length}: ${pageTitles[i]}` }));
                    return pages;
                };

                const rows = [];
                const killerChunks = [];
                for (let i = 0; i < killersList.length; i += 25) {
                    killerChunks.push(killersList.slice(i, i + 25));
                }
                killerChunks.forEach((chunk, chunkIndex) => {
                    const selectMenu = new StringSelectMenuBuilder()
                        .setCustomId(`killer-select-${chunkIndex}`)
                        .setPlaceholder(`Select Killer (${chunkIndex * 25 + 1}-${chunkIndex * 25 + chunk.length})`)
                        .addOptions(chunk.map(k => ({ label: k.killer_name, value: k.killer_id, description: k.allowed ? 'Allowed' : 'Banned', emoji: k.allowed ? '✅' : '❌' })));
                    rows.push(new ActionRowBuilder().addComponents(selectMenu));
                });

                const initialEmbed = new EmbedBuilder().setColor('#0099ff').setTitle('Tournament Killers').setDescription('Select a killer from the dropdowns to view their rules.');
                const message = await interaction.reply({ embeds: [initialEmbed], components: rows, ephemeral: false });

                const collector = interaction.channel.createMessageComponentCollector({
                    //filter: i => i.message.id === message.id && (i.isStringSelectMenu() || i.isButton()),
                    time: 900000, // 15 minutes
                    idle: 300000 // 5 minutes
                });

                let currentPages = [];
                let currentPage = 0;
                let selectedKillerId = '';

                collector.on('collect', async i => {
                    await i.deferUpdate();

                    if (i.isStringSelectMenu()) {
                        selectedKillerId = i.values[0];
                        currentPage = 0;
                        
                        const detailedQuery = `
                            SELECT 
                                k.killer_name, k.art_url, t.tier_name, k.allowed,
                                (SELECT JSON_ARRAYAGG(JSON_OBJECT('priority', priority, 'map', map_name)) FROM (SELECT km.priority, m.map_name FROM KillerMaps km JOIN Maps m ON km.map_id = m.map_id WHERE km.killer_id = ? ORDER BY km.priority ASC) as sm) as map_priorities,
                                (SELECT JSON_ARRAYAGG(JSON_OBJECT('source', source, 'role', role, 'category', category, 'text', rule_text)) FROM (SELECT 1 as o, 'General' as source, role, category, rule_text FROM TierRules WHERE tier_id = 0 UNION ALL SELECT 2, 'Tier', role, category, rule_text FROM TierRules WHERE tier_id = (SELECT tier FROM Killers WHERE killer_id = ?) UNION ALL SELECT 3, 'Specific', role, category, rule_text FROM KillerRules WHERE killer_id = ? ORDER BY o, role, category) as ar) as balancing_rules
                            FROM Killers k
                            LEFT JOIN Tiers t ON k.tier = t.tier_id
                            WHERE k.killer_id = ?`;
                        
                        const [dbResult] = await dbPool.query(detailedQuery, [selectedKillerId, selectedKillerId, selectedKillerId, selectedKillerId]);
                        const detailedData = dbResult[0];
                        if (typeof detailedData.map_priorities === 'string') detailedData.map_priorities = JSON.parse(detailedData.map_priorities);
                        if (typeof detailedData.balancing_rules === 'string') detailedData.balancing_rules = JSON.parse(detailedData.balancing_rules);
                        
                        currentPages = generatePagedEmbeds(detailedData);
                    } else if (i.isButton()) {
                        if (i.customId === 'prev_page') {
                            currentPage = Math.max(0, currentPage - 1);
                        } else if (i.customId === 'next_page') {
                            currentPage = Math.min(currentPages.length - 1, currentPage + 1);
                        }
                    }

                    const buttonRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('prev_page').setLabel('◀️ Previous').setStyle(ButtonStyle.Primary).setDisabled(currentPage === 0),
                        new ButtonBuilder().setCustomId('next_page').setLabel('Next ▶️').setStyle(ButtonStyle.Primary).setDisabled(currentPage === currentPages.length - 1)
                    );
                    
                    const allComponents = [...rows];
                    if (currentPages.length > 1) {
                        allComponents.unshift(buttonRow);
                    }

                    await i.editReply({ embeds: [currentPages[currentPage]], components: allComponents });
                });

                collector.on('end', () => {
                    // Edit the original message to remove all components.
                    message.edit({ components: [] }).catch(err => {
                        // Ignore errors if the message was already deleted.
                        if (err.code !== 10008) console.error('Failed to remove components on collector end:', err);
                    });
                });

            } catch (error) {
                console.error('Error in /killers command:', error);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: 'An error occurred while fetching the killers list.', ephemeral: true });
                } else {
                    await interaction.followUp({ content: 'An error occurred while fetching the killers list.', ephemeral: true });
                }
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
        } else if (commandName === 'player') {
            const userId = interaction.options.getString('player');
            let conn;
            try {
                conn = await dbPool.getConnection();
                const [[playerData]] = await conn.execute(
                    `SELECT u.username, u.hours, u.region, u.platform, t.team_name, t.role_id 
                     FROM Users u 
                     LEFT JOIN TeamMembers tm ON u.user_id = tm.user_id 
                     LEFT JOIN Teams t ON tm.team_id = t.team_id 
                      WHERE u.user_id = ?`,
                    [userId]
                );

                if (!playerData) {
                    return interaction.reply({ content: 'Could not find that player in the database.', ephemeral: true });
                }

                const discordUser = await bot.users.fetch(userId);

                let embedColor = '#5865F2'; // Default Discord Blurple
                if (playerData.role_id) {
                    try {
                        const teamRole = await interaction.guild.roles.fetch(playerData.role_id);
                        if (teamRole && teamRole.color) {
                            embedColor = teamRole.color;
                        }
                    } catch (roleError) {
                        console.warn(`Could not fetch role ${playerData.role_id} to get color for player profile.`);
                    }
                }
                const profileEmbed = new EmbedBuilder()
                    .setColor(embedColor)
                    .setTitle(`${playerData.username}'s Profile`)
                    .setThumbnail(discordUser.displayAvatarURL())
                    .addFields(
                        { name: 'Team', value: playerData.team_name || 'Not on a team', inline: true }
                    )
                    .setTimestamp();

                // Add stats only if they are available (not 0 or null)
                if (playerData.hours) {
                    profileEmbed.addFields({ name: 'Hours Played', value: `${playerData.hours}`, inline: true });
                }
                if (playerData.region) {
                    profileEmbed.addFields({ name: 'Region', value: playerData.region, inline: true });
                }
                if (playerData.platform) {
                    profileEmbed.addFields({ name: 'Platform', value: playerData.platform, inline: true });
                }

                await interaction.reply({ embeds: [profileEmbed] });

            } catch (error) {
                console.error('Error in /player command:', error);
                await interaction.reply({ content: 'An error occurred while fetching the player profile.', ephemeral: true });
            } finally {
                if (conn) conn.release();
            }
        } else if (commandName === 'editprofile') {
            const platform = interaction.options.getString('platform');
            const region = interaction.options.getString('region');
            const hours = interaction.options.getInteger('hours');
            const userId = interaction.user.id;

            if (!platform && !region && hours === null) {
                return interaction.reply({ content: 'You must provide at least one option to update.', ephemeral: true });
            }

            let conn;
            try {
                conn = await dbPool.getConnection();

                // 1. Check if the user is on a team
                const [teamMembers] = await conn.execute('SELECT team_id FROM TeamMembers WHERE user_id = ?', [userId]);
                if (teamMembers.length === 0) {
                    return interaction.reply({ content: 'You must be on a team to set your profile stats.', ephemeral: true });
                }

                // 2. Build the update query dynamically
                const updates = [];
                const values = [];
                const changes = [];

                if (platform) {
                    updates.push('`platform` = ?');
                    values.push(platform);
                    changes.push(`**Platform:** ${platform}`);
                }
                if (region) {
                    updates.push('`region` = ?');
                    values.push(region);
                    changes.push(`**Region:** ${region}`);
                }
                if (hours !== null) {
                    updates.push('`hours` = ?');
                    values.push(hours);
                    changes.push(`**Hours:** ${hours}`);
                }

                values.push(userId); // For the WHERE clause

                const sql = `UPDATE Users SET ${updates.join(', ')} WHERE user_id = ?`;
                await conn.execute(sql, values);

                const successEmbed = new EmbedBuilder()
                    .setColor('#57F287') // Green
                    .setTitle('Profile Updated!')
                    .setDescription(`Your profile has been updated with the following information:\n\n${changes.join('\n')}`);

                await interaction.reply({ embeds: [successEmbed], ephemeral: true });

            } catch (error) {
                console.error('Error in /editprofile command:', error);
                await interaction.reply({ content: 'An error occurred while updating your profile.', ephemeral: true });
            } finally {
                if (conn) conn.release();
            }
        } else if (commandName === 'team') {
            const teamName = interaction.options.getString('team');
            let conn;
            try {
                conn = await dbPool.getConnection();

                // 1. Get Team Info, including the new 'color' column
                const [[teamData]] = await conn.execute(
                    'SELECT team_id, team_name, logo_url, role_id, captain_id, color FROM Teams WHERE team_name = ?',
                    [teamName]
                );

                if (!teamData) {
                    return interaction.reply({ content: `Could not find a team named "${teamName}".`, ephemeral: true });
                }

                // 2. Get Team Members and their stats, excluding the captain from this list
                const [members] = await conn.execute(`
                    SELECT u.user_id, u.username, u.hours, u.region, u.platform
                    FROM Users u
                    JOIN TeamMembers tm ON u.user_id = tm.user_id
                    WHERE tm.team_id = ? AND u.user_id != ?
                    ORDER BY u.username ASC
                `, [teamData.team_id, teamData.captain_id]);

                // 3. Get Captain's info
                const [[captain]] = await conn.execute(`
                    SELECT user_id, username, hours, region, platform
                    FROM Users
                    WHERE user_id = ?
                `, [teamData.captain_id]);

                // 4. Build the Embed
                let embedColor = teamData.color || '#5865F2'; // Use DB color, fallback to default
                if (!teamData.color && teamData.role_id) { // If no DB color, try role color
                    try {
                        const teamRole = await interaction.guild.roles.fetch(teamData.role_id);
                        if (teamRole && teamRole.color) embedColor = teamRole.color;
                    } catch (e) { /* ignore if role not found */ }
                }

                const teamEmbed = new EmbedBuilder()
                    .setColor(embedColor)
                    .setTitle(`Team Profile: ${teamData.team_name}`)
                    .setTimestamp();

                let logoAttachment = null;
                if (teamData.logo_url) {
                    const logoFilename = path.basename(teamData.logo_url);
                    const localLogoPath = path.join(__dirname, '..', 'public', 'uploads', logoFilename);

                    if (fs.existsSync(localLogoPath)) {
                        logoAttachment = new AttachmentBuilder(localLogoPath, { name: logoFilename });
                        teamEmbed.setThumbnail(`attachment://${logoFilename}`);
                    } else {
                        console.warn(`Logo file not found for team ${teamData.team_name} at path: ${localLogoPath}`);
                    }
                }

                // Function to format player stats
                const formatPlayer = (player, isCaptain = false) => {
                    const stats = [
                        player.hours ? `**H:** ${player.hours}` : null,
                        player.region ? `**R:** ${player.region}` : null,
                        player.platform ? `**P:** ${player.platform}` : null
                    ].filter(Boolean).join(' | ');
                    return `**${player.username}** ${isCaptain ? '©️' : ''}\n${stats || 'No stats available'}`;
                };

                if (captain) teamEmbed.addFields({ name: 'Captain', value: formatPlayer(captain, true) });
                if (members.length > 0) {
                    teamEmbed.addFields({ name: 'Players', value: members.map(p => formatPlayer(p)).join('\n\n') });
                }

                await interaction.reply({ embeds: [teamEmbed], files: logoAttachment ? [logoAttachment] : [] });
            } catch (error) {
                console.error('Error in /team command:', error);
                await interaction.reply({ content: 'An error occurred while fetching the team profile.', ephemeral: true });
            } finally {
                if (conn) conn.release();
            }
        } else if (commandName === 'startpickban') {
            if (!interaction.member.roles.cache.has(DISCORD_ROLE_IDS.STAFF_ROLE_ID)) {
                return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
            }

            const channelId = interaction.channel.id;
            let conn;
            try {
                conn = await dbPool.getConnection();
                await conn.beginTransaction();

                // Find a pending pick/ban session for this channel
                const [pickBans] = await conn.execute(
                    'SELECT pick_ban_id, match_id FROM PickBans WHERE channel_id = ? AND status = \'PENDING\' ORDER BY created_at DESC LIMIT 1',
                    [channelId]
                );

                if (pickBans.length === 0) {
                    await conn.rollback();
                    return interaction.reply({ content: 'No pending pick/ban session found for this channel.', ephemeral: true });
                }

                const { pick_ban_id, match_id } = pickBans[0];

                // Check if a session entry already exists, if not create one.
                const [sessions] = await conn.execute('SELECT pick_ban_id FROM PickBanSessions WHERE pick_ban_id = ?', [pick_ban_id]);
                if (sessions.length === 0) {
                    await conn.execute(
                        'INSERT INTO PickBanSessions (pick_ban_id, match_id, banned_killers, picked_killers) VALUES (?, ?, ?, ?)',
                        [pick_ban_id, match_id, JSON.stringify([]), JSON.stringify({ team_a: null, team_b: null, tiebreaker: null })]
                    );
                }
                
                // Update the status to IN_PROGRESS
                await conn.execute('UPDATE PickBans SET status = \'IN_PROGRESS\' WHERE pick_ban_id = ?', [pick_ban_id]);

                await conn.commit();

                // Pass the interaction directly to runPickBanProcess.
                // It will be responsible for replying to the interaction.
                await interaction.deferReply();
                bot.runPickBanProcess(interaction, match_id, pick_ban_id);

            } catch (error) {
                if (conn) await conn.rollback();
                console.error('Error in /startpickban command:', error);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: 'An error occurred while trying to start the pick/ban process.', ephemeral: true });
                } else {
                    await interaction.editReply({ content: 'An error occurred while trying to start the pick/ban process.' });
                }
            } finally {
                if (conn) conn.release();
            }
        }
    });

    bot.runPickBanProcess = async function(interaction, matchId, pickBanId) {
        let conn;
        try {
            conn = await dbPool.getConnection();

            // 1. Get all necessary data in parallel
            const [
                [matches],
                [allKillers],
                [sessions]
            ] = await Promise.all([
                conn.execute(`
                    SELECT m.team_a_id, m.team_b_id, 
                           tA.team_name as team_a_name, tA.captain_id as team_a_captain_id,
                           tB.team_name as team_b_name, tB.captain_id as team_b_captain_id
                    FROM Matches m
                    JOIN Teams tA ON m.team_a_id = tA.team_id
                    JOIN Teams tB ON m.team_b_id = tB.team_id
                    WHERE m.match_id = ?
                `, [matchId]),
                conn.execute('SELECT killer_id, killer_name, art_url FROM Killers WHERE allowed = 1 ORDER BY killer_order ASC'),
                conn.execute('SELECT * FROM PickBanSessions WHERE pick_ban_id = ?', [pickBanId])
            ]);

            if (matches.length === 0) throw new Error('Match not found.');
            const match = matches[0];

            // 2. Get or create Pick/Ban session
            let session = sessions[0];
            if (!session) {
                await conn.execute(
                    'INSERT INTO PickBanSessions (pick_ban_id, match_id, banned_killers, picked_killers) VALUES (?, ?, ?, ?)',
                    [pickBanId, matchId, JSON.stringify([]), JSON.stringify({ team_a: null, team_b: null, tiebreaker: null })]
                );
                const [newSessions] = await conn.execute('SELECT * FROM PickBanSessions WHERE pick_ban_id = ?', [pickBanId]);
                session = newSessions[0];
            }

            const bannedKillersList = JSON.parse(session.banned_killers || '[]');
            const pickedKillersData = JSON.parse(session.picked_killers || '{}');

            // 3. Determine available killers
            const pickedIds = Object.values(pickedKillersData).filter(id => id);
            const unavailableIds = new Set([...bannedKillersList, ...pickedIds]);
            let availableKillers = allKillers.filter(k => !unavailableIds.has(k.killer_id));

            // 4. Determine next action
            let nextAction = 'Completed';
            let nextTeamId = null;
            let nextCaptainId = null;
            let actionType = ''; // 'pick' or 'ban'

            if (!pickedKillersData.team_a) {
                actionType = 'pick';
                nextAction = `Team A Pick (${match.team_a_name})`;
                nextTeamId = match.team_a_id;
                nextCaptainId = match.team_a_captain_id;
            } else if (!pickedKillersData.team_b) {
                actionType = 'pick';
                nextAction = `Team B Pick (${match.team_b_name})`;
                nextTeamId = match.team_b_id;
                nextCaptainId = match.team_b_captain_id;
            } else {
                actionType = 'ban';
                if (availableKillers.length > 1) {
                    if (bannedKillersList.length % 2 === 0) { // Team A's turn to ban
                        nextAction = `Team A Ban (${match.team_a_name})`;
                        nextTeamId = match.team_a_id;
                        nextCaptainId = match.team_a_captain_id;
                    } else { // Team B's turn to ban
                        nextAction = `Team B Ban (${match.team_b_name})`;
                        nextTeamId = match.team_b_id;
                        nextCaptainId = match.team_b_captain_id;
                    }
                }
            }

            // 5. Handle automatic tiebreaker selection
            if (availableKillers.length === 1 && !pickedKillersData.tiebreaker) {
                const tiebreakerKiller = availableKillers[0];
                pickedKillersData.tiebreaker = tiebreakerKiller.killer_id;
                await conn.execute('UPDATE PickBanSessions SET picked_killers = ? WHERE pick_ban_id = ?', [JSON.stringify(pickedKillersData), pickBanId]);
                
                availableKillers = [];
                nextAction = 'Completed';
                actionType = '';
            }

            if (nextAction !== 'Completed' && !nextCaptainId) {
                throw new Error(`The next team in the sequence (ID: ${nextTeamId}) does not have a captain assigned. The pick/ban process cannot continue.`);
            }

            // 6. Construct Embed
            const teamAPick = pickedKillersData.team_a ? allKillers.find(k => k.killer_id === pickedKillersData.team_a) : null;
            const teamBPick = pickedKillersData.team_b ? allKillers.find(k => k.killer_id === pickedKillersData.team_b) : null;
            const tiebreaker = pickedKillersData.tiebreaker ? allKillers.find(k => k.killer_id === pickedKillersData.tiebreaker) : null;
            const bannedKillers = bannedKillersList.map(id => allKillers.find(k => k.killer_id === id)).filter(Boolean);

            const embed = new EmbedBuilder()
                .setTitle(`Match: ${match.team_a_name} vs ${match.team_b_name}`)
                .setColor(nextAction === 'Completed' ? '#57F287' : '#FEE75C')
                .addFields(
                    { name: `${match.team_a_name}'s Pick`, value: teamAPick ? `> ${teamAPick.killer_name}` : '> *Waiting...*', inline: true },
                    { name: `${match.team_b_name}'s Pick`, value: teamBPick ? `> ${teamBPick.killer_name}` : '> *Waiting...*', inline: true },
                    { name: 'Tiebreaker', value: tiebreaker ? `> ${tiebreaker.killer_name}` : '> *To be determined...*', inline: true },
                    { name: 'Banned Killers', value: bannedKillers.length > 0 ? bannedKillers.map(k => `> ${k.killer_name}`).join('\n') : '> *None*', inline: false }
                )
                .setFooter({ text: `Match ID: ${matchId}` });

            if (nextAction !== 'Completed') {
                embed.addFields({ name: 'Next Action', value: `**${nextAction}**\nIt's <@${nextCaptainId}>'s turn to **${actionType}** a killer.` });
                
            } else {
                embed.setTitle(`Picks & Bans Complete: ${match.team_a_name} vs ${match.team_b_name}`);
                embed.setDescription('The pick and ban phase is finished. Good luck to both teams!');
                
            }

            // 7. Build Action Row (Dropdown Menu)
            const components = [];
            if (nextAction !== 'Completed' && availableKillers.length > 0) {
                const killerChunks = [];
                for (let i = 0; i < availableKillers.length; i += 25) {
                    killerChunks.push(availableKillers.slice(i, i + 25));
                }

                killerChunks.forEach((chunk, index) => {
                    const selectMenu = new StringSelectMenuBuilder()
                        .setCustomId(`pickban_${actionType}_${matchId}_${nextTeamId}_${index}`)
                        .setPlaceholder(`Select a killer to ${actionType}... (Part ${index + 1})`)
                        .addOptions(chunk.map(k => ({
                            label: k.killer_name,
                            value: k.killer_id.toString()
                        })));
                    components.push(new ActionRowBuilder().addComponents(selectMenu));
                });
            }

            // 8. Send or Edit the message
            // All interactions reaching this function are deferred, so we always edit the reply.
            const replyMessage = await interaction.editReply({ embeds: [embed], components, fetchReply: true });
            console.log(`Updated pick/ban message for match ${matchId}. Next action: ${nextAction}`);
            if (nextAction === 'Completed') {
                // Lock the channel after a delay
                setTimeout(async () => {
                    try {
                        console.log(`Locking channel for match ${matchId} after 1 minute.`);
                        const guild = interaction.guild;
                        const teamACaptainMember = await guild.members.fetch(match.team_a_captain_id);
                        const teamBCaptainMember = await guild.members.fetch(match.team_b_captain_id);
                        
                        await interaction.channel.edit({
                            permissionOverwrites: [
                                { id: guild.id, deny: ['ViewChannel'] },
                                { id: bot.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
                                { id: teamACaptainMember.id, allow: ['ViewChannel'], deny: ['SendMessages'] },
                                { id: teamBCaptainMember.id, allow: ['ViewChannel'], deny: ['SendMessages'] },
                                { id: DISCORD_ROLE_IDS.STAFF_ROLE_ID, allow: ['ViewChannel', 'SendMessages', 'ManageMessages'] },
                                { id: DISCORD_ROLE_IDS.ADMIN_ROLE_ID, allow: ['ViewChannel', 'SendMessages', 'ManageMessages'] }
                            ],
                        });
                        console.log(`Channel for match ${matchId} locked successfully.`);
                    } catch (error) {
                        console.error(`Failed to lock channel for match ${matchId}:`, error);
                        // Optionally send a message to a log channel if it fails
                    }
                }, 60000); // 60 seconds

                return; // End the process
            }

            // 9. Wait for the next interaction on the message we just sent/edited
            const filter = i => i.customId.startsWith(`pickban_${actionType}_${matchId}_${nextTeamId}`) && i.user.id === nextCaptainId;
            const collector = replyMessage.createMessageComponentCollector({ filter, time: 890000, max: 1 }); // 15 minute timeout

            collector.on('collect', async i => {
                try {
                    await i.deferUpdate();
                    const killerId = i.values[0];
                    let updateConn;
                    try {
                        updateConn = await dbPool.getConnection();
                        await updateConn.beginTransaction();
                        console.log(`User ${i.user.username} selected killer ID ${killerId} for ${actionType} in match ${matchId}`);
                        if (actionType === 'pick') {
                            const teamIdentifier = match.team_a_id.toString() === nextTeamId.toString() ? 'team_a' : 'team_b';
                            pickedKillersData[teamIdentifier] = killerId;
                            await updateConn.execute('UPDATE PickBanSessions SET picked_killers = ? WHERE pick_ban_id = ?', [JSON.stringify(pickedKillersData), pickBanId]);
                        } else { // ban
                            bannedKillersList.push(killerId);
                            await updateConn.execute('UPDATE PickBanSessions SET banned_killers = ? WHERE pick_ban_id = ?', [JSON.stringify(bannedKillersList), pickBanId]);
                        }
                        await updateConn.commit();
                    } catch (error) {
                        if (updateConn) await updateConn.rollback();
                        console.error(`Error updating pick/ban for match ${matchId}:`, error);
                        await i.followUp({ content: 'There was an error saving your selection. Please try again.', ephemeral: true });
                        return;
                    } finally {
                        if (updateConn) updateConn.release();
                    }

                    // Recursively call the function to continue the process, now awaited
                    await bot.runPickBanProcess(i, matchId, pickBanId);
                } catch (collectorError) {
                    console.error(`Fatal error in pick/ban collector for match ${matchId}:`, collectorError);
                    // Try to notify the user that something went very wrong.
                    await i.followUp({ content: 'A fatal error occurred while processing your action. The pick/ban process is halted. Please contact staff.', ephemeral: true }).catch(e => {
                        console.error('Failed to send follow-up error message in collector:', e);
                    });
                }
            });

            collector.on('end', collected => {
                if (collected.size === 0) {
                    interaction.editReply({ content: `The pick/ban for Match ${matchId} has timed out. A staff member will need to restart it.`, embeds: [], components: [] });
                    interaction.channel.edit({
                        permissionOverwrites: [
                            { id: guild.id, deny: ['ViewChannel'] },
                            { id: bot.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
                            { id: teamACaptainMember.id, allow: ['ViewChannel'] },
                            { id: teamBCaptainMember.id, allow: ['ViewChannel'] },
                            { id: DISCORD_ROLE_IDS.STAFF_ROLE_ID, allow: ['ViewChannel', 'SendMessages', 'ManageMessages'] },
                            { id: DISCORD_ROLE_IDS.ADMIN_ROLE_ID, allow: ['ViewChannel', 'SendMessages', 'ManageMessages'] }
                        ],
                    });
                }
            });

        } catch (error) {
            console.error(`Error in runPickBanProcess for match ${matchId}:`, error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'A critical error occurred during the pick/ban process. Please contact a staff member.', ephemeral: true });
            } else {
                await interaction.reply({ content: 'A critical error occurred during the pick/ban process. Please contact a staff member.', ephemeral: true });
            }
        } finally {
            if (conn) conn.release();
        }
    };

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
            const [matches] = await conn.execute(
                `SELECT m.team_a_id, m.team_b_id, 
                        tA.team_name as team_a_name, tA.captain_id as team_a_captain_id, 
                        tB.team_name as team_b_name, tB.captain_id as team_b_captain_id
                 FROM Matches m
                 JOIN Teams tA ON m.team_a_id = tA.team_id
                 JOIN Teams tB ON m.team_b_id = tB.team_id
                 WHERE m.match_id = ?`, [matchId]
            );

            if (matches.length === 0) {
                throw new Error(`Match with ID ${matchId} not found or is missing team data.`);
            }
            const match = matches[0];

            if (!match.team_a_captain_id || !match.team_b_captain_id) {
                throw new Error(`One or both teams in match ${matchId} do not have a captain.`);
            }

            const channelName = `${match.team_a_name}-vs-${match.team_b_name}`.toLowerCase().replace(/\s+/g, '-');
            const matchCategory = '1438849202733056133';

            const teamACaptainMember = await guild.members.fetch(match.team_a_captain_id);
            const teamBCaptainMember = await guild.members.fetch(match.team_b_captain_id);

            const channel = await guild.channels.create({
                name: channelName,
                type: 0, // GUILD_TEXT
                parent: matchCategory,
                topic: `Match ID: ${matchId}. Pick and ban channel for ${match.team_a_name} vs ${match.team_b_name}.`,
                permissionOverwrites: [
                    { id: guild.id, deny: ['ViewChannel'] },
                    { id: bot.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
                    { id: teamACaptainMember.id, allow: ['ViewChannel', 'SendMessages'] },
                    { id: teamBCaptainMember.id, allow: ['ViewChannel', 'SendMessages'] },
                    { id: DISCORD_ROLE_IDS.STAFF_ROLE_ID, allow: ['ViewChannel', 'SendMessages', 'ManageMessages'] },
                    { id: DISCORD_ROLE_IDS.ADMIN_ROLE_ID, allow: ['ViewChannel', 'SendMessages', 'ManageMessages'] }
                ],
            });

            await conn.execute(
                'INSERT INTO PickBans (match_id, team_a_id, team_b_id, channel_id, status) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE channel_id = VALUES(channel_id), status = VALUES(status)',
                [matchId, match.team_a_id, match.team_b_id, channel.id, 'PENDING']
            );

            const [pickBans] = await conn.execute('SELECT pick_ban_id FROM PickBans WHERE match_id = ?', [matchId]);
            if (pickBans.length === 0) {
                throw new Error(`Failed to create or find a pick/ban entry for match ${matchId}`);
            }
            const pickBanId = pickBans[0].pick_ban_id;

            const initialEmbed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`Match: ${match.team_a_name} vs ${match.team_b_name}`)
                .setDescription('Welcome Captains! The pick and ban phase is about to begin.')
                .addFields(
                    { name: 'Team A', value: `<@${match.team_a_captain_id}>`, inline: true },
                    { name: 'Team B', value: `<@${match.team_b_captain_id}>`, inline: true }
                )
                .setFooter({ text: `Match ID: ${matchId} | Initiated by ${initiatingUser.username}` });
            
            const startButton = new ButtonBuilder()
                .setCustomId(`start-pickban-button_${matchId}`)
                .setLabel('Start Pick & Ban')
                .setStyle(ButtonStyle.Success);

            const row = new ActionRowBuilder().addComponents(startButton);

            const message = await channel.send({ 
                content: `Let the picks and bans begin! <@${match.team_a_captain_id}>, <@${match.team_b_captain_id}>. One of you, please press the button to start.`, 
                embeds: [initialEmbed],
                components: [row]
            });

            const collector = message.createMessageComponentCollector({
                filter: i => i.customId === `start-pickban-button_${matchId}` && (i.user.id === match.team_a_captain_id || i.user.id === match.team_b_captain_id),
                max: 1,
                time: 300000 // 5 minutes
            });

            collector.on('collect', async i => {
                await i.deferUpdate(); // Defer the button interaction
                let conn;
                try {
                    conn = await dbPool.getConnection();
                    await conn.execute('UPDATE PickBans SET status = \'IN_PROGRESS\' WHERE pick_ban_id = ?', [pickBanId]);
                    bot.runPickBanProcess(i, matchId, pickBanId);
                } catch (error) {
                    console.error('Error in startPickBan button collector:', error);
                    await i.followUp({ content: 'An error occurred while trying to start the pick/ban process.', ephemeral: true });
                } finally {
                    if (conn) conn.release();
                }
            });

            collector.on('end', collected => {
                if (collected.size === 0) {
                    message.edit({ content: 'The start button has expired. A staff member can re-initiate the process.', components: [] });
                    channel.edit({
                        permissionOverwrites: [
                            { id: guild.id, deny: ['ViewChannel'] },
                            { id: bot.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
                            { id: teamACaptainMember.id, allow: ['ViewChannel'] },
                            { id: teamBCaptainMember.id, allow: ['ViewChannel'] },
                            { id: DISCORD_ROLE_IDS.STAFF_ROLE_ID, allow: ['ViewChannel', 'SendMessages', 'ManageMessages'] },
                            { id: DISCORD_ROLE_IDS.ADMIN_ROLE_ID, allow: ['ViewChannel', 'SendMessages', 'ManageMessages'] }
                        ],
                    });
                }
            });

        } catch (error) {
            console.error('Error in startPickBan function:', error);
            // Potentially notify the initiating user of the failure
            const user = await bot.users.fetch(initiatingUser.userId);
            if (user) {
                user.send(`Failed to start the pick/ban process for Match ID ${matchId}. Reason: ${error.message}`).catch(console.error);
            }
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