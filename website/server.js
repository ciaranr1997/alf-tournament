const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const RedisStore = require("connect-redis").default;
const mysql = require('mysql2/promise');
const multer = require('multer');
const { initializeBot } = require('./bot/bot.js');

// --- Configuration ---
const app = express();
const port = 3000;
const Redis = require('ioredis');

// Redis Client
const redisClient = new Redis({
  host: 'redis',
  port: 6379
});

// Redis Store
const redisStore = new RedisStore({
  client: redisClient,
  prefix: 'alfapp:'
});

// Session Middleware
app.use(session({
  store: redisStore,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24
  }
}));

// MySQL Connection Pool
const dbPool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    namedPlaceholders: true,
    supportBigNumbers: true,
    bigNumberStrings: true
});

// Multer Storage Engine
const uploadDir = 'public/uploads';
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir)
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname))
    }
});
const upload = multer({ storage: storage });


// Environment variables
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID;
const DISCORD_ADMIN_BOT_CHANNEL = process.env.DISCORD_ADMIN_BOT_CHANNEL;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/js', express.static(path.join(__dirname, 'js')));


// --- Role Definitions ---
const { EmbedBuilder } = require('discord.js');


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/css', express.static(path.join(__dirname, 'css')));


// --- Role Definitions ---
const ROLES = {
    ADMIN: 'Admin',
    STAFF: 'Staff',
    CAPTAIN: 'Captain',
    MEMBER: 'Member',
    VIEWER: 'Viewer'
};

// --- STATIC DISCORD ROLE IDs ---
const DISCORD_ROLE_IDS = {
    ADMIN_ROLE_ID: '1438137785092542497', 
    STAFF_ROLE_ID: '1438132130000408719',
    CAPTAIN_ROLE_ID: '1438140784435269742'
};

// --- TEAM COLORS ---
const TEAM_COLORS = [
    '#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#9B59B6', '#F7A072',
    '#3498DB', '#2ECC71', '#F1C40F', '#E74C3C', '#1ABC9C', '#E67E22',
    '#54A0FF', '#576574', '#222F3E', '#FECA57', '#AEC6CF', '#B39EB5',
    '#FFDAB9', '#C1E1C1'
];

function getUserRole(userId, discordRoles) {
    if (!discordRoles || discordRoles.length === 0) return ROLES.VIEWER;
    if (discordRoles.includes(DISCORD_ROLE_IDS.ADMIN_ROLE_ID)) return ROLES.ADMIN;
    if (discordRoles.includes(DISCORD_ROLE_IDS.STAFF_ROLE_ID)) return ROLES.STAFF;
    if (discordRoles.includes(DISCORD_ROLE_IDS.CAPTAIN_ROLE_ID)) return ROLES.CAPTAIN;
    return ROLES.MEMBER; 
}

function checkAuth(req, res, next) {
    req.user = req.session.user || null;
    next();
}
app.use(checkAuth);

function requireRole(requiredRole) {
    return (req, res, next) => {
        const userRole = req.user ? req.user.role : ROLES.VIEWER;
        const roleHierarchy = [ROLES.VIEWER, ROLES.MEMBER, ROLES.CAPTAIN, ROLES.STAFF, ROLES.ADMIN];
        if (roleHierarchy.indexOf(userRole) >= roleHierarchy.indexOf(requiredRole)) {
            next();
        } else {
            if (!req.user) {
                return res.redirect('/login');
            }
            res.status(403).send(generateErrorPage('403 Forbidden', `You lack the required role (${requiredRole}) to access this page. Your role: ${userRole}.`));
        }
    };
}

function readTemplate(filename, replacements = {}) {
    try {
        const templatePath = path.join(__dirname, filename);
        let template = fs.readFileSync(templatePath, 'utf8'); 
        for (const key in replacements) {
            template = template.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), replacements[key]);
        }
        return template;
    } catch (e) {
        console.error(`Template file error (${filename}):`, e.message);
        return generateErrorPage('500 Server Error', `Could not load page content from template file: ${filename}.`);
    }
}

// --- MAIN ROUTES ---
app.get('/', (req, res) => {
    // The home page is now the public tournament bracket
    const pageHtml = readTemplate('public_bracket.html');
    res.send(pageHtml);
});

app.get('/overlay/:slug', (req, res) => {
    const pageHtml = readTemplate('public_overlay.html');
    res.send(pageHtml);
});

app.get('/staff', requireRole(ROLES.STAFF), (req, res) => {
    const pageHtml = readTemplate('staff_index.html', {
        USERNAME: req.user.username,
        USER_ROLE: req.user.role,
    });
    res.send(pageHtml);
});

app.get('/staff/teams', requireRole(ROLES.STAFF), (req, res) => {
    const pageHtml = readTemplate('staff_teams.html', {
        USERNAME: req.user.username,
        USER_ROLE: req.user.role,
    });
    res.send(pageHtml);
});

app.get('/staff/teams/edit/:teamId', requireRole(ROLES.STAFF), (req, res) => {
    const pageHtml = readTemplate('staff_teams_edit.html', {
        USERNAME: req.user.username,
        USER_ROLE: req.user.role,
        TEAM_ID: req.params.teamId
    });
    res.send(pageHtml);
});

app.get('/staff/matches', requireRole(ROLES.STAFF), (req, res) => {
    const pageHtml = readTemplate('staff_matches.html', {
        USERNAME: req.user.username,
        USER_ROLE: req.user.role,
    });
    res.send(pageHtml);
});

app.get('/staff/match/:matchId', requireRole(ROLES.STAFF), (req, res) => {
    const pageHtml = readTemplate('staff_match_details.html', {
        USERNAME: req.user.username,
        USER_ROLE: req.user.role,
        MATCH_ID: req.params.matchId
    });
    res.send(pageHtml);
});

app.get('/staff/match/:matchId', requireRole(ROLES.STAFF), (req, res) => {
    const pageHtml = readTemplate('staff_match_details.html', {
        USERNAME: req.user.username,
        USER_ROLE: req.user.role,
        MATCH_ID: req.params.matchId
    });
    res.send(pageHtml);
});

app.get('/admin', requireRole(ROLES.ADMIN), (req, res) => {
    const pageHtml = readTemplate('admin_index.html', {
        USERNAME: req.user.username,
        USER_ROLE: req.user.role,
    });
    res.send(pageHtml);
});

app.get('/admin/bracket/:tournamentId', requireRole(ROLES.ADMIN), (req, res) => {
    const tournamentId = req.params.tournamentId;
    const pageHtml = readTemplate('admin_bracket.html', {
        USERNAME: req.user.username,
        TOURNAMENT_ID: tournamentId 
    });
    res.send(pageHtml);
});

app.get('/admin/brackets', requireRole(ROLES.ADMIN), (req, res) => {
    const pageHtml = readTemplate('admin_brackets.html', {
        USERNAME: req.user.username,
        USER_ROLE: req.user.role,
    });
    res.send(pageHtml);
});

app.get('/admin/tournaments', requireRole(ROLES.ADMIN), (req, res) => {
    const pageHtml = readTemplate('admin_tournaments.html', {
        USERNAME: req.user.username,
        USER_ROLE: req.user.role,
    });
    res.send(pageHtml);
});

app.get('/admin/tournaments/:tournamentId', requireRole(ROLES.ADMIN), (req, res) => {
    const pageHtml = readTemplate('admin_tournament_details.html', {
        USERNAME: req.user.username,
        USER_ROLE: req.user.role,
        TOURNAMENT_ID: req.params.tournamentId
    });
    res.send(pageHtml);
});

app.get('/admin/overlays', requireRole(ROLES.ADMIN), (req, res) => {
    const pageHtml = readTemplate('admin_overlays.html', {
        USERNAME: req.user.username,
        USER_ROLE: req.user.role,
    });
    res.send(pageHtml);
});

app.get('/admin/overlays/edit/:overlayId', requireRole(ROLES.ADMIN), (req, res) => {
    const pageHtml = readTemplate('admin_overlay_editor.html', {
        USERNAME: req.user.username,
        USER_ROLE: req.user.role,
        OVERLAY_ID: req.params.overlayId
    });
    res.send(pageHtml);
});

app.get('/admin/video-playback', requireRole(ROLES.ADMIN), (req, res) => {
    const pageHtml = readTemplate('admin_video_playback.html', {
        USERNAME: req.user.username,
        USER_ROLE: req.user.role,
    });
    res.send(pageHtml);
});

app.get('/staff/killers/edit', requireRole(ROLES.STAFF), async (req, res) => { // Note: This route was previously duplicated, I've removed the extra one.
    try {
        const [killers] = await dbPool.query('SELECT killer_id, killer_name, allowed, tier, art_url FROM Killers ORDER BY allowed DESC, killer_order ASC');
        const [tiers] = await dbPool.query('SELECT tier_id, tier_name FROM Tiers ORDER BY tier_id');
        const [rules] = await dbPool.query('SELECT killer_id, role, category, rule_text FROM KillerRules ORDER BY killer_id, role, category');
        const [maps] = await dbPool.query(`
            SELECT km.killer_id, m.map_name, km.priority 
            FROM KillerMaps km 
            JOIN Maps m ON km.map_id = m.map_id 
            ORDER BY km.killer_id
        `);

        // Group rules and maps by killer_id for easy lookup
        const rulesByKiller = rules.reduce((acc, rule) => {
            if (!acc[rule.killer_id]) acc[rule.killer_id] = [];
            acc[rule.killer_id].push(rule);
            return acc;
        }, {});

        const mapsByKiller = maps.reduce((acc, map) => {
            if (!acc[map.killer_id]) acc[map.killer_id] = [];
            acc[map.killer_id].push(map);
            return acc;
        }, {});

        const killerListHtml = killers.map(killer => {
            const tierOptions = tiers.map(tier => 
                `<option value="${tier.tier_id}" ${killer.tier == tier.tier_id ? 'selected' : ''}>${tier.tier_name}</option>`
            ).join('');

            const killerRules = rulesByKiller[killer.killer_id] || [];
            const killerMaps = mapsByKiller[killer.killer_id] || [];

            const rulesHtml = `
                <div class="rules-section">
                    <h4 class="font-semibold text-lg mb-2">Rules</h4>
                    ${killerRules.length > 0 ? killerRules.map(r => `<div class="rule-item"><span class="font-bold">${r.role} - ${r.category}:</span> <p class="text-sm text-gray-300 break-words">${r.rule_text}</p></div>`).join('') : '<p class="text-sm text-gray-400">No specific rules.</p>'}
                    <h4 class="font-semibold text-lg mt-4 mb-2">Map Priority</h4>
                    ${killerMaps.length > 0 ? killerMaps.map(m => `<p class="text-sm text-gray-300">${m.priority}: ${m.map_name}</p>`).join('') : '<p class="text-sm text-gray-400">No map priorities set.</p>'}
                </div>
            `;

            return `
                <div class="killer-card">
                    <img src="${killer.art_url || '/public/default-killer.png'}" alt="${killer.killer_name}" class="killer-art">
                    <div class="killer-header">
                        <h2 class="text-xl font-bold">${killer.killer_name}</h2>
                    </div>
                    <div class="killer-body">
                        <form class="killer-edit-form space-y-4" data-killer-id="${killer.killer_id}">
                            <div>
                                <label class="form-label flex items-center">
                                    <input type="checkbox" name="allowed" class="form-checkbox mr-2" ${killer.allowed ? 'checked' : ''}>
                                    Allowed
                                </label>
                            </div>
                            <div>
                                <label for="tier-${killer.killer_id}" class="form-label">Tier</label>
                                <select id="tier-${killer.killer_id}" name="tier" class="form-select">${tierOptions}</select>
                            </div>
                            <div class="flex space-x-2">
                                <button type="submit" class="save-btn w-1/2">Save</button>
                                <a href="/staff/killers/rules/edit/${killer.killer_id}" class="rules-btn w-1/2">Edit Rules</a>
                            </div>
                        </form>
                        ${rulesHtml}
                    </div>
                </div>
            `;
        }).join('');

        const pageHtml = readTemplate('staff_killers_edit.html', { KILLER_LIST: killerListHtml });
        res.send(pageHtml);
    } catch (error) {
        console.error('Error loading killer balancing page:', error);
        res.status(500).send(generateErrorPage('500 Server Error', 'Could not load killer data.'));
    }
});

app.get('/staff/killers/rules/edit/:killerId', requireRole(ROLES.STAFF), async (req, res) => {
    const { killerId } = req.params;
    try {
        const [killers] = await dbPool.query('SELECT killer_name FROM Killers WHERE killer_id = ?', [killerId]);
        if (killers.length === 0) {
            return res.status(404).send(generateErrorPage('404 Not Found', 'Killer not found.'));
        }
        const killerName = killers[0].killer_name;

        const [allMaps] = await dbPool.query('SELECT map_id, map_name FROM Maps ORDER BY map_name');
        const [killerMaps] = await dbPool.query('SELECT map_id, priority FROM KillerMaps WHERE killer_id = ?', [killerId]);
        const [killerRules] = await dbPool.query('SELECT rule_id, role, category, rule_text FROM KillerRules WHERE killer_id = ? ORDER BY role, category', [killerId]);

        const mapPriority = { 1: null, 2: null, 3: null };
        killerMaps.forEach(km => {
            mapPriority[km.priority] = km.map_id;
        });

        const generateOptions = (selectedId) => allMaps.map(map => 
            `<option value="${map.map_id}" ${map.map_id == selectedId ? 'selected' : ''}>${map.map_name}</option>`
        ).join('');

        const existingRulesHtml = killerRules.map(rule => `
            <form class="rule-item-form" data-rule-id="${rule.rule_id}">
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                    <div>
                        <label class="form-label text-sm">Role</label>
                        <select name="role" class="form-select">
                            <option value="Killer" ${rule.role === 'Killer' ? 'selected' : ''}>Killer</option>
                            <option value="Survivor" ${rule.role === 'Survivor' ? 'selected' : ''}>Survivor</option>
                        </select>
                    </div>
                    <div>
                        <label class="form-label text-sm">Category</label>
                        <input type="text" name="category" class="form-input" value="${rule.category}">
                    </div>
                    <div class="md:col-span-2">
                        <label class="form-label text-sm">Rule Text</label>
                        <textarea name="rule_text" class="form-textarea" rows="2">${rule.rule_text}</textarea>
                    </div>
                </div>
                <div class="flex justify-end space-x-2 mt-2">
                    <button type="submit" class="btn btn-primary btn-sm">Update</button>
                    <button type="button" class="btn btn-danger btn-sm delete-rule-btn" data-rule-id="${rule.rule_id}">Delete</button>
                </div>
            </form>
        `).join('');

        const replacements = {
            KILLER_ID: killerId,
            KILLER_NAME: killerName,
            MAP_OPTIONS_1: generateOptions(mapPriority[1]),
            MAP_OPTIONS_2: generateOptions(mapPriority[2]),
            MAP_OPTIONS_3: generateOptions(mapPriority[3]),
            EXISTING_RULES: existingRulesHtml
        };

        const pageHtml = readTemplate('staff_killer_rules_edit.html', replacements);
        res.send(pageHtml);

    } catch (error) {
        console.error(`Error loading rules edit page for killer ${killerId}:`, error);
        res.status(500).send(generateErrorPage('500 Server Error', 'Could not load killer rule data.'));
    }
});

// --- API ENDPOINTS ---

app.get('/api/killers', requireRole(ROLES.STAFF), async (req, res) => {
    try {
        const [killers] = await dbPool.query('SELECT killer_id, killer_name, allowed, tier FROM Killers ORDER BY killer_order');
        res.json(killers);
    } catch (error) {
        console.error('Error fetching killers:', error);
        res.status(500).json({ message: 'Error fetching killers' });
    }
});

app.get('/api/tiers', requireRole(ROLES.STAFF), async (req, res) => {
    try {
        const [tiers] = await dbPool.query('SELECT tier_id, tier_name FROM Tiers ORDER BY tier_id');
        res.json(tiers);
    } catch (error) {
        console.error('Error fetching tiers:', error);
        res.status(500).json({ message: 'Error fetching tiers' });
    }
});

app.put('/api/killers/:killerId', requireRole(ROLES.STAFF), async (req, res) => {
    const { killerId } = req.params;
    const { allowed, tier } = req.body;

    try {
        await dbPool.execute(
            'UPDATE Killers SET allowed = ?, tier = ? WHERE killer_id = ?',
            [allowed, tier, killerId]
        );
        res.json({ message: 'Killer updated successfully' });
    } catch (error) {
        console.error(`Error updating killer ${killerId}:`, error);
        res.status(500).json({ message: 'Error updating killer' });
    }
});

app.put('/api/killers/:killerId/maps', requireRole(ROLES.STAFF), async (req, res) => {
    const { killerId } = req.params;
    const { maps } = req.body; // Expects an array of { map_id, priority }

    const conn = await dbPool.getConnection();
    try {
        await conn.beginTransaction();
        // Clear existing priorities for this killer
        await conn.execute('DELETE FROM KillerMaps WHERE killer_id = ?', [killerId]);

        // Insert new priorities if any are provided
        if (maps && maps.length > 0) {
            const values = maps.map(m => [killerId, m.map_id, m.priority]);
            await conn.query('INSERT INTO KillerMaps (killer_id, map_id, priority) VALUES ?', [values]);
        }

        await conn.commit();
        res.json({ message: 'Map priorities updated successfully.' });
    } catch (error) {
        await conn.rollback();
        console.error(`Error updating map priorities for killer ${killerId}:`, error);
        res.status(500).json({ message: 'Failed to update map priorities.' });
    } finally {
        conn.release();
    }
});

app.put('/api/killers/rules/:ruleId', requireRole(ROLES.STAFF), async (req, res) => {
    const { ruleId } = req.params;
    const { role, category, rule_text } = req.body;

    try {
        const [result] = await dbPool.execute(
            'UPDATE KillerRules SET role = ?, category = ?, rule_text = ? WHERE rule_id = ?',
            [role, category, rule_text, ruleId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Rule not found.' });
        }
        res.json({ message: 'Rule updated successfully.' });
    } catch (error) {
        console.error(`Error updating rule ${ruleId}:`, error);
        res.status(500).json({ message: 'Failed to update rule.' });
    }
});

app.post('/api/killers/:killerId/rules', requireRole(ROLES.STAFF), async (req, res) => {
    const { killerId } = req.params;
    const { role, category, rule_text } = req.body;

    try {
        const [result] = await dbPool.execute(
            'INSERT INTO KillerRules (killer_id, role, category, rule_text) VALUES (?, ?, ?, ?)',
            [killerId, role, category, rule_text]
        );
        const newRuleId = result.insertId;
        res.status(201).json({ message: 'Rule added successfully.', rule: { rule_id: newRuleId, killer_id: killerId, ...req.body } });
    } catch (error) {
        console.error(`Error adding rule for killer ${killerId}:`, error);
        res.status(500).json({ message: 'Failed to add rule.' });
    }
});

app.delete('/api/killers/:killerId/rules/:ruleId', requireRole(ROLES.STAFF), async (req, res) => {
    const { ruleId } = req.params;
    try {
        const [result] = await dbPool.execute('DELETE FROM KillerRules WHERE rule_id = ?', [ruleId]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Rule not found.' });
        }
        res.json({ message: 'Rule deleted successfully.' });
    } catch (error) {
        console.error(`Error deleting rule ${ruleId}:`, error);
        res.status(500).json({ message: 'Failed to delete rule.' });
    }
});

app.get('/api/staff/users', requireRole(ROLES.STAFF), async (req, res) => {
    const cacheKey = `cache:guild-members:${DISCORD_GUILD_ID}`;
    const cacheTTL = 30; // 30 seconds

    try {
        // 1. Try to get data from cache
        const cachedUsers = await redisClient.get(cacheKey);
        if (cachedUsers) {
            console.log('Serving users from cache.');
            return res.json(JSON.parse(cachedUsers));
        }

        // 2. If not in cache, fetch from Discord
        console.log('Fetching users from Discord API...');
        const bot = req.app.locals.bot;
        const guild = await bot.guilds.fetch(DISCORD_GUILD_ID);
        
        // Fetch all members. This can be slow and is the source of the timeout.
        await guild.members.fetch(); 

        const users = guild.members.cache.map(member => ({
            id: member.id,
            username: member.user.username,
            nickname: member.nickname || member.user.globalName || member.user.username,
            avatar: member.user.displayAvatarURL()
        }));

        // 3. Store in cache for future requests
        await redisClient.setex(cacheKey, cacheTTL, JSON.stringify(users));
        
        res.json(users);

    } catch (error) {
        console.error('Error fetching users:', error);
        // It's important to check the error type.
        // If it's a timeout, we might want to serve stale data if available,
        // but for now, we'll just return a standard error.
        if (error.code === 'GuildMembersTimeout') {
             res.status(504).json({ message: 'Fetching users from Discord timed out. Please try again in a moment.' });
        } else {
             res.status(500).json({ message: 'An error occurred while fetching users.' });
        }
    }
});

app.post('/api/staff/create-team', requireRole(ROLES.STAFF), async (req, res) => {
    const { teamName, captainId, roleColor } = req.body;
    if (!teamName || !captainId || !roleColor) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    // Validate if the roleColor is in the predefined TEAM_COLORS
    if (!TEAM_COLORS.includes(roleColor)) {
        return res.status(400).json({ message: 'Invalid color. Please choose from the available colors.' });
    }

    const conn = await dbPool.getConnection();
    try {
        await conn.beginTransaction();
        const bot = req.app.locals.bot;
        const guild = await bot.guilds.fetch(DISCORD_GUILD_ID);

        // Ensure the captain exists in the Users table
        const [captainUser] = await conn.execute('SELECT * FROM Users WHERE user_id = ?', [captainId]);
        if (captainUser.length === 0) {
            const member = await guild.members.fetch(captainId);
            if (member) {
                await conn.execute('INSERT INTO Users (user_id, username) VALUES (?, ?)', [member.id, member.user.username]);
            } else {
                throw new Error('Captain not found in Discord guild.');
            }
        }

        const [teamResult] = await conn.execute(
            'INSERT INTO Teams (team_name, captain_id) VALUES (?, ?)',
            [teamName, captainId]
        );
        const teamId = teamResult.insertId;

        await conn.execute(
            'INSERT INTO TeamMembers (team_id, user_id) VALUES (?, ?)',
            [teamId, captainId]
        );

        const newRole = await guild.roles.create({
            name: teamName,
            color: roleColor,
            hoist: true, // This displays role members separately
            permissions: [],
            reason: `Role for team ${teamName}`,
        });

        const newChannel = await guild.channels.create({
            name: teamName,
            type: 0, // GUILD_TEXT
            parent: '1438326158654574673',
            permissionOverwrites: [
                { id: guild.id, deny: ['ViewChannel'] },
                { id: newRole.id, allow: ['ViewChannel'] },
            ],
        });

        const newVoiceChannel = await guild.channels.create({
            name: `${teamName}-voice`,
            type: 2, // GUILD_VOICE
            parent: '1438912415852007474',
            permissionOverwrites: [
                { id: guild.id, deny: ['ViewChannel'] },
                { id: newRole.id, allow: ['ViewChannel', 'Connect', 'Speak'] },
            ],
        });

        // Update team with role and channel IDs
        await conn.execute(
            'UPDATE Teams SET role_id = ?, channel_id = ?, voice_channel_id = ? WHERE team_id = ?',
            [newRole.id, newChannel.id, newVoiceChannel.id, teamId]
        );

        const captain = await guild.members.fetch(captainId);
        await captain.roles.add(newRole);
        await captain.roles.add(DISCORD_ROLE_IDS.CAPTAIN_ROLE_ID);

        await conn.commit();

        // Send Discord notification
        try {
            const adminChannel = await req.app.locals.bot.channels.fetch(DISCORD_ADMIN_BOT_CHANNEL);
            if (adminChannel) {
                const captainMember = await guild.members.fetch(captainId);
                const embed = new EmbedBuilder()
                    .setColor(roleColor)
                    .setTitle('New Team Created!')
                    .addFields(
                        { name: 'Team Name', value: teamName, inline: true },
                        { name: 'Captain', value: `<@${captainMember.id}>`, inline: true },
                        { name: 'Created By', value: req.user.username, inline: false }
                    )
                    .setTimestamp();
                await adminChannel.send({ embeds: [embed] });
            }
        } catch (discordError) {
            console.error('Failed to send Discord notification:', discordError);
            // Don't fail the whole request if notification fails
        }
        
        res.json({ message: `Team ${teamName} created successfully!`, teamId });
    } catch (error) {
        await conn.rollback();
        console.error('Error creating team:', error);
        res.status(500).json({ message: 'Error creating team' });
    } finally {
        conn.release();
    }
});

app.get('/api/staff/teams', requireRole(ROLES.STAFF), async (req, res) => {
    try {
        const [teams] = await dbPool.query('SELECT team_id, team_name, captain_id, logo_url, role_id FROM Teams ORDER BY team_name');
        res.json(teams);
    } catch (error) {
        console.error('Error fetching teams:', error);
        res.status(500).json({ message: 'Error fetching teams' });
    }
});

app.get('/api/staff/teams/:id', requireRole(ROLES.STAFF), async (req, res) => {
    try {
        const [team] = await dbPool.query('SELECT * FROM Teams WHERE team_id = ?', [req.params.id]);
        if (team.length === 0) {
            return res.status(404).json({ message: 'Team not found' });
        }
        const [members] = await dbPool.query('SELECT user_id FROM TeamMembers WHERE team_id = ?', [req.params.id]);
        team[0].members = members.map(m => m.user_id);
        res.json(team[0]);
    } catch (error) {
        console.error('Error fetching team details:', error);
        res.status(500).json({ message: 'Error fetching team details' });
    }
});

app.get('/api/team-colors', checkAuth, (req, res) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Authentication required.' });
    }
    res.json(TEAM_COLORS);
});

app.get('/api/staff/all-captain-ids', requireRole(ROLES.STAFF), async (req, res) => {
    try {
        const [captainIds] = await dbPool.query('SELECT DISTINCT captain_id FROM Teams WHERE captain_id IS NOT NULL');
        res.json(captainIds.map(row => row.captain_id));
    } catch (error) {
        console.error('Error fetching all captain IDs:', error);
        res.status(500).json({ message: 'Error fetching all captain IDs' });
    }
});

app.get('/api/teams', requireRole(ROLES.STAFF), async (req, res) => {
    try {
        const [teams] = await dbPool.query('SELECT team_id as id, team_name as name FROM Teams ORDER BY team_name');
        res.json(teams);
    } catch (error) {
        console.error('Error fetching teams:', error);
        res.status(500).json({ message: 'Error fetching teams' });
    }
});

app.get('/api/matches', requireRole(ROLES.STAFF), async (req, res) => {
    try {
        const [matches] = await dbPool.query(`
            SELECT 
                m.match_id,
                m.round_name,
                t1.team_name as team1_name,
                t2.team_name as team2_name,
                m.format,
                m.is_active
            FROM Matches m
            JOIN Teams t1 ON m.team_a_id = t1.team_id
            JOIN Teams t2 ON m.team_b_id = t2.team_id
            ORDER BY m.match_id DESC
        `);
        res.json(matches);
    } catch (error) {
        console.error('Error fetching matches:', error);
        res.status(500).json({ message: 'Error fetching matches' });
    }
});

app.put('/api/matches/:matchId/active', requireRole(ROLES.STAFF), async (req, res) => {
    const { matchId } = req.params;

    const conn = await dbPool.getConnection();
    try {
        await conn.beginTransaction();

        // Deactivate all other matches
        await conn.execute('UPDATE Matches SET is_active = 0 WHERE is_active = 1');

        // Activate the target match
        const [result] = await conn.execute(
            'UPDATE Matches SET is_active = 1 WHERE match_id = ?',
            [matchId]
        );
        
        await conn.commit();

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Match not found.' });
        }
        res.json({ message: 'Match active status updated.' });
    } catch (error) {
        await conn.rollback();
        console.error(`Error updating active status for match ${matchId}:`, error);
        res.status(500).json({ message: 'Failed to update match status.', error: error.message });
    } finally {
        conn.release();
    }
});

app.delete('/api/matches/:id', requireRole(ROLES.STAFF), async (req, res) => {
    try {
        const [result] = await dbPool.query('DELETE FROM Matches WHERE match_id = ?', [req.params.id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Match not found' });
        }
        res.json({ message: 'Match deleted successfully' });
    } catch (error) {
        console.error('Error deleting match:', error);
        res.status(500).json({ message: 'Error deleting match' });
    }
});



app.post('/api/matches/:matchId/pick', requireRole(ROLES.STAFF), async (req, res) => {
    const { matchId } = req.params;
    const { killerId, teamId } = req.body;

    if (!killerId || !teamId) {
        return res.status(400).json({ message: 'killerId and teamId are required.' });
    }

    let conn;
    try {
        conn = await dbPool.getConnection();
        await conn.beginTransaction();

        const [matches] = await conn.execute('SELECT team_a_id, team_b_id FROM Matches WHERE match_id = ?', [matchId]);
        if (matches.length === 0) {
            throw new Error('Match not found');
        }
        const match = matches[0];

        const [sessions] = await conn.execute('SELECT * FROM PickBanSessions WHERE match_id = ? FOR UPDATE', [matchId]);
        if (sessions.length === 0) {
            throw new Error('Pick/Ban session not found.');
        }
        const session = sessions[0];
        const pickedKillers = JSON.parse(session.picked_killers || '{}');

        const teamIdentifier = match.team_a_id.toString() === teamId.toString() ? 'team_a' : 'team_b';

        if (pickedKillers[teamIdentifier]) {
            throw new Error('This team has already picked a killer.');
        }
        
        pickedKillers[teamIdentifier] = killerId;

        await conn.execute('UPDATE PickBanSessions SET picked_killers = ? WHERE match_id = ?', [JSON.stringify(pickedKillers), matchId]);
        
        await conn.commit();
        res.json({ message: 'Killer picked successfully.' });
    } catch (error) {
        if (conn) await conn.rollback();
        console.error(`Error picking killer for match ${matchId}:`, error);
        res.status(500).json({ message: error.message || 'Failed to pick killer.' });
    } finally {
        if (conn) conn.release();
    }
});

app.post('/api/matches/:matchId/ban', requireRole(ROLES.STAFF), async (req, res) => {
    const { matchId } = req.params;
    const { killerId } = req.body;

    if (!killerId) {
        return res.status(400).json({ message: 'killerId is required.' });
    }

    let conn;
    try {
        conn = await dbPool.getConnection();
        await conn.beginTransaction();

        const [sessions] = await conn.execute('SELECT * FROM PickBanSessions WHERE match_id = ? FOR UPDATE', [matchId]);
        if (sessions.length === 0) {
            throw new Error('Pick/Ban session not found.');
        }
        const session = sessions[0];
        const bannedKillers = JSON.parse(session.banned_killers || '[]');

        if (bannedKillers.includes(killerId)) {
            throw new Error('This killer has already been banned.');
        }

        bannedKillers.push(killerId);

        await conn.execute('UPDATE PickBanSessions SET banned_killers = ? WHERE match_id = ?', [JSON.stringify(bannedKillers), matchId]);

        await conn.commit();
        res.json({ message: 'Killer banned successfully.' });
    } catch (error) {
        if (conn) await conn.rollback();
        console.error(`Error banning killer for match ${matchId}:`, error);
        res.status(500).json({ message: error.message || 'Failed to ban killer.' });
    } finally {
        if (conn) conn.release();
    }
});

app.get('/api/matches/:matchId/pick-ban-status', requireRole(ROLES.STAFF), async (req, res) => {
    const { matchId } = req.params;
    let conn;
    try {
        conn = await dbPool.getConnection();

        // 1. Get Match and Team info
        const [matches] = await conn.execute(`
            SELECT m.team_a_id, m.team_b_id, tA.team_name as team_a_name, tB.team_name as team_b_name
            FROM Matches m
            JOIN Teams tA ON m.team_a_id = tA.team_id
            JOIN Teams tB ON m.team_b_id = tB.team_id
            WHERE m.match_id = ?
        `, [matchId]);

        if (matches.length === 0) {
            return res.status(404).json({ message: 'Match not found.' });
        }
        const match = matches[0];

        // 2. Get all allowed killers
        const [allKillers] = await conn.execute('SELECT killer_id, killer_name, art_url FROM Killers WHERE allowed = 1 ORDER BY killer_order');

        // 3. Get or create Pick/Ban session
        let [sessions] = await conn.execute('SELECT * FROM PickBanSessions WHERE match_id = ?', [matchId]);
        let session;
        if (sessions.length === 0) {
            // Create a new session if it doesn't exist
            const newSession = {
                match_id: matchId,
                banned_killers: JSON.stringify([]),
                picked_killers: JSON.stringify({ team_a: null, team_b: null, tiebreaker: null })
            };
            const [insertResult] = await conn.execute(
                'INSERT INTO PickBanSessions (match_id, banned_killers, picked_killers) VALUES (?, ?, ?)',
                [newSession.match_id, newSession.banned_killers, newSession.picked_killers]
            );
            session = { ...newSession, pick_ban_id: insertResult.insertId };
        } else {
            session = sessions[0];
        }

        const bannedKillersList = JSON.parse(session.banned_killers || '[]');
        const pickedKillersData = JSON.parse(session.picked_killers || '{}');

        // 4. Determine available killers
        const pickedIds = Object.values(pickedKillersData).filter(id => id);
        const unavailableIds = new Set([...bannedKillersList, ...pickedIds]);
        const availableKillers = allKillers.filter(k => !unavailableIds.has(k.killer_id));

        // 5. Determine next action based on the rules
        let nextAction = 'Completed';
        let nextTeamId = null;
        if (!pickedKillersData.team_a) {
            nextAction = `Team A Pick (${match.team_a_name})`;
            nextTeamId = match.team_a_id;
        } else if (!pickedKillersData.team_b) {
            nextAction = `Team B Pick (${match.team_b_name})`;
            nextTeamId = match.team_b_id;
        } else {
            // Alternating bans
            const totalPicks = 2;
            const totalBans = bannedKillersList.length;
            const totalActions = totalPicks + totalBans;
            
            // Team A bans on even total actions (after picks), Team B on odd
            if (availableKillers.length > 1) {
                 if (totalBans % 2 === 0) { // Team A's turn to ban
                    nextAction = `Team A Ban (${match.team_a_name})`;
                    nextTeamId = match.team_a_id;
                } else { // Team B's turn to ban
                    nextAction = `Team B Ban (${match.team_b_name})`;
                    nextTeamId = match.team_b_id;
                }
            }
        }
        
        // 6. If only one killer is left, it's the tiebreaker
        if (availableKillers.length === 1 && !pickedKillersData.tiebreaker) {
             pickedKillersData.tiebreaker = availableKillers[0].killer_id;
             unavailableIds.add(availableKillers[0].killer_id);
             
             await conn.execute('UPDATE PickBanSessions SET picked_killers = ? WHERE match_id = ?', [JSON.stringify(pickedKillersData), matchId]);
             
             // Refilter available killers, which should now be empty
             availableKillers.pop();
             nextAction = 'Completed';
             nextTeamId = null;
        }


        // 7. Construct final response
        const teamAPick = pickedKillersData.team_a ? allKillers.find(k => k.killer_id === pickedKillersData.team_a) : null;
        const teamBPick = pickedKillersData.team_b ? allKillers.find(k => k.killer_id === pickedKillersData.team_b) : null;
        const tiebreaker = pickedKillersData.tiebreaker ? allKillers.find(k => k.killer_id === pickedKillersData.tiebreaker) : null;
        const bannedKillers = bannedKillersList.map(id => allKillers.find(k => k.killer_id === id)).filter(k => k);


        res.json({
            matchId: matchId,
            team_a_name: match.team_a_name,
            team_b_name: match.team_b_name,
            team_a_id: match.team_a_id,
            team_b_id: match.team_b_id,
            team_a_pick: teamAPick,
            team_b_pick: teamBPick,
            tiebreaker: tiebreaker,
            banned_killers: bannedKillers,
            available_killers: availableKillers,
            next_action: nextAction,
            next_team_id: nextTeamId
        });

    } catch (error) {
        console.error(`Error fetching pick/ban status for match ${matchId}:`, error);
        res.status(500).json({ message: 'Error fetching pick/ban status.' });
    } finally {
        if (conn) conn.release();
    }
});

app.post('/api/matches/:matchId/pick', requireRole(ROLES.STAFF), async (req, res) => {
    const { matchId } = req.params;
    const { killerId, teamId } = req.body;

    if (!killerId || !teamId) {
        return res.status(400).json({ message: 'killerId and teamId are required.' });
    }

    let conn;
    try {
        conn = await dbPool.getConnection();
        await conn.beginTransaction();

        const [matches] = await conn.execute('SELECT team_a_id, team_b_id FROM Matches WHERE match_id = ?', [matchId]);
        if (matches.length === 0) {
            throw new Error('Match not found');
        }
        const match = matches[0];

        const [sessions] = await conn.execute('SELECT * FROM PickBanSessions WHERE match_id = ? FOR UPDATE', [matchId]);
        if (sessions.length === 0) {
            throw new Error('Pick/Ban session not found.');
        }
        const session = sessions[0];
        const pickedKillers = JSON.parse(session.picked_killers || '{}');

        const teamIdentifier = match.team_a_id.toString() === teamId.toString() ? 'team_a' : 'team_b';

        if (pickedKillers[teamIdentifier]) {
            throw new Error('This team has already picked a killer.');
        }
        
        // Add more validation here if needed (e.g., is it the right team's turn?)

        pickedKillers[teamIdentifier] = killerId;

        await conn.execute('UPDATE PickBanSessions SET picked_killers = ? WHERE match_id = ?', [JSON.stringify(pickedKillers), matchId]);
        
        await conn.commit();
        res.json({ message: 'Killer picked successfully.' });
    } catch (error) {
        if (conn) await conn.rollback();
        console.error(`Error picking killer for match ${matchId}:`, error);
        res.status(500).json({ message: error.message || 'Failed to pick killer.' });
    } finally {
        if (conn) conn.release();
    }
});

app.post('/api/matches/:matchId/ban', requireRole(ROLES.STAFF), async (req, res) => {
    const { matchId } = req.params;
    const { killerId } = req.body;

    if (!killerId) {
        return res.status(400).json({ message: 'killerId is required.' });
    }

    let conn;
    try {
        conn = await dbPool.getConnection();
        await conn.beginTransaction();

        const [sessions] = await conn.execute('SELECT * FROM PickBanSessions WHERE match_id = ? FOR UPDATE', [matchId]);
        if (sessions.length === 0) {
            throw new Error('Pick/Ban session not found.');
        }
        const session = sessions[0];
        const bannedKillers = JSON.parse(session.banned_killers || '[]');

        if (bannedKillers.includes(killerId)) {
            throw new Error('This killer has already been banned.');
        }

        // Add more validation here if needed (e.g., is it the right team's turn to ban?)

        bannedKillers.push(killerId);

        await conn.execute('UPDATE PickBanSessions SET banned_killers = ? WHERE match_id = ?', [JSON.stringify(bannedKillers), matchId]);

        await conn.commit();
        res.json({ message: 'Killer banned successfully.' });
    } catch (error) {
        if (conn) await conn.rollback();
        console.error(`Error banning killer for match ${matchId}:`, error);
        res.status(500).json({ message: error.message || 'Failed to ban killer.' });
    } finally {
        if (conn) conn.release();
    }
});

app.post('/api/matches', requireRole(ROLES.STAFF), async (req, res) => {
    const { team1, team2, bestOf, round } = req.body;

    if (!team1 || !team2 || !bestOf || !round) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    if (team1 === team2) {
        return res.status(400).json({ message: 'Teams cannot play against themselves' });
    }

    try {
        // Get active tournament
        const [tournaments] = await dbPool.query('SELECT tournament_id FROM Tournaments WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1');
        if (tournaments.length === 0) {
            return res.status(400).json({ message: 'No active tournament found' });
        }
        const tournamentId = tournaments[0].tournament_id;

        const format = `Bo${bestOf}`;

        await dbPool.execute(
            'INSERT INTO Matches (tournament_id, team_a_id, team_b_id, format, round_name) VALUES (?, ?, ?, ?, ?)',
            [tournamentId, team1, team2, format, round]
        );

        res.json({ message: 'Match created successfully' });
    } catch (error) {
        console.error('Error creating match:', error);
        res.status(500).json({ message: 'Error creating match' });
    }
});

// This is now public for the home page, but the admin page still requires ADMIN role.
app.get('/api/bracket/:tournamentId', async (req, res) => { // Renamed from /api/staff/bracket
    const { tournamentId } = req.params;
    try {
        const [matches] = await dbPool.query(
            `SELECT 
                m.match_id, m.round_name, m.winner_id,
                ta.team_id as team_a_id, ta.team_name as team_a_name, ta.logo_url as team_a_logo, ta.role_id as team_a_role_id,
                tb.team_id as team_b_id, tb.team_name as team_b_name, tb.logo_url as team_b_logo, tb.role_id as team_b_role_id
             FROM Brackets m
             LEFT JOIN Teams ta ON m.team_a_id = ta.team_id
             LEFT JOIN Teams tb ON m.team_b_id = tb.team_id
             WHERE m.tournament_id = ?
             ORDER BY m.match_id`,
            [tournamentId]
        );

        // Transform data for brackets-viewer.js
        const participants = [];
        const teams = new Map();

        matches.forEach(m => {
            if (m.team_a_id && !teams.has(m.team_a_id)) {
                teams.set(m.team_a_id, { id: m.team_a_id, name: m.team_a_name });
            }
            if (m.team_b_id && !teams.has(m.team_b_id)) {
                teams.set(m.team_b_id, { id: m.team_b_id, name: m.team_b_name });
            }
        });

        teams.forEach(team => participants.push(team));

        const roundRobinMatches = matches.map(m => {
            let status = 4; // Running
            if (m.winner_id) {
                status = m.winner_id === m.team_a_id ? 1 : (m.winner_id === m.team_b_id ? 2 : 4); // Team 1 wins, Team 2 wins, or still Running
            }
            
            return {
                id: m.match_id,
                stage_id: 0, // All in one stage for single elimination
                group_id: 0,
                round_id: 0, // The library will calculate rounds based on match order and structure.
                opponent1: m.team_a_id ? { id: m.team_a_id, result: m.winner_id === m.team_a_id ? 'win' : (m.winner_id === m.team_b_id ? 'loss' : null) } : null,
                opponent2: m.team_b_id ? { id: m.team_b_id, result: m.winner_id === m.team_b_id ? 'win' : (m.winner_id === m.team_a_id ? 'loss' : null) } : null,
                status: status
            };
        });

        const bracketData = {
            participants: participants, // This was missing
            stages: [{
                id: 0,
                tournament_id: tournamentId,
                name: 'Main Bracket',
                type: 'single_elimination',
                settings: {
                    seedOrdering: ['natural'],
                    grandFinal: 'simple',
                    size: 16
                }
            }],
            matches: roundRobinMatches,
            matchGames: []
        };

        res.json(bracketData);
    } catch (error) {
        console.error('Error fetching bracket data:', error);
        res.status(500).json({ message: 'Error fetching bracket data' });
    }
});

app.get('/api/tournament/:tournamentId/bracket-data-jq', async (req, res) => {
    const { tournamentId } = req.params;
    try {
        const [matches] = await dbPool.query(
            `SELECT 
                m.match_id, m.round_name, m.winner_id,
                m.team_a_id, ta.team_name as team_a_name, ta.logo_url as team_a_logo,
                m.team_b_id, tb.team_name as team_b_name, tb.logo_url as team_b_logo
             FROM Brackets m
             LEFT JOIN Teams ta ON m.team_a_id = ta.team_id
             LEFT JOIN Teams tb ON m.team_b_id = tb.team_id
             WHERE m.tournament_id = ?
             ORDER BY m.match_id`,
            [tournamentId]
        );

        if (matches.length === 0) {
            return res.json({ teams: [], results: [] });
        }

        const matchIds = matches.map(m => m.match_id);
        const [matchSets] = await dbPool.query(
            'SELECT match_id, winner_id FROM MatchSets WHERE match_id IN (?)',
            [matchIds]
        );

        const matchScores = matches.reduce((acc, match) => {
            acc[match.match_id] = { team_a_wins: 0, team_b_wins: 0 };
            return acc;
        }, {});

        matchSets.forEach(set => {
            const match = matches.find(m => m.match_id == set.match_id);
            if (match && set.winner_id) {
                if (set.winner_id == match.team_a_id) {
                    matchScores[set.match_id].team_a_wins++;
                } else if (set.winner_id == match.team_b_id) {
                    matchScores[set.match_id].team_b_wins++;
                }
            }
        });

        // --- Data Transformation for jquery-bracket ---
        const bracketTeams = [];
        const bracketResults = [[], [], [], []]; // 4 rounds for a 16-team bracket

        const firstRoundMatches = matches.slice(0, 8);
        firstRoundMatches.forEach(match => {
            const teamA = match.team_a_id 
                ? { name: match.team_a_name, logo: match.team_a_logo } 
                : { name: 'TBD', logo: null };
            const teamB = match.team_b_id 
                ? { name: match.team_b_name, logo: match.team_b_logo } 
                : { name: 'TBD', logo: null };
            bracketTeams.push([teamA, teamB]);
        });

        // Correctly build results based on match index, not ID
        matches.forEach((match, index) => {
            let roundIndex;
            let matchIndexInRound;

            if (index < 8) { // Round 1
                roundIndex = 0;
                matchIndexInRound = index;
            } else if (index < 12) { // Quarterfinals
                roundIndex = 1;
                matchIndexInRound = index - 8;
            } else if (index < 14) { // Semifinals
                roundIndex = 2;
                matchIndexInRound = index - 12;
            } else if (index < 15) { // Finals
                roundIndex = 3;
                matchIndexInRound = index - 14;
            }

            if (roundIndex !== undefined) {
                let scoreA = null;
                let scoreB = null;

                const scores = matchScores[match.match_id];
                if (scores && (scores.team_a_wins > 0 || scores.team_b_wins > 0)) {
                    scoreA = scores.team_a_wins;
                    scoreB = scores.team_b_wins;
                } else if (match.winner_id && match.team_a_id && match.team_b_id) {
                    // Fallback to old logic if no sets are recorded but a winner is present
                    if (String(match.winner_id) === String(match.team_a_id)) {
                        scoreA = 1;
                        scoreB = 0;
                    } else if (String(match.winner_id) === String(match.team_b_id)) {
                        scoreA = 0;
                        scoreB = 1;
                    }
                }
                bracketResults[roundIndex][matchIndexInRound] = [scoreA, scoreB];
            }
        });
        
        // Fill any gaps in the results array with empty scores
        for (let i = 0; i < bracketResults.length; i++) {
            const roundMatchCount = 8 / Math.pow(2, i);
            for (let j = 0; j < roundMatchCount; j++) {
                if (!bracketResults[i][j]) {
                    bracketResults[i][j] = [null, null];
                }
            }
        }

        res.json({
            teams: bracketTeams,
            results: bracketResults
        });

    } catch (error) {
        console.error('Error fetching jquery-bracket data:', error);
        res.status(500).json({ message: 'Error fetching jquery-bracket data' });
    }
});

async function advanceWinner(matchId, winnerTeamId, conn) {
    try {
        // 1. Find the next match this winner should advance to
        const [matches] = await conn.execute(
            'SELECT winner_advances_to_match_id, winner_advances_to_slot FROM Brackets WHERE match_id = ?',
            [matchId]
        );

        if (matches.length === 0 || !matches[0].winner_advances_to_match_id) {
            console.log(`Match ${matchId} is the final match or has no progression path.`);
            return; // No progression needed
        }

        const { winner_advances_to_match_id: nextMatchId, winner_advances_to_slot: nextSlot } = matches[0];

        // 2. Update the next match with the winner
        const fieldToUpdate = nextSlot === 'A' ? 'team_a_id' : 'team_b_id';
        
        await conn.execute(
            `UPDATE Brackets SET ${fieldToUpdate} = ? WHERE match_id = ?`,
            [winnerTeamId, nextMatchId]
        );

        console.log(`Advanced winner of match ${matchId} (Team ${winnerTeamId}) to slot ${nextSlot} of match ${nextMatchId}.`);

    } catch (error) {
        console.error('Error in advanceWinner function:', error);
        // Re-throw the error to be caught by the calling transaction handler
        throw error;
    }
}

app.post('/api/admin/brackets/:matchId/winner', requireRole(ROLES.STAFF), async (req, res) => {
    const { matchId } = req.params;
    const { winnerTeamId } = req.body;

    if (!winnerTeamId) {
        return res.status(400).json({ message: 'winnerTeamId is required.' });
    }

    const conn = await dbPool.getConnection();
    try {
        await conn.beginTransaction();

        // Get the match details to determine the loser
        const [matches] = await conn.execute('SELECT team_a_id, team_b_id FROM Brackets WHERE match_id = ?', [matchId]);
        if (matches.length === 0) {
            throw new Error('Match not found');
        }
        const { team_a_id, team_b_id } = matches[0];
        const loserTeamId = (String(team_a_id) === String(winnerTeamId)) ? team_b_id : team_a_id;

        // 1. Set the winner and loser for the current match
        await conn.execute('UPDATE Brackets SET winner_id = ?, loser_id = ? WHERE match_id = ?', [winnerTeamId, loserTeamId, matchId]);

        // 2. Automatically advance the winner to the next match
        await advanceWinner(matchId, winnerTeamId, conn);

        await conn.commit();
        res.json({ message: `Winner for match ${matchId} set successfully. Bracket advanced.` });
    } catch (error) {
        await conn.rollback();
        console.error(`Error setting winner for match ${matchId}:`, error);
        res.status(500).json({ message: 'Failed to set winner and advance bracket.' });
    } finally {
        conn.release();
    }
});

app.put('/api/admin/brackets/:matchId/assign-team', requireRole(ROLES.STAFF), async (req, res) => {
    const { matchId } = req.params;
    const { teamId, slot } = req.body; // teamId can now be null to clear a slot

    if (!slot) { // Only slot is strictly required now
        return res.status(400).json({ message: 'slot is required.' });
    }
    if (slot !== 'A' && slot !== 'B') {
        return res.status(400).json({ message: 'Slot must be either "A" or "B".' });
    }

    const conn = await dbPool.getConnection();
    try {
        await conn.beginTransaction();

        const fieldToUpdate = slot === 'A' ? 'team_a_id' : 'team_b_id';
        
        const [result] = await conn.execute(
            `UPDATE Brackets SET ${fieldToUpdate} = ? WHERE match_id = ?`,
            [teamId, matchId] // teamId can be null here
        );

        if (result.affectedRows === 0) {
            await conn.rollback();
            return res.status(404).json({ message: 'Match not found.' });
        }

        await conn.commit();
        res.json({ message: `Team ${teamId === null ? 'cleared' : teamId} assigned to slot ${slot} in match ${matchId} successfully.` });
    } catch (error) {
        await conn.rollback();
        console.error(`Error assigning team to match ${matchId}:`, error);
        res.status(500).json({ message: 'Failed to assign team to match.' });
    } finally {
        conn.release();
    }
});

// --- ADMIN TOURNAMENT ENDPOINTS ---

// GET all tournaments
app.get('/api/admin/tournaments', requireRole(ROLES.ADMIN), async (req, res) => {
    try {
        const [tournaments] = await dbPool.query('SELECT tournament_id, name, start_date, is_active FROM Tournaments ORDER BY start_date DESC');
        res.json(tournaments);
    } catch (error) {
        console.error('Error fetching tournaments:', error);
        res.status(500).json({ message: 'Error fetching tournaments' });
    }
});

// POST create new tournament
app.post('/api/admin/tournaments', requireRole(ROLES.ADMIN), async (req, res) => {
    const { name, start_date, is_active } = req.body;
    if (!name) {
        return res.status(400).json({ message: 'Tournament name is required.' });
    }

    const conn = await dbPool.getConnection();
    try {
        await conn.beginTransaction();

        const [result] = await conn.execute(
            'INSERT INTO Tournaments (name, start_date, is_active) VALUES (?, ?, ?)',
            [name, start_date || null, is_active]
        );
        const tournamentId = result.insertId;

        // --- Create 15 placeholder matches for a 16-team single-elimination bracket ---
        const matchesToInsert = [];

        // Round 1 (8 matches)
        for (let i = 1; i <= 8; i++) {
            matchesToInsert.push({
                round_name: 'Round 1',
                winner_advances_to_match_id: Math.ceil(i / 2) + 8, // Matches 9-12
                winner_advances_to_slot: i % 2 !== 0 ? 'A' : 'B'
            });
        }

        // Quarterfinals (4 matches)
        for (let i = 1; i <= 4; i++) {
            matchesToInsert.push({
                round_name: 'Quarterfinals',
                winner_advances_to_match_id: Math.ceil(i / 2) + 12, // Matches 13-14
                winner_advances_to_slot: i % 2 !== 0 ? 'A' : 'B'
            });
        }

        // Semifinals (2 matches)
        for (let i = 1; i <= 2; i++) {
            matchesToInsert.push({
                round_name: 'Semifinals',
                winner_advances_to_match_id: 15, // Final match
                winner_advances_to_slot: i % 2 !== 0 ? 'A' : 'B'
            });
        }

        // Finals (1 match)
        matchesToInsert.push({
            round_name: 'Finals',
            winner_advances_to_match_id: null,
            winner_advances_to_slot: null
        });

        // Insert matches in order to get correct match_id for winner_advances_to_match_id
        const insertedMatchIds = [];
        for (const matchData of matchesToInsert) {
            const [matchResult] = await conn.execute(
                'INSERT INTO Brackets (tournament_id, round_name, format, team_a_id, team_b_id) VALUES (?, ?, ?, NULL, NULL)',
                [tournamentId, matchData.round_name, 'Bo3'] // Default format to Bo3
            );
            insertedMatchIds.push(matchResult.insertId);
        }

        // Now update winner_advances_to_match_id using the actual inserted IDs
        for (let i = 0; i < matchesToInsert.length; i++) {
            const matchData = matchesToInsert[i];
            const currentMatchId = insertedMatchIds[i];

            if (matchData.winner_advances_to_match_id !== null) {
                const nextMatchDbId = insertedMatchIds[matchData.winner_advances_to_match_id - 1]; // Adjust index
                await conn.execute(
                    'UPDATE Brackets SET winner_advances_to_match_id = ?, winner_advances_to_slot = ? WHERE match_id = ?',
                    [nextMatchDbId, matchData.winner_advances_to_slot, currentMatchId]
                );
            }
        }

        await conn.commit();
        res.status(201).json({ message: 'Tournament created successfully with bracket!', tournament_id: tournamentId });
    } catch (error) {
        await conn.rollback();
        console.error('Error creating tournament and bracket:', error);
        res.status(500).json({ message: 'Error creating tournament and bracket' });
    } finally {
        conn.release();
    }
});

// GET single tournament details
app.get('/api/admin/tournaments/:tournamentId', requireRole(ROLES.ADMIN), async (req, res) => {
    const { tournamentId } = req.params;
    try {
        const [tournaments] = await dbPool.query('SELECT tournament_id, name, start_date, is_active FROM Tournaments WHERE tournament_id = ?', [tournamentId]);
        if (tournaments.length === 0) {
            return res.status(404).json({ message: 'Tournament not found.' });
        }
        res.json(tournaments[0]);
    } catch (error) {
        console.error('Error fetching tournament details:', error);
        res.status(500).json({ message: 'Error fetching tournament details' });
    }
});

// PUT update tournament
app.put('/api/admin/tournaments/:tournamentId', requireRole(ROLES.ADMIN), async (req, res) => {
    const { tournamentId } = req.params;
    const { name, start_date, is_active } = req.body;
    if (!name) {
        return res.status(400).json({ message: 'Tournament name is required.' });
    }
    try {
        const [result] = await dbPool.execute(
            'UPDATE Tournaments SET name = ?, start_date = ?, is_active = ? WHERE tournament_id = ?',
            [name, start_date || null, is_active, tournamentId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Tournament not found.' });
        }
        res.json({ message: 'Tournament updated successfully!' });
    } catch (error) {
        console.error('Error updating tournament:', error);
        res.status(500).json({ message: 'Error updating tournament' });
    }
});

// DELETE tournament
app.delete('/api/admin/tournaments/:tournamentId', requireRole(ROLES.ADMIN), async (req, res) => {
    const { tournamentId } = req.params;
    try {
        const [result] = await dbPool.execute('DELETE FROM Tournaments WHERE tournament_id = ?', [tournamentId]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Tournament not found.' });
        }
        res.json({ message: 'Tournament deleted successfully!' });
    } catch (error) {
        console.error('Error deleting tournament:', error);
        res.status(500).json({ message: 'Error deleting tournament' });
    }
});

app.get('/api/admin/tournaments/:tournamentId/teams', requireRole(ROLES.STAFF), async (req, res) => {
    const { tournamentId } = req.params;
    try {
        const [teams] = await dbPool.query(
            `SELECT t.team_id, t.team_name, t.logo_url 
             FROM Teams t
             JOIN TournamentTeams tt ON t.team_id = tt.team_id
             WHERE tt.tournament_id = ?`,
            [tournamentId]
        );
        res.json(teams);
    } catch (error) {
        console.error('Error fetching teams for tournament:', error);
        res.status(500).json({ message: 'Error fetching teams for tournament' });
    }
});

// POST add team to tournament
app.post('/api/admin/tournaments/:tournamentId/teams', requireRole(ROLES.ADMIN), async (req, res) => {
    const { tournamentId } = req.params;
    const { team_id } = req.body;
    if (!team_id) {
        return res.status(400).json({ message: 'Team ID is required.' });
    }
    try {
        // Check if the team is already in the tournament
        const [existing] = await dbPool.query(
            'SELECT * FROM TournamentTeams WHERE tournament_id = ? AND team_id = ?',
            [tournamentId, team_id]
        );
        if (existing.length > 0) {
            return res.status(409).json({ message: 'Team already in this tournament.' });
        }

        await dbPool.execute(
            'INSERT INTO TournamentTeams (tournament_id, team_id) VALUES (?, ?)',
            [tournamentId, team_id]
        );
        res.status(201).json({ message: 'Team added to tournament successfully!' });
    } catch (error) {
        console.error('Error adding team to tournament:', error);
        res.status(500).json({ message: 'Error adding team to tournament' });
    }
});

// DELETE remove team from tournament
app.delete('/api/admin/tournaments/:tournamentId/teams/:teamId', requireRole(ROLES.ADMIN), async (req, res) => {
    const { tournamentId, teamId } = req.params;
    try {
        const [result] = await dbPool.execute(
            'DELETE FROM TournamentTeams WHERE tournament_id = ? AND team_id = ?',
            [tournamentId, teamId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Team not found in this tournament.' });
        }
        res.json({ message: 'Team removed from tournament successfully!' });
    } catch (error) {
        console.error('Error removing team from tournament:', error);
        res.status(500).json({ message: 'Error removing team from tournament' });
    }
});

app.post('/api/admin/tournaments/:tournamentId/generate-matches', requireRole(ROLES.ADMIN), async (req, res) => {
    const { tournamentId } = req.params;
    const conn = await dbPool.getConnection();
    try {
        await conn.beginTransaction();

        // 1. Get all bracket matches with two teams assigned for the tournament
        const [bracketMatches] = await conn.execute(
            `SELECT match_id, tournament_id, team_a_id, team_b_id, round_name, format 
             FROM Brackets 
             WHERE tournament_id = ? AND team_a_id IS NOT NULL AND team_b_id IS NOT NULL`,
            [tournamentId]
        );

        if (bracketMatches.length === 0) {
            await conn.rollback();
            return res.status(404).json({ message: 'No bracket matches with two assigned teams found for this tournament.' });
        }

        // 2. Get all existing playable matches that are already linked to a bracket match
        const [existingPlayableMatches] = await conn.execute(
            'SELECT bracket_match_id FROM Matches WHERE bracket_match_id IS NOT NULL AND tournament_id = ?',
            [tournamentId]
        );
        const existingBracketIds = new Set(existingPlayableMatches.map(m => m.bracket_match_id));

        let createdCount = 0;

        // 3. For each bracket match, create a playable match if it doesn't exist
        for (const bracketMatch of bracketMatches) {
            if (!existingBracketIds.has(bracketMatch.match_id)) {
                await conn.execute(
                    `INSERT INTO Matches (tournament_id, bracket_match_id, team_a_id, team_b_id, round_name, format) 
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                        bracketMatch.tournament_id,
                        bracketMatch.match_id,
                        bracketMatch.team_a_id,
                        bracketMatch.team_b_id,
                        bracketMatch.round_name,
                        bracketMatch.format
                    ]
                );
                createdCount++;
            }
        }

        await conn.commit();
        res.json({ message: `${createdCount} new playable match(es) created. ${bracketMatches.length - createdCount} matches already existed.` });

    } catch (error) {
        await conn.rollback();
        console.error('Error generating playable matches:', error);
        res.status(500).json({ message: 'Failed to generate playable matches.' });
    } finally {
        conn.release();
    }
});


// --- OVERLAY ENDPOINTS ---

// GET overlay by slug (public)
app.get('/api/overlay/:token', async (req, res) => {
    const { token } = req.params;
    try {
        const [overlays] = await dbPool.query('SELECT layout_config FROM Overlays WHERE unique_url_token = ?', [token]);
        if (overlays.length === 0) {
            return res.status(404).json({ message: 'Overlay not found.' });
        }
        const layout = JSON.parse(overlays[0].layout_config || '[]');
        
        // For consistency with the editor's expectation of an 'elements' property
        res.json({
            elements: layout
        });
    } catch (error) {
        console.error('Error fetching overlay by token:', error);
        res.status(500).json({ message: 'Error fetching overlay data' });
    }
});

// GET all overlays
app.get('/api/admin/overlays', requireRole(ROLES.ADMIN), async (req, res) => {
    try {
        const [overlays] = await dbPool.query('SELECT overlay_id, name, description, unique_url_token FROM Overlays ORDER BY created_at DESC');
        res.json(overlays);
    } catch (error) {
        console.error('Error fetching overlays:', error);
        res.status(500).json({ message: 'Error fetching overlays' });
    }
});

// POST create new overlay
app.post('/api/admin/overlays', requireRole(ROLES.ADMIN), async (req, res) => {
    const { name, unique_url_token, description } = req.body;
    if (!name || !unique_url_token) {
        return res.status(400).json({ message: 'Overlay name and token are required.' });
    }
    if (!/^[a-z0-9-]+$/.test(unique_url_token)) {
        return res.status(400).json({ message: 'Token can only contain lowercase letters, numbers, and hyphens.' });
    }

    try {
        const [result] = await dbPool.execute(
            'INSERT INTO Overlays (name, description, unique_url_token, layout_config) VALUES (?, ?, ?, ?)',
            [name, description || null, unique_url_token, '[]']
        );
        res.status(201).json({ message: 'Overlay created successfully!', overlay_id: result.insertId });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'An overlay with this token already exists.' });
        }
        console.error('Error creating overlay:', error);
        res.status(500).json({ message: 'Error creating overlay' });
    }
});

// PUT update overlay
app.put('/api/admin/overlays/:overlayId', requireRole(ROLES.ADMIN), async (req, res) => {
    const { overlayId } = req.params;
    const { name, unique_url_token, description } = req.body;
    if (!name || !unique_url_token) {
        return res.status(400).json({ message: 'Overlay name and token are required.' });
    }
    if (!/^[a-z0-9-]+$/.test(unique_url_token)) {
        return res.status(400).json({ message: 'Token can only contain lowercase letters, numbers, and hyphens.' });
    }

    try {
        const [result] = await dbPool.execute(
            'UPDATE Overlays SET name = ?, description = ?, unique_url_token = ? WHERE overlay_id = ?',
            [name, description || null, unique_url_token, overlayId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Overlay not found.' });
        }
        res.json({ message: 'Overlay updated successfully!' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'An overlay with this token already exists.' });
        }
        console.error('Error updating overlay:', error);
        res.status(500).json({ message: 'Error updating overlay' });
    }
});

// DELETE overlay
app.delete('/api/admin/overlays/:overlayId', requireRole(ROLES.ADMIN), async (req, res) => {
    const { overlayId } = req.params;
    try {
        const [result] = await dbPool.execute('DELETE FROM Overlays WHERE overlay_id = ?', [overlayId]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Overlay not found.' });
        }
        res.json({ message: 'Overlay deleted successfully!' });
    } catch (error) {
        console.error('Error deleting overlay:', error);
        res.status(500).json({ message: 'Error deleting overlay' });
    }
});

// GET all elements for an overlay
app.get('/api/admin/overlays/:overlayId/elements', requireRole(ROLES.ADMIN), async (req, res) => {
    const { overlayId } = req.params;
    try {
        const [rows] = await dbPool.query('SELECT layout_config FROM Overlays WHERE overlay_id = ?', [overlayId]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Overlay not found.' });
        }
        res.json(JSON.parse(rows[0].layout_config || '[]'));
    } catch (error) {
        console.error('Error fetching overlay elements:', error);
        res.status(500).json({ message: 'Error fetching overlay elements' });
    }
});

// POST create new element
app.post('/api/admin/overlays/:overlayId/elements', requireRole(ROLES.ADMIN), async (req, res) => {
    const { overlayId } = req.params;
    const { type, content, position_x, position_y, width, height, style } = req.body;
    const conn = await dbPool.getConnection();
    try {
        await conn.beginTransaction();
        const [rows] = await conn.query('SELECT layout_config FROM Overlays WHERE overlay_id = ? FOR UPDATE', [overlayId]);
        if (rows.length === 0) {
            await conn.rollback();
            return res.status(404).json({ message: 'Overlay not found.' });
        }
        
        const layout = JSON.parse(rows[0].layout_config || '[]');
        const newElement = { 
            element_id: Date.now(), // Use timestamp as a unique ID within the layout
            type, content, position_x, position_y, width, height, 
            style: style || {}
        };
        layout.push(newElement);

        await conn.execute('UPDATE Overlays SET layout_config = ? WHERE overlay_id = ?', [JSON.stringify(layout), overlayId]);
        await conn.commit();
        
        res.status(201).json(newElement);
    } catch (error) {
        await conn.rollback();
        console.error('Error creating overlay element:', error);
        res.status(500).json({ message: 'Error creating overlay element' });
    } finally {
        conn.release();
    }
});

// PUT update element
app.put('/api/admin/overlays/:overlayId/elements/:elementId', requireRole(ROLES.ADMIN), async (req, res) => {
    const { overlayId, elementId } = req.params;
    const updatedElementData = req.body;

    const conn = await dbPool.getConnection();
    try {
        await conn.beginTransaction();
        const [rows] = await conn.query('SELECT layout_config FROM Overlays WHERE overlay_id = ? FOR UPDATE', [overlayId]);
        if (rows.length === 0) {
            await conn.rollback();
            return res.status(404).json({ message: 'Overlay not found.' });
        }

        let layout = JSON.parse(rows[0].layout_config || '[]');
        const elementIndex = layout.findIndex(el => el.element_id == elementId);

        if (elementIndex === -1) {
            await conn.rollback();
            return res.status(404).json({ message: 'Element not found in layout.' });
        }

        // Preserve the original element_id while updating other properties
        layout[elementIndex] = { ...layout[elementIndex], ...updatedElementData, element_id: layout[elementIndex].element_id };

        await conn.execute('UPDATE Overlays SET layout_config = ? WHERE overlay_id = ?', [JSON.stringify(layout), overlayId]);
        await conn.commit();

        res.json({ message: 'Element updated successfully!' });
    } catch (error) {
        await conn.rollback();
        console.error('Error updating overlay element:', error);
        res.status(500).json({ message: 'Error updating overlay element' });
    } finally {
        conn.release();
    }
});


// DELETE element
app.delete('/api/admin/overlays/:overlayId/elements/:elementId', requireRole(ROLES.ADMIN), async (req, res) => {
    const { overlayId, elementId } = req.params;
    
    const conn = await dbPool.getConnection();
    try {
        await conn.beginTransaction();
        const [rows] = await conn.query('SELECT layout_config FROM Overlays WHERE overlay_id = ? FOR UPDATE', [overlayId]);
        if (rows.length === 0) {
            await conn.rollback();
            return res.status(404).json({ message: 'Overlay not found.' });
        }

        let layout = JSON.parse(rows[0].layout_config || '[]');
        const newLayout = layout.filter(el => el.element_id != elementId);

        if (layout.length === newLayout.length) {
            await conn.rollback();
            return res.status(404).json({ message: 'Element not found in layout.' });
        }

        await conn.execute('UPDATE Overlays SET layout_config = ? WHERE overlay_id = ?', [JSON.stringify(newLayout), overlayId]);
        await conn.commit();

        res.json({ message: 'Element deleted successfully!' });
    } catch (error) {
        await conn.rollback();
        console.error('Error deleting overlay element:', error);
        res.status(500).json({ message: 'Error deleting overlay element' });
    } finally {
        conn.release();
    }
});

// POST to play a video on all overlays
app.post('/api/admin/overlays/play-video', requireRole(ROLES.ADMIN), (req, res) => {
    const { videoUrl } = req.body;
    if (!videoUrl) {
        return res.status(400).json({ message: 'videoUrl is required.' });
    }

    const { wss } = req.app.locals;
    if (!wss) {
        return res.status(500).json({ message: 'WebSocket server is not initialized.' });
    }

    const message = JSON.stringify({
        type: 'play_video',
        payload: {
            url: videoUrl
        }
    });

    let clientCount = 0;
    wss.clients.forEach(client => {
        if (client.readyState === 1) { // WebSocket.OPEN
            client.send(message);
            clientCount++;
        }
    });

    res.json({ message: `Play video command sent to ${clientCount} overlay(s).` });
});


// New API endpoint to clear all team assignments for a tournament
app.delete('/api/admin/tournaments/:tournamentId/brackets/teams', requireRole(ROLES.ADMIN), async (req, res) => {
    const { tournamentId } = req.params;
    const conn = await dbPool.getConnection();
    try {
        await conn.beginTransaction();
        const [result] = await conn.execute(
            'UPDATE Brackets SET team_a_id = NULL, team_b_id = NULL, winner_id = NULL, loser_id = NULL WHERE tournament_id = ?',
            [tournamentId]
        );
        await conn.commit();
        res.json({ message: `All team assignments for tournament ${tournamentId} cleared successfully.` });
    } catch (error) {
        await conn.rollback();
        console.error('Error clearing all team assignments:', error);
        res.status(500).json({ message: 'Error clearing all team assignments.' });
    } finally {
        conn.release();
    }
});

// New API endpoint to get all matches for a tournament
app.get('/api/tournament/:tournamentId/brackets', async (req, res) => {
    const { tournamentId } = req.params;
    try {
        const [matches] = await dbPool.query(
            `SELECT match_id, team_a_id, team_b_id, round_name, winner_advances_to_match_id, winner_advances_to_slot
             FROM Brackets
             WHERE tournament_id = ?
             ORDER BY match_id`,
            [tournamentId]
        );
        res.json(matches);
    } catch (error) {
        console.error('Error fetching matches for tournament:', error);
        res.status(500).json({ message: 'Error fetching matches for tournament' });
    }
});

app.get('/api/brackets/:matchId', requireRole(ROLES.STAFF), async (req, res) => {
    const { matchId } = req.params;
    let conn;
    try {
        conn = await dbPool.getConnection();
        const [matches] = await conn.execute(
            `SELECT m.match_id, m.team_a_id, m.team_b_id, 
                    tA.team_name as team_a_name, tA.captain_id as team_a_captain_id,
                    tB.team_name as team_b_name, tB.captain_id as team_b_captain_id
             FROM Brackets m
             LEFT JOIN Teams tA ON m.team_a_id = tA.team_id
             LEFT JOIN Teams tB ON m.team_b_id = tB.team_id
             WHERE m.match_id = ?`,
            [matchId]
        );

        if (matches.length === 0) {
            return res.status(404).json({ message: 'Match not found.' });
        }
        res.json(matches[0]);
    } catch (error) {
        console.error(`Error fetching details for match ${matchId}:`, error);
        res.status(500).json({ message: 'Error fetching match details.' });
    } finally {
        if (conn) conn.release();
    }
});

app.get('/api/match/:matchId/details', requireRole(ROLES.STAFF), async (req, res) => {
    const { matchId } = req.params;
    const conn = await dbPool.getConnection();
    try {
        // 1. Get Match, Team, and Pick/Ban info in parallel
        const [matchInfo, killers, pickBanStatus] = await Promise.all([
            conn.query(`
                SELECT 
                    m.match_id, m.round_name, m.format, m.winner_id as match_winner_id,
                    tA.team_id as team_a_id, tA.team_name as team_a_name, tA.logo_url as team_a_logo,
                    tB.team_id as team_b_id, tB.team_name as team_b_name, tB.logo_url as team_b_logo
                FROM Matches m
                JOIN Teams tA ON m.team_a_id = tA.team_id
                JOIN Teams tB ON m.team_b_id = tB.team_id
                WHERE m.match_id = ?
            `, [matchId]),
            conn.query('SELECT killer_id, killer_name FROM Killers WHERE allowed = 1 ORDER BY killer_name'),
            conn.query('SELECT picked_killers FROM PickBanSessions WHERE match_id = ?', [matchId])
        ]);

        if (!matchInfo[0] || matchInfo[0].length === 0) {
            return res.status(404).json({ message: 'Match not found.' });
        }
        const match = matchInfo[0][0];

        // Determine which team picked which killer
        const pickedKillers = pickBanStatus[0].length > 0 ? JSON.parse(pickBanStatus[0][0].picked_killers || '{}') : {};
        match.team_a_picked_killer = pickedKillers.team_a;
        match.team_b_picked_killer = pickedKillers.team_b;
        match.tiebreaker_killer = pickedKillers.tiebreaker;

        // 2. Get players for both teams in parallel
        const [teamAMembers, teamBMembers] = await Promise.all([
            conn.query(`
                SELECT u.user_id, u.username 
                FROM Users u
                JOIN TeamMembers tm ON u.user_id = tm.user_id
                WHERE tm.team_id = ?
            `, [match.team_a_id]),
            conn.query(`
                SELECT u.user_id, u.username 
                FROM Users u
                JOIN TeamMembers tm ON u.user_id = tm.user_id
                WHERE tm.team_id = ?
            `, [match.team_b_id])
        ]);
        match.team_a_members = teamAMembers[0];
        match.team_b_members = teamBMembers[0];

        // 3. Get or Create MatchSets and associated Games
        let [sets] = await conn.query('SELECT * FROM MatchSets WHERE match_id = ? ORDER BY set_number', [matchId]);

        if (sets.length === 0) {
            // If no sets exist, create them based on the new logic
            await conn.beginTransaction();

            // Set 1 (Team A's pick)
            const [set1Result] = await conn.execute('INSERT INTO MatchSets (match_id, set_number, is_active) VALUES (?, 1, 1)', [matchId]);
            const set1Id = set1Result.insertId;
            const [game1Result] = await conn.execute('INSERT INTO MatchGames (set_id, game_number, killer_team_id, survivor_team_id, killer_id) VALUES (?, 1, ?, ?, ?)', [set1Id, match.team_a_id, match.team_b_id, match.team_a_picked_killer]);
            for (let i = 1; i <= 4; i++) await conn.execute('INSERT INTO GameSurvivors (game_id, survivor_slot) VALUES (?, ?)', [game1Result.insertId, i]);
            const [game2Result] = await conn.execute('INSERT INTO MatchGames (set_id, game_number, killer_team_id, survivor_team_id, killer_id) VALUES (?, 2, ?, ?, ?)', [set1Id, match.team_b_id, match.team_a_id, match.team_a_picked_killer]);
            for (let i = 1; i <= 4; i++) await conn.execute('INSERT INTO GameSurvivors (game_id, survivor_slot) VALUES (?, ?)', [game2Result.insertId, i]);

            // Set 2 (Team B's pick)
            const [set2Result] = await conn.execute('INSERT INTO MatchSets (match_id, set_number) VALUES (?, 2)', [matchId]);
            const set2Id = set2Result.insertId;
            const [game3Result] = await conn.execute('INSERT INTO MatchGames (set_id, game_number, killer_team_id, survivor_team_id, killer_id) VALUES (?, 1, ?, ?, ?)', [set2Id, match.team_b_id, match.team_a_id, match.team_b_picked_killer]);
            for (let i = 1; i <= 4; i++) await conn.execute('INSERT INTO GameSurvivors (game_id, survivor_slot) VALUES (?, ?)', [game3Result.insertId, i]);
            const [game4Result] = await conn.execute('INSERT INTO MatchGames (set_id, game_number, killer_team_id, survivor_team_id, killer_id) VALUES (?, 2, ?, ?, ?)', [set2Id, match.team_a_id, match.team_b_id, match.team_b_picked_killer]);
            for (let i = 1; i <= 4; i++) await conn.execute('INSERT INTO GameSurvivors (game_id, survivor_slot) VALUES (?, ?)', [game4Result.insertId, i]);

            // Tiebreaker Set
            const [set3Result] = await conn.execute('INSERT INTO MatchSets (match_id, set_number, tiebreaker) VALUES (?, 3, 1)', [matchId]);
            const set3Id = set3Result.insertId;
            const [game5Result] = await conn.execute('INSERT INTO MatchGames (set_id, game_number, killer_team_id, survivor_team_id, killer_id) VALUES (?, 1, ?, ?, ?)', [set3Id, match.team_a_id, match.team_b_id, match.tiebreaker_killer]);
            for (let i = 1; i <= 4; i++) await conn.execute('INSERT INTO GameSurvivors (game_id, survivor_slot) VALUES (?, ?)', [game5Result.insertId, i]);
            const [game6Result] = await conn.execute('INSERT INTO MatchGames (set_id, game_number, killer_team_id, survivor_team_id, killer_id) VALUES (?, 2, ?, ?, ?)', [set3Id, match.team_b_id, match.team_a_id, match.tiebreaker_killer]);
            for (let i = 1; i <= 4; i++) await conn.execute('INSERT INTO GameSurvivors (game_id, survivor_slot) VALUES (?, ?)', [game6Result.insertId, i]);

            await conn.commit();
            // Refetch the newly created sets
            [sets] = await conn.query('SELECT * FROM MatchSets WHERE match_id = ? ORDER BY set_number', [matchId]);
        }

        // 4. Get Games and Survivors for each set
        for (const set of sets) {
            const [games] = await conn.query('SELECT * FROM MatchGames WHERE set_id = ? ORDER BY game_number', [set.set_id]);
            for (const game of games) {
                const [survivors] = await conn.query('SELECT * FROM GameSurvivors WHERE game_id = ?', [game.game_id]);
                game.survivors = survivors;
            }
            set.games = games;
        }

        res.json({
            match,
            killers: killers[0],
            sets
        });

    } catch (error) {
        console.error(`Error fetching full match details for match ${matchId}:`, error);
        res.status(500).json({ message: 'Error fetching full match details.', error: error.message });
    } finally {
        conn.release();
    }
});


// --- MATCH MANAGEMENT API ---

app.put('/api/match-games/:gameId', requireRole(ROLES.STAFF), async (req, res) => {
    const { gameId } = req.params;
    const { killer_id, gens_remaining } = req.body;

    if (killer_id === undefined && gens_remaining === undefined) {
        return res.status(400).json({ message: 'No updateable fields provided.' });
    }

    let updateFields = [];
    let updateValues = [];

    if (killer_id !== undefined) {
        updateFields.push('killer_id = ?');
        updateValues.push(killer_id === '' ? null : killer_id);
    }
    if (gens_remaining !== undefined) {
        updateFields.push('gens_remaining = ?');
        updateValues.push(gens_remaining);
    }
    updateValues.push(gameId);

    try {
        const [result] = await dbPool.execute(
            `UPDATE MatchGames SET ${updateFields.join(', ')} WHERE game_id = ?`,
            updateValues
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Match game not found.' });
        }
        res.json({ message: 'Game updated successfully.' });
    } catch (error) {
        console.error(`Error updating game ${gameId}:`, error);
        res.status(500).json({ message: 'Failed to update game.', error: error.message });
    }
});

app.put('/api/game-survivors', requireRole(ROLES.STAFF), async (req, res) => {
    const { game_id, survivor_slot, survivor_id, hook_state } = req.body;

    if (!game_id || !survivor_slot) {
        return res.status(400).json({ message: 'game_id and survivor_slot are required.' });
    }

    let updateFields = [];
    let updateValues = [];

    if (survivor_id !== undefined) {
        updateFields.push('survivor_id = ?');
        updateValues.push(survivor_id === '' ? null : survivor_id);
    }
    if (hook_state !== undefined) {
        updateFields.push('hook_state = ?');
        updateValues.push(hook_state);
    }
    
    if (updateFields.length === 0) {
        return res.status(400).json({ message: 'No updateable fields provided (survivor_id or hook_state).' });
    }

    updateValues.push(game_id);
    updateValues.push(survivor_slot);

    try {
        // If a new survivor is being assigned, reset their hook state
        if (survivor_id !== undefined && hook_state === undefined) {
            updateFields.push('hook_state = 0');
        }

        const [result] = await dbPool.execute(
            `UPDATE GameSurvivors SET ${updateFields.join(', ')} WHERE game_id = ? AND survivor_slot = ?`,
            updateValues
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Game survivor slot not found.' });
        }
        res.json({ message: 'Survivor slot updated successfully.' });
    } catch (error) {
        // Catch duplicate entry for survivor_id in the same game
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'This survivor is already in another slot for this game.' });
        }
        console.error('Error updating game survivor:', error);
        res.status(500).json({ message: 'Failed to update survivor slot.', error: error.message });
    }
});

app.put('/api/match-sets/:setId/active', requireRole(ROLES.STAFF), async (req, res) => {
    const { setId } = req.params;
    const { is_active } = req.body;

    if (is_active === undefined) {
        return res.status(400).json({ message: 'is_active is required.' });
    }

    const conn = await dbPool.getConnection();
    try {
        await conn.beginTransaction();

        // First, get the match_id for the given set
        const [set] = await conn.execute('SELECT match_id FROM MatchSets WHERE set_id = ?', [setId]);
        if (set.length === 0) {
            throw new Error('Set not found');
        }
        const { match_id } = set[0];

        // If we are activating a set, we must deactivate all other sets for THIS match.
        if (is_active) {
            await conn.execute('UPDATE MatchSets SET is_active = 0 WHERE match_id = ?', [match_id]);
        }

        // Now, set the state for the target set.
        const [result] = await conn.execute(
            'UPDATE MatchSets SET is_active = ? WHERE set_id = ?',
            [is_active == 'true' ? 1 : 0, setId]
        );
        
        await conn.commit();

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Match set not found.' });
        }
        res.json({ message: 'Set active status updated.' });
    } catch (error) {
        await conn.rollback();
        // Check for lock wait timeout error specifically
        if (error.code === 'ER_LOCK_WAIT_TIMEOUT') {
            console.error(`Lock wait timeout for set ${setId}:`, error);
            return res.status(503).json({ message: 'Database is busy, please try again in a moment.' });
        }
        console.error(`Error updating active status for set ${setId}:`, error);
        res.status(500).json({ message: 'Failed to update set status.', error: error.message });
    } finally {
        conn.release();
    }
});

app.post('/api/match-sets/:setId/declare-winner', requireRole(ROLES.STAFF), async (req, res) => {
    const { setId } = req.params;
    const { winner_id } = req.body; // Winner is now manually provided

    if (!winner_id) {
        return res.status(400).json({ message: 'winner_id is required.' });
    }

    const conn = await dbPool.getConnection();
    try {
        await conn.beginTransaction();

        // 1. Get set, match, and team info
        const [setInfo] = await conn.execute(
            `SELECT s.match_id, m.team_a_id, m.team_b_id 
             FROM MatchSets s 
             JOIN Matches m ON s.match_id = m.match_id 
             WHERE s.set_id = ?`, [setId]
        );
        if (setInfo.length === 0) throw new Error('Set not found or not linked to a match.');
        const { match_id, team_a_id, team_b_id } = setInfo[0];

        // 2. Update the set with the manually chosen winner
        await conn.execute(
            'UPDATE MatchSets SET winner_id = ? WHERE set_id = ?',
            [winner_id, setId]
        );

        // 3. Check if this determines the match winner
        const [allSets] = await conn.execute('SELECT winner_id FROM MatchSets WHERE match_id = ?', [match_id]);
        const teamAWins = allSets.filter(s => String(s.winner_id) === String(team_a_id)).length;
        const teamBWins = allSets.filter(s => String(s.winner_id) === String(team_b_id)).length;

        // Assuming Bo3 format for now. First to 2 wins.
        let matchWinnerId = null;
        if (teamAWins >= 2) matchWinnerId = team_a_id;
        if (teamBWins >= 2) matchWinnerId = team_b_id;

        if (matchWinnerId) {
            // Update match winner
            await conn.execute('UPDATE Matches SET winner_id = ? WHERE match_id = ?', [matchWinnerId, match_id]);
            // TODO: Implement bracket progression logic if this match is part of a bracket
            // await advanceWinner(match_id, matchWinnerId, conn);
        }

        await conn.commit();
        res.json({ 
            message: `Set winner declared successfully.`,
            matchWinner: matchWinnerId ? `Match winner is Team ${matchWinnerId}` : 'Match continues.'
        });

    } catch (error) {
        await conn.rollback();
        console.error(`Error declaring winner for set ${setId}:`, error);
        res.status(500).json({ message: 'Failed to declare winner.', error: error.message });
    } finally {
        conn.release();
    }
});






// New API endpoint to get the active tournament ID
app.get('/api/tournaments/active', async (req, res) => {
    try {
        const [tournaments] = await dbPool.query(
            'SELECT tournament_id FROM Tournaments WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1'
        );
        if (tournaments.length > 0) {
            res.json({ tournament_id: tournaments[0].tournament_id });
        } else {
            res.json({ tournament_id: null, message: 'No active tournament found.' });
        }
    } catch (error) {
        console.error('Error fetching active tournament:', error);
        res.status(500).json({ message: 'Error fetching active tournament' });
    }
});

app.post('/api/matches/:matchId/start-pick-ban', requireRole(ROLES.STAFF), async (req, res) => {
    const { matchId } = req.params;
    const bot = req.app.locals.bot;

    if (!bot.startPickBan) {
        console.error('Bot is not ready or pick/ban function is not available.');
        return res.status(500).json({ message: 'Bot is not ready or pick/ban function is not available.' });
    }

    try {
        // Intentionally not awaiting this. The bot will handle the process asynchronously.
        // The web request should return immediately to not time out.
        bot.startPickBan(matchId, req.user);
        
        res.json({ message: 'Pick/ban process initiated in Discord.' });
    } catch (error) {
        console.error(`Error starting pick/ban for match ${matchId}:`, error);
        res.status(500).json({ message: 'Failed to start pick/ban process.' });
    }
});

// --- CAPTAIN ENDPOINTS ---
app.post('/api/captain/team/color', requireRole(ROLES.CAPTAIN), async (req, res) => {
    const { newColor } = req.body;
    const captainUserId = req.user.userId;

    if (!newColor) {
        return res.status(400).json({ message: 'New color is required.' });
    }

    // Validate if the newColor is in the predefined TEAM_COLORS
    if (!TEAM_COLORS.includes(newColor)) {
        //return res.status(400).json({ message: 'Invalid color. Please choose from the available colors.' });
    }

    let conn;
    try {
        conn = await dbPool.getConnection();
        // Find the team where the current user is the captain
        const [teams] = await conn.execute('SELECT team_id, team_name, role_id FROM Teams WHERE captain_id = ?', [captainUserId]);

        if (teams.length === 0) {
            return res.status(404).json({ message: 'You are not a captain of any team.' });
        }
        if (teams.length > 1) {
            // This scenario should ideally not happen if a user can only captain one team
            console.warn(`User ${captainUserId} is captain of multiple teams. Using the first one found.`);
        }

        const team = teams[0];
        const { team_id, team_name, role_id } = team;

        if (!role_id) {
            return res.status(500).json({ message: `Team ${team_name} does not have an associated Discord role.` });
        }

        const bot = req.app.locals.bot;
        const guild = await bot.guilds.fetch(DISCORD_GUILD_ID);
        const discordRole = await guild.roles.fetch(role_id);

        if (!discordRole) {
            return res.status(404).json({ message: `Discord role with ID ${role_id} not found for team ${team_name}.` });
        }

        // Update the Discord role color
        await discordRole.edit({ color: newColor }, `Team color updated by captain ${req.user.username}`);

        // Send Discord notification
        try {
            const adminChannel = await req.app.locals.bot.channels.fetch(DISCORD_ADMIN_BOT_CHANNEL);
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
        } catch (discordError) {
            console.error('Failed to send Discord notification for team color update:', discordError);
        }

        res.json({ message: `Team ${team_name} color updated successfully to ${newColor}.` });

    } catch (error) {
        console.error('Error updating team color:', error);
        res.status(500).json({ message: 'Error updating team color.' });
    } finally {
        if (conn) conn.release();
    }
});

app.get('/api/discord/role/:roleId', requireRole(ROLES.STAFF), async (req, res) => {
    const { roleId } = req.params;
    try {
        const bot = req.app.locals.bot;
        const guild = await bot.guilds.fetch(DISCORD_GUILD_ID);
        const role = await guild.roles.fetch(roleId);

        if (!role) {
            return res.status(404).json({ message: 'Discord role not found' });
        }

        // Discord role colors are integers, convert to hex for client-side
        const hexColor = '#' + role.color.toString(16).padStart(6, '0').toUpperCase();
        res.json({ id: role.id, name: role.name, color: hexColor });

    } catch (error) {
        console.error(`Error fetching Discord role ${roleId}:`, error);
        res.status(500).json({ message: 'Error fetching Discord role' });
    }
});

app.put('/api/staff/teams/:id', requireRole(ROLES.STAFF), upload.single('logo'), async (req, res) => {
    const { teamName, captainId, members, roleColor } = req.body;
    const teamId = req.params.id;
    let logoUrl = req.body.existingLogo || null;

    if (req.file) {
        logoUrl = `/public/uploads/${req.file.filename}`;
    }

    const conn = await dbPool.getConnection();
    try {
        await conn.beginTransaction();

        // Get old team data before updating
        const [oldTeams] = await conn.execute('SELECT * FROM Teams WHERE team_id = ?', [teamId]);
        if (oldTeams.length === 0) {
            await conn.rollback();
            return res.status(404).json({ message: 'Team not found' });
        }
        const oldTeam = oldTeams[0];
        const { team_name: oldTeamName, role_id: oldRoleId, channel_id: oldChannelId, captain_id: oldCaptainId } = oldTeam;

        const bot = req.app.locals.bot;
        const guild = await bot.guilds.fetch(DISCORD_GUILD_ID);

        // If team name is changing, update Discord objects
        if (oldTeamName !== teamName) {
            // Update Role
            if (oldRoleId) {
                try {
                    const role = await guild.roles.fetch(oldRoleId);
                    if (role) {
                        await role.edit({ name: teamName }, 'Team name updated via website');
                    }
                } catch (err) {
                    console.error(`Could not find or edit role ${oldRoleId}:`, err);
                }
            }

            // Update Channel
            if (oldChannelId) {
                try {
                    const channel = await guild.channels.fetch(oldChannelId);
                    if (channel) {
                        await channel.edit({ name: teamName }, 'Team name updated via website');
                    }
                } catch (err) {
                    console.error(`Could not find or edit channel ${oldChannelId}:`, err);
                }
            }
        }

        // If role color is changing, update Discord role
        let oldRoleColor = null;
        if (oldRoleId) {
            try {
                const role = await guild.roles.fetch(oldRoleId);
                if (role) {
                    oldRoleColor = '#' + role.color.toString(16).padStart(6, '0').toUpperCase();
                }
            } catch (err) {
                console.error(`Could not fetch old role color for ${oldRoleId}:`, err);
            }
        }

        if (roleColor) { // Only validate if roleColor is provided in the request
            if (!TEAM_COLORS.includes(roleColor)) {
                //await conn.rollback();
                //return res.status(400).json({ message: 'Invalid color. Please choose from the available colors.' });
            }
        }

        if (oldRoleId && roleColor && roleColor !== oldRoleColor) {
            try {
                const role = await guild.roles.fetch(oldRoleId);
                if (role) {
                    await role.edit({ color: roleColor }, 'Team color updated via website');
                }
            } catch (err) {
                console.error(`Could not find or edit role color for ${oldRoleId}:`, err);
            }
        }

        // Ensure all members exist in the Users table
        const memberIds = JSON.parse(members);
        for (const userId of memberIds) {
            const [user] = await conn.execute('SELECT * FROM Users WHERE user_id = ?', [userId]);
            if (user.length === 0) {
                const member = await guild.members.fetch(userId);
                if (member) {
                    await conn.execute('INSERT INTO Users (user_id, username) VALUES (?, ?)', [member.id, member.user.username]);
                } else {
                    console.warn(`User with ID ${userId} not found in the guild. Skipping.`);
                }
            }
        }

        await conn.execute(
            'UPDATE Teams SET team_name = ?, captain_id = ?, logo_url = ? WHERE team_id = ?',
            [teamName, captainId, logoUrl, teamId]
        );

        await conn.execute('DELETE FROM TeamMembers WHERE team_id = ?', [teamId]);
        
        const memberValues = memberIds.map(userId => [teamId, userId]);
        if (memberValues.length > 0) {
            await conn.query('INSERT INTO TeamMembers (team_id, user_id) VALUES ?', [memberValues]);
        }
        
        await conn.commit();

        // Send Discord notification for update
        try {
            const adminChannel = await req.app.locals.bot.channels.fetch(DISCORD_ADMIN_BOT_CHANNEL);
            if (adminChannel) {
                const changes = [];
                if (oldTeamName !== teamName) {
                    changes.push(`**Name:** "${oldTeamName}" -> "${teamName}"`);
                }
                if (oldCaptainId.toString() !== captainId) {
                    changes.push(`**Captain:** <@${oldCaptainId}> -> <@${captainId}>`);
                }
                if (roleColor && roleColor !== oldRoleColor) {
                    changes.push(`**Color:** ${oldRoleColor || 'Default'} -> ${roleColor}`);
                }
                // A more complex diff could be done for members if needed

                const embed = new EmbedBuilder()
                    .setColor('#0099ff') // Blue for update
                    .setTitle('Team Updated')
                    .addFields(
                        { name: 'Team', value: teamName, inline: true },
                        { name: 'Updated By', value: req.user.username, inline: true }
                    )
                    .setTimestamp();

                if (changes.length > 0) {
                    embed.setDescription(changes.join('\n'));
                } else {
                    embed.setDescription('Logo or member list was updated.');
                }

                await adminChannel.send({ embeds: [embed] });
            }
        } catch (discordError) {
            console.error('Failed to send Discord notification for team update:', discordError);
        }

        res.json({ message: 'Team updated successfully' });
    } catch (error) {
        await conn.rollback();
        console.error('Error updating team:', error);
        res.status(500).json({ message: 'Error updating team' });
    } finally {
        conn.release();
    }
});

app.delete('/api/staff/teams/:id', requireRole(ROLES.ADMIN), async (req, res) => {
    const teamId = req.params.id;
    const conn = await dbPool.getConnection();
    try {
        await conn.beginTransaction();

        // Get team name and captain_id before deleting
        const [team] = await conn.execute('SELECT team_name, captain_id, role_id, channel_id FROM Teams WHERE team_id = ?', [teamId]);
        if (team.length === 0) {
            await conn.rollback(); // Rollback if team not found
            return res.status(404).json({ message: 'Team not found' });
        }
        const { team_name: teamName, captain_id: captainId, role_id: roleId, channel_id: channelId, voice_channel_id: voiceChannelId } = team[0];

        // Delete the team from the database
        await conn.execute('DELETE FROM Teams WHERE team_id = ?', [teamId]);

        // Find and delete the Discord role
        const bot = req.app.locals.bot;
        const guild = await bot.guilds.fetch(DISCORD_GUILD_ID);
        if (roleId) {
            try {
                const role = await guild.roles.fetch(roleId);
                if (role) {
                    await role.delete('Team deleted from the website').catch(err => console.error(`Could not delete role ${teamName}:`, err));
                }
            } catch (err) {
                console.error(`Could not find role ${roleId} to delete:`, err);
            }
        }
        
        // Also delete the team text channel
        if (channelId) {
            try {
                const channel = await guild.channels.fetch(channelId);
                if (channel) {
                    await channel.delete('Team deleted from the website').catch(err => console.error(`Could not delete text channel ${teamName}:`, err));
                }
            } catch (err) {
                console.error(`Could not find text channel ${channelId} to delete:`, err);
            }
        }

        // Also delete the team voice channel
        if (voiceChannelId) {
            try {
                const voiceChannel = await guild.channels.fetch(voiceChannelId);
                if (voiceChannel) {
                    await voiceChannel.delete('Team deleted from the website').catch(err => console.error(`Could not delete voice channel ${teamName}:`, err));
                }
            } catch (err) {
                console.error(`Could not find voice channel ${voiceChannelId} to delete:`, err);
            }
        }

        // Remove captain role from the former captain
        if (captainId) {
            try {
                const captain = await guild.members.fetch(String(captainId));
                // Check if the user is a captain of another team before removing the role
                const [captainTeams] = await conn.execute('SELECT * FROM Teams WHERE captain_id = ?', [captainId]);
                if (captainTeams.length === 0) {
                    await captain.roles.remove(DISCORD_ROLE_IDS.CAPTAIN_ROLE_ID, 'Team deleted');
                }
            } catch (err) {
                console.error(`Could not remove captain role from user ${captainId}:`, err);
            }
        }

        await conn.commit();

        // Send Discord notification for delete
        try {
            const adminChannel = await req.app.locals.bot.channels.fetch(DISCORD_ADMIN_BOT_CHANNEL);
            if (adminChannel) {
                const embed = new EmbedBuilder()
                    .setColor('#ff0000') // Red for delete
                    .setTitle('Team Deleted')
                    .addFields(
                        { name: 'Team Name', value: teamName, inline: true },
                        { name: 'Deleted By', value: req.user.username, inline: true }
                    )
                    .setTimestamp();
                await adminChannel.send({ embeds: [embed] });
            }
        } catch (discordError) {
            console.error('Failed to send Discord notification for team deletion:', discordError);
        }

        res.json({ message: `Team ${teamName} deleted successfully` });
    } catch (error) {
        await conn.rollback();
        console.error('Error deleting team:', error);
        res.status(500).json({ message: 'Error deleting team' });
    } finally {
        conn.release();
    }
});


// --- DISCORD AUTH ENDPOINTS ---
app.get('/login', (req, res) => {
    const url = `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&scope=identify%20guilds.members.read`;
    res.redirect(url);
});

// --- DEV ENDPOINT (temporary) ---
app.get('/api/dev/setup-match-tables', requireRole(ROLES.ADMIN), async (req, res) => {
    const conn = await dbPool.getConnection();
    try {
        await conn.beginTransaction();

        // Drop tables in reverse order of creation to avoid foreign key issues
        await conn.execute('DROP TABLE IF EXISTS `GameSurvivors`;');
        await conn.execute('DROP TABLE IF EXISTS `MatchGames`;');
        await conn.execute('DROP TABLE IF EXISTS `MatchSets`;');

        const createMatchSets = `
            CREATE TABLE \`MatchSets\` (
              \`set_id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
              \`match_id\` INT UNSIGNED NOT NULL,
              \`set_number\` INT UNSIGNED NOT NULL,
              \`team_a_score\` INT UNSIGNED NOT NULL DEFAULT 0,
              \`team_b_score\` INT UNSIGNED NOT NULL DEFAULT 0,
              \`winner_id\` INT UNSIGNED DEFAULT NULL,
              \`is_active\` BOOLEAN NOT NULL DEFAULT 0,
              \`tiebreaker\` BOOLEAN NOT NULL DEFAULT 0,
              PRIMARY KEY (\`set_id\`),
              UNIQUE KEY \`match_set_number\` (\`match_id\`, \`set_number\`),
              FOREIGN KEY (\`match_id\`) REFERENCES \`Matches\`(\`match_id\`) ON DELETE CASCADE,
              FOREIGN KEY (\`winner_id\`) REFERENCES \`Teams\`(\`team_id\`) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
        `;

        const createMatchGames = `
            CREATE TABLE \`MatchGames\` (
              \`game_id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
              \`set_id\` INT UNSIGNED NOT NULL,
              \`game_number\` INT UNSIGNED NOT NULL,
              \`killer_team_id\` INT UNSIGNED NOT NULL,
              \`survivor_team_id\` INT UNSIGNED NOT NULL,
              \`killer_id\` VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
              \`gens_remaining\` INT UNSIGNED NOT NULL DEFAULT 5,
              \`winner_id\` INT UNSIGNED DEFAULT NULL,
              \`status\` ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED') NOT NULL DEFAULT 'PENDING',
              PRIMARY KEY (\`game_id\`),
              FOREIGN KEY (\`set_id\`) REFERENCES \`MatchSets\`(\`set_id\`) ON DELETE CASCADE,
              FOREIGN KEY (\`killer_team_id\`) REFERENCES \`Teams\`(\`team_id\`) ON DELETE CASCADE,
              FOREIGN KEY (\`survivor_team_id\`) REFERENCES \`Teams\`(\`team_id\`) ON DELETE CASCADE,
              FOREIGN KEY (\`killer_id\`) REFERENCES \`Killers\`(\`killer_id\`) ON DELETE SET NULL,
              FOREIGN KEY (\`winner_id\`) REFERENCES \`Teams\`(\`team_id\`) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
        `;

        const createGameSurvivors = `
            CREATE TABLE \`GameSurvivors\` (
              \`game_survivor_id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
              \`game_id\` INT UNSIGNED NOT NULL,
              \`survivor_id\` BIGINT UNSIGNED DEFAULT NULL,
              \`survivor_slot\` INT UNSIGNED NOT NULL,
              \`hook_state\` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '0: not hooked, 1: hooked once, 2: hooked twice, 3: sacrificed/dead',
              PRIMARY KEY (\`game_survivor_id\`),
              UNIQUE KEY \`game_slot\` (\`game_id\`, \`survivor_slot\`),
              UNIQUE KEY \`game_player\` (\`game_id\`, \`survivor_id\`),
              FOREIGN KEY (\`game_id\`) REFERENCES \`MatchGames\`(\`game_id\`) ON DELETE CASCADE,
              FOREIGN KEY (\`survivor_id\`) REFERENCES \`Users\`(\`user_id\`) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
        `;

        await conn.execute(createMatchSets);
        await conn.execute(createMatchGames);
        await conn.execute(createGameSurvivors);

        await conn.commit();
        res.json({ message: 'Match tables dropped and recreated successfully.' });
    } catch (error) {
        await conn.rollback();
        console.error('Error creating match tables:', error);
        res.status(500).json({ message: 'Failed to create match tables.', error: error.message });
    } finally {
        conn.release();
    }
});

app.get('/api/dev/add-active-to-matches', requireRole(ROLES.ADMIN), async (req, res) => {
    const conn = await dbPool.getConnection();
    try {
        await conn.beginTransaction();
        try {
            await conn.execute('ALTER TABLE Matches ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT 0;');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('is_active column already exists in Matches.');
            } else {
                throw e;
            }
        }
        await conn.commit();
        res.json({ message: 'Matches table updated successfully with is_active column.' });
    } catch (error) {
        await conn.rollback();
        console.error('Error altering Matches table:', error);
        res.status(500).json({ message: 'Failed to alter Matches table.', error: error.message });
    } finally {
        conn.release();
    }
});

// Pass configuration to the bot via app.locals
app.locals.config = {
    DISCORD_CLIENT_ID,
    DISCORD_CLIENT_SECRET,
    DISCORD_REDIRECT_URI,
    DISCORD_GUILD_ID,
    DISCORD_ADMIN_BOT_CHANNEL,
    DISCORD_BOT_TOKEN,
    DISCORD_ROLE_IDS,
    TEAM_COLORS
};

// Initialize and start the bot. The bot will start the express server.
initializeBot(app, dbPool, port);

app.get('/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) {
        return res.status(400).send(generateErrorPage('Login Failed', 'Missing authorization code.'));
    }
    try {
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: DISCORD_CLIENT_ID,
                client_secret: DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: DISCORD_REDIRECT_URI,
                scope: 'identify guilds.members.read',
            }).toString(),
        });
        const { access_token } = await tokenResponse.json();
        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${access_token}` },
        });
        const discordUser = await userResponse.json();
        const guildMemberResponse = await fetch(`https://discord.com/api/users/@me/guilds/${DISCORD_GUILD_ID}/member`, {
            headers: { Authorization: `Bearer ${access_token}` },
        });
        const guildMember = await guildMemberResponse.json();
        if (!guildMember || !guildMember.roles) {
             return res.status(403).send(generateErrorPage('Access Denied', 'You must be a member of the required Discord server to log in.'));
        }
        const userRole = getUserRole(discordUser.id, guildMember.roles); 
        req.session.user = { 
            userId: discordUser.id, 
            username: discordUser.username,
            role: userRole,
            discordRoles: guildMember.roles || [] 
        };
        res.redirect('/'); 
    } catch (error) {
        console.error('Discord OAuth Error:', error);
        res.status(500).send(generateErrorPage('Authentication Error', 'Login failed due to an external error.'));
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).send(generateErrorPage('Logout Failed', 'Could not log you out due to a server error.'));
        }
        res.redirect('/');
    });
});

// --- GENERIC HTML HELPERS ---
function generateErrorPage(title, message, link = '/') {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>${title}</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style> body { background-color: #1f2937; color: #f9fafb; display: flex; justify-content: center; align-items: center; min-height: 100vh; font-family: sans-serif; } .card { background-color: #374151; padding: 2rem; border-radius: 0.5rem; text-align: center; } </style>
        </head>
        <body>
            <div class="card">
                <h1 class="text-3xl font-bold mb-4 text-red-500">${title}</h1>
                <p class="text-lg mb-6">${message}</p>
                <a href="${link}" class="text-indigo-400 hover:text-indigo-300">${link === '/login' ? 'Try Discord Login' : 'Go Home'}</a>
            </div>
        </body>
        </html>
    `;
}