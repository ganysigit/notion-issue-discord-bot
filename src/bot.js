require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, REST, Routes } = require('discord.js');
const cron = require('node-cron');
const DatabaseService = require('./database');
const NotionService = require('./notion-service');

class DiscordNotionBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent
            ]
        });
        
        this.db = new DatabaseService(process.env.DATABASE_PATH);
        this.notion = new NotionService(process.env.NOTION_API_KEY);
        this.pollingInterval = parseInt(process.env.POLLING_INTERVAL) || 2;
        
        this.setupEventHandlers();
        this.setupSlashCommands();
    }

    setupEventHandlers() {
        this.client.once('ready', async () => {
            console.log(`✅ Bot is ready! Logged in as ${this.client.user.tag}`);
            await this.db.connect();
            this.startPolling();
        });

        this.client.on('interactionCreate', async (interaction) => {
            if (interaction.isChatInputCommand()) {
                await this.handleSlashCommand(interaction);
            } else if (interaction.isButton()) {
                await this.handleButtonInteraction(interaction);
            }
        });

        this.client.on('error', console.error);
    }

    async setupSlashCommands() {
        const commands = [
            new SlashCommandBuilder()
                .setName('sync-now')
                .setDescription('Manually trigger a sync with all connected Notion databases'),
            
            new SlashCommandBuilder()
                .setName('list-connections')
                .setDescription('List all active Notion database connections'),
            
            new SlashCommandBuilder()
                                .setName('bot-status')
                .setDescription('Show bot status and statistics'),
            
            new SlashCommandBuilder()
                .setName('clear-channel')
                .setDescription('Clear all messages in connected channels and sync updated issues')
        ].map(command => command.toJSON());

        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

        try {
            console.log('Started refreshing application (/) commands.');
            await rest.put(
                Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
                { body: commands }
            );
            console.log('Successfully reloaded application (/) commands.');
        } catch (error) {
            console.error('Error registering slash commands:', error);
        }
    }

    async handleSlashCommand(interaction) {
        const { commandName } = interaction;

        try {
            switch (commandName) {
                case 'sync-now':
                    await interaction.deferReply();
                    await this.performSync();
                    await interaction.editReply('✅ Manual sync completed!');
                    break;

                case 'list-connections':
                    await this.handleListConnections(interaction);
                    break;

                case 'bot-status':
                    await this.handleBotStatus(interaction);
                    break;

                case 'clear-channel':
                    await this.handleClearChannel(interaction);
                    break;

                default:
                    await interaction.reply({ content: 'Unknown command!', ephemeral: true });
            }
        } catch (error) {
            console.error('Error handling slash command:', error);
            const reply = { content: 'An error occurred while processing the command.', ephemeral: true };
            
            if (interaction.deferred) {
                await interaction.editReply(reply);
            } else {
                await interaction.reply(reply);
            }
        }
    }

    async handleButtonInteraction(interaction) {
        const [action, issueId] = interaction.customId.split('_');
        
        try {
            await interaction.deferUpdate();
            
            const trackedIssue = await this.db.getTrackedIssueByDiscordId(interaction.message.id);
            if (!trackedIssue) {
                await interaction.followUp({ content: 'Issue not found in database.', ephemeral: true });
                return;
            }

            let newStatus;
            switch (action) {
                case 'mark-open':
                    newStatus = 'Open';
                    break;
                case 'mark-fixed':
                    newStatus = 'Fixed';
                    break;
                default:
                    await interaction.followUp({ content: 'Unknown action.', ephemeral: true });
                    return;
            }

            // Update in Notion
            await this.notion.updatePageStatus(trackedIssue.notion_page_id, newStatus);
            
            // Update in database
            await this.db.updateIssueStatus(trackedIssue.notion_page_id, newStatus);

            // Update Discord message
            const updatedEmbed = this.createIssueEmbed({
                title: trackedIssue.issue_title,
                status: newStatus,
                id: trackedIssue.notion_page_id
            }, true);

            const updatedRow = this.createActionRow(trackedIssue.notion_page_id, newStatus);

            await interaction.editReply({
                embeds: [updatedEmbed],
                components: [updatedRow]
            });

            await interaction.followUp({ 
                content: `✅ Issue status updated to **${newStatus}** by ${interaction.user.tag}`, 
                ephemeral: false 
            });

        } catch (error) {
            console.error('Error handling button interaction:', error);
            
            let errorMessage = 'An error occurred while updating the issue.';
            
            if (error.message.includes('No select properties found')) {
                errorMessage = '❌ Cannot update status: This Notion page has no status/select properties. Please add a Status field to your Notion database.';
            } else if (error.message.includes('No status property found')) {
                errorMessage = '⚠️ No status field found. Using the first available select field instead.';
            } else if (error.message.includes('Invalid select option')) {
                errorMessage = `❌ Invalid status option "${newStatus}". Please check your Notion database select options.`;
            }
            
            await interaction.followUp({ content: errorMessage, ephemeral: true });
        }
    }

    async handleListConnections(interaction) {
        try {
            const connections = await this.db.getConnections();
            
            if (connections.length === 0) {
                await interaction.reply({ content: 'No active connections found. Use the dashboard to add connections.', ephemeral: true });
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle('🔗 Active Notion Connections')
                .setColor(0x0099FF)
                .setTimestamp();

            connections.forEach((conn, index) => {
                embed.addFields({
                    name: `${index + 1}. ${conn.notion_database_name}`,
                    value: `**Channel:** <#${conn.discord_channel_id}>\n**Last Checked:** ${new Date(conn.last_checked).toLocaleString()}`,
                    inline: true
                });
            });

            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            console.error('Error listing connections:', error);
            await interaction.reply({ content: 'Error fetching connections.', ephemeral: true });
        }
    }

    async handleBotStatus(interaction) {
        try {
            const connections = await this.db.getConnections();
            const trackedIssues = await this.db.getAllTrackedIssues();
            
            const embed = new EmbedBuilder()
                .setTitle('🤖 Bot Status')
                .setColor(0x00FF00)
                .addFields(
                    { name: 'Active Connections', value: connections.length.toString(), inline: true },
                    { name: 'Tracked Issues', value: trackedIssues.length.toString(), inline: true },
                    { name: 'Polling Interval', value: `${this.pollingInterval} minutes`, inline: true },
                    { name: 'Uptime', value: this.formatUptime(process.uptime()), inline: true },
                    { name: 'Dashboard', value: `http://localhost:${process.env.DASHBOARD_PORT || 3000}`, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            console.error('Error getting bot status:', error);
            await interaction.reply({ content: 'Error fetching bot status.', ephemeral: true });
        }
    }

    formatUptime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${minutes}m`;
    }

    async handleClearChannel(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });
            
            // Check if user has manage messages permission
            if (!interaction.member.permissions.has('ManageMessages')) {
                await interaction.editReply('❌ You need "Manage Messages" permission to use this command.');
                return;
            }
            
            // Get all active connections from database
            const connections = await this.db.getConnections();
            
            if (connections.length === 0) {
                await interaction.editReply('❌ No active connections found. Please set up Notion database connections first.');
                return;
            }
            
            // Validate channels and permissions
            const validChannels = [];
            const botMember = interaction.guild.members.cache.get(this.client.user.id);
            
            for (const connection of connections) {
                try {
                    const channel = await this.client.channels.fetch(connection.discord_channel_id);
                    if (channel && botMember.permissionsIn(channel).has(['ViewChannel', 'ReadMessageHistory', 'ManageMessages'])) {
                        validChannels.push({ channel, connection });
                    }
                } catch (error) {
                    console.log(`Could not access channel ${connection.discord_channel_id}:`, error.message);
                }
            }
            
            if (validChannels.length === 0) {
                await interaction.editReply('❌ No accessible channels found or missing permissions. I need "View Channel", "Read Message History", and "Manage Messages" permissions.');
                return;
            }
            
            // Confirm the action
            const channelList = validChannels.map(({channel}) => `• ${channel}`).join('\n');
            const confirmEmbed = new EmbedBuilder()
                .setTitle('⚠️ Confirm Channel Clear & Sync')
                .setDescription(`Are you sure you want to clear all messages in the following connected channels and sync updated issues?\n\n${channelList}\n\n**This action cannot be undone!**`)
                .setColor(0xFF6B6B);
            
            const confirmRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('confirm_clear')
                        .setLabel('Yes, Clear & Sync')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('cancel_clear')
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Secondary)
                );
            
            await interaction.editReply({
                embeds: [confirmEmbed],
                components: [confirmRow]
            });
            
            // Wait for confirmation
            const filter = (i) => i.user.id === interaction.user.id && (i.customId === 'confirm_clear' || i.customId === 'cancel_clear');
            const collector = interaction.channel.createMessageComponentCollector({ filter, time: 30000 });
            
            collector.on('collect', async (i) => {
                if (i.customId === 'confirm_clear') {
                    // Check if interaction is still valid and acknowledge it
                    if (i.replied || i.deferred) {
                        console.log('Interaction already handled, skipping...');
                        return;
                    }
                    
                    try {
                        await i.deferUpdate();
                    } catch (error) {
                        console.log('Failed to defer update, interaction may have expired:', error.message);
                        // Try to send an ephemeral message if defer fails
                        try {
                            if (!i.replied && !i.deferred) {
                                await i.reply({ content: 'Processing your request...', ephemeral: true });
                            }
                        } catch (replyError) {
                            console.log('Failed to reply to interaction:', replyError.message);
                            return;
                        }
                    }
                    
                    try {
                        // Clear messages from all valid channels
                        let totalDeletedCount = 0;
                        const channelResults = [];
                        
                        for (const { channel, connection } of validChannels) {
                            // Check bot permissions first
                            const botMember = channel.guild.members.cache.get(this.client.user.id);
                            const permissions = channel.permissionsFor(botMember);
                            
                            if (!permissions.has('ManageMessages')) {
                                console.log(`❌ Missing ManageMessages permission in ${channel.name}`);
                                channelResults.push({ channel: channel.name, deletedCount: 0, error: 'Missing ManageMessages permission' });
                                continue;
                            }
                            
                            if (!permissions.has('ReadMessageHistory')) {
                                console.log(`❌ Missing ReadMessageHistory permission in ${channel.name}`);
                                channelResults.push({ channel: channel.name, deletedCount: 0, error: 'Missing ReadMessageHistory permission' });
                                continue;
                            }
                            
                            console.log(`✅ Bot has required permissions in ${channel.name}`);
                            
                            let deletedCount = 0;
                            const deletedMessageIds = new Set();
                            let lastId;
                            
                            do {
                                console.log(`📥 Fetching messages from ${channel.name}...`);
                                const fetchOptions = { limit: 100 };
                                if (lastId) {
                                    fetchOptions.before = lastId;
                                }
                                
                                const fetched = await channel.messages.fetch(fetchOptions);
                                console.log(`📥 Fetched ${fetched.size} messages from ${channel.name}`);
                                
                                if (fetched.size === 0) {
                                    console.log(`📭 No more messages to fetch from ${channel.name}`);
                                    break;
                                }
                                
                                // Convert Collection to Array for easier processing
                                const messages = Array.from(fetched.values());
                                lastId = messages[messages.length - 1].id;
                                
                                // Separate messages by age (Discord's 2-week bulk delete limitation)
                                const now = Date.now();
                                const twoWeeksAgo = now - (14 * 24 * 60 * 60 * 1000);
                                
                                const recentMessages = messages.filter(msg => msg.createdTimestamp > twoWeeksAgo);
                                const oldMessages = messages.filter(msg => msg.createdTimestamp <= twoWeeksAgo);
                                
                                console.log(`📊 Recent messages: ${recentMessages.length}, Old messages: ${oldMessages.length}`);
                                
                                // Bulk delete recent messages (Discord API limitation: max 100, must be < 2 weeks old)
                                if (recentMessages.length > 0) {
                                    console.log(`🗑️ Attempting to delete ${recentMessages.length} recent messages`);
                                    try {
                                        if (recentMessages.length === 1) {
                                            const msg = recentMessages[0];
                                            console.log(`🗑️ Deleting single recent message: ${msg.id}`);
                                            await msg.delete();
                                            deletedMessageIds.add(msg.id);
                                            deletedCount += 1;
                                            console.log(`✅ Successfully deleted message: ${msg.id}`);
                                        } else {
                                            // Use bulkDelete for multiple recent messages
                                            console.log(`🗑️ Attempting bulk delete of ${recentMessages.length} messages`);
                                            const deletedMessages = await channel.bulkDelete(recentMessages, true); // filterOld = true
                                            deletedMessages.forEach(msg => deletedMessageIds.add(msg.id));
                                            deletedCount += deletedMessages.size;
                                            console.log(`✅ Successfully bulk deleted ${deletedMessages.size} messages`);
                                        }
                                    } catch (error) {
                                        console.log(`❌ Failed to bulk delete recent messages:`, error.message);
                                        // Fallback to individual deletion for recent messages
                                        console.log(`🔄 Falling back to individual deletion for recent messages`);
                                        for (const msg of recentMessages) {
                                            try {
                                                console.log(`🗑️ Deleting recent message individually: ${msg.id}`);
                                                await msg.delete();
                                                deletedMessageIds.add(msg.id);
                                                deletedCount++;
                                                console.log(`✅ Successfully deleted recent message: ${msg.id}`);
                                                await new Promise(resolve => setTimeout(resolve, 100));
                                            } catch (error) {
                                                console.log(`❌ Could not delete recent message ${msg.id}:`, error.message);
                                            }
                                        }
                                    }
                                }
                                
                                // Delete old messages individually (>2 weeks old cannot be bulk deleted)
                                if (oldMessages.length > 0) {
                                    console.log(`🗑️ Attempting to delete ${oldMessages.length} old messages individually`);
                                    for (const msg of oldMessages) {
                                        try {
                                            console.log(`🗑️ Deleting old message: ${msg.id}`);
                                            await msg.delete();
                                            deletedMessageIds.add(msg.id);
                                            deletedCount++;
                                            console.log(`✅ Successfully deleted old message: ${msg.id}`);
                                            // Add delay to avoid rate limits
                                            await new Promise(resolve => setTimeout(resolve, 200));
                                        } catch (error) {
                                            console.log(`❌ Could not delete old message ${msg.id}:`, error.message);
                                        }
                                    }
                                }
                                
                                // If we fetched less than 100 messages, we've reached the end
                                if (fetched.size < 100) {
                                    console.log(`📭 Reached end of messages in ${channel.name}`);
                                    break;
                                }
                            } while (true);
                            
                            console.log(`📊 Channel ${channel.name}: Deleted ${deletedCount} messages total`);
                            channelResults.push({ channel: channel.name, deletedCount });
                            totalDeletedCount += deletedCount;
                            
                            // Only remove tracked issues for messages that were actually deleted
                            const trackedIssues = await this.db.getTrackedIssuesByConnection(connection.id);
                            for (const issue of trackedIssues) {
                                if (deletedMessageIds.has(issue.discord_message_id)) {
                                    await this.db.removeTrackedIssue(issue.discord_message_id);
                                }
                            }
                        }
                        
                        // Trigger sync for all connections
                        console.log('🔄 Triggering sync after channel clear...');
                        await this.performSync();
                        
                        const resultText = channelResults.map(r => `• ${r.channel}: ${r.deletedCount} messages`).join('\n');
                        const successEmbed = new EmbedBuilder()
                            .setTitle('✅ Channels Cleared & Synced')
                            .setDescription(`Successfully cleared ${totalDeletedCount} total messages and synced updated issues:\n\n${resultText}`)
                            .setColor(0x00FF00);
                        
                        try {
                            await interaction.editReply({
                                embeds: [successEmbed],
                                components: []
                            });
                        } catch (editError) {
                            console.log('Failed to edit reply with success message:', editError.message);
                        }
                        
                    } catch (error) {
                        console.error('Error clearing channel:', error);
                        try {
                            await interaction.editReply({
                                content: '❌ An error occurred while clearing the channel. Some messages may not have been deleted.',
                                embeds: [],
                                components: []
                            });
                        } catch (editError) {
                            console.log('Failed to edit reply with error message:', editError.message);
                        }
                    }
                } else {
                    // Handle cancel button
                    if (i.replied || i.deferred) {
                        console.log('Cancel interaction already handled, skipping...');
                        return;
                    }
                    
                    try {
                        await i.deferUpdate();
                    } catch (error) {
                        console.log('Failed to defer update for cancel, interaction may have expired:', error.message);
                        // Try to send an ephemeral message if defer fails
                        try {
                            if (!i.replied && !i.deferred) {
                                await i.reply({ content: 'Cancelled.', ephemeral: true });
                            }
                        } catch (replyError) {
                            console.log('Failed to reply to cancel interaction:', replyError.message);
                            return;
                        }
                    }
                    try {
                        await interaction.editReply({
                            content: '❌ Channel clear cancelled.',
                            embeds: [],
                            components: []
                        });
                    } catch (editError) {
                        console.log('Failed to edit reply with cancel message:', editError.message);
                    }
                }
                collector.stop();
            });
            
            collector.on('end', async (collected) => {
                if (collected.size === 0) {
                    try {
                        await interaction.editReply({
                            content: '❌ Channel clear timed out.',
                            embeds: [],
                            components: []
                        });
                    } catch (editError) {
                        console.log('Failed to edit reply with timeout message:', editError.message);
                    }
                }
            });
            
        } catch (error) {
            console.error('Error handling clear channel command:', error);
            const reply = { content: 'An error occurred while processing the clear channel command.', ephemeral: true };
            
            if (interaction.deferred) {
                await interaction.editReply(reply);
            } else {
                await interaction.reply(reply);
            }
        }
    }

    startPolling() {
        console.log(`🔄 Starting polling every ${this.pollingInterval} minutes`);
        
        // Run immediately on start
        this.performSync();
        
        // Schedule regular polling
        cron.schedule(`*/${this.pollingInterval} * * * *`, () => {
            this.performSync();
        });
    }

    async performSync() {
        try {
            const connections = await this.db.getConnections();
            console.log(`🔍 Checking ${connections.length} connections for updates...`);

            for (const connection of connections) {
                await this.syncConnection(connection);
            }
        } catch (error) {
            console.error('Error during sync:', error);
        }
    }

    async syncConnection(connection) {
        try {
            // Get all open issues from Notion
            const openIssues = await this.notion.getAllOpenIssues(connection.notion_database_id);
            console.log(`📋 Found ${openIssues.length} open issues in ${connection.notion_database_name}`);

            // Get current tracked issues for this connection
            const trackedIssues = await this.db.getTrackedIssuesByConnection(connection.id);
            console.log(`🗃️ Found ${trackedIssues.length} tracked issues in database`);

            // Perform comprehensive sync
            await this.performChannelSync(connection, openIssues, trackedIssues);

            // Update last checked timestamp
            const now = new Date().toISOString();
            await this.db.updateConnectionLastChecked(connection.id, now);

        } catch (error) {
            console.error(`Error syncing connection ${connection.id}:`, error);
        }
    }

    async performChannelSync(connection, currentIssues, trackedIssues) {
        try {
            const channel = await this.client.channels.fetch(connection.discord_channel_id);
            if (!channel) {
                console.error(`Channel ${connection.discord_channel_id} not found`);
                return;
            }

            console.log(`🔄 Performing comprehensive sync for ${connection.notion_database_name}`);

            // Create maps for easier comparison
            const currentIssueMap = new Map();
            currentIssues.forEach(issue => {
                if (issue.issueId) {
                    currentIssueMap.set(issue.issueId, issue);
                } else {
                    currentIssueMap.set(issue.id, issue);
                }
            });

            const trackedIssueMap = new Map();
            trackedIssues.forEach(tracked => {
                const key = tracked.issue_id || tracked.notion_page_id;
                trackedIssueMap.set(key, tracked);
            });

            // Find discrepancies and remove outdated messages
            for (const [key, tracked] of trackedIssueMap) {
                const currentIssue = currentIssueMap.get(key);
                
                if (!currentIssue) {
                    // Issue no longer exists in Notion, remove Discord message
                    console.log(`🗑️ Removing outdated issue: ${tracked.issue_title}`);
                    const removed = await this.removeDiscordMessage(channel, tracked.discord_message_id);
                    if (removed) {
                        await this.db.removeTrackedIssue(tracked.discord_message_id);
                    }
                } else if (currentIssue.status !== tracked.current_status || 
                          currentIssue.title !== tracked.issue_title ||
                          (currentIssue.issueId && currentIssue.issueId !== tracked.issue_id)) {
                    // Issue exists but has changes, update the message
                    console.log(`🔄 Updating changed issue: ${tracked.issue_title}`);
                    const updated = await this.updateDiscordMessage(channel, tracked.discord_message_id, currentIssue);
                    
                    if (updated) {
                        // Successfully updated, update database
                        await this.db.updateIssueStatus(tracked.notion_page_id, currentIssue.status);
                        // Update issue_id if it changed
                        if (currentIssue.issueId && currentIssue.issueId !== tracked.issue_id) {
                            await this.db.updateTrackedIssueId(tracked.discord_message_id, currentIssue.issueId);
                        }
                    } else {
                        // Failed to update, remove old tracking and create new message
                        console.log(`🔄 Creating new message to replace failed update for: ${currentIssue.title}`);
                        await this.db.removeTrackedIssue(tracked.discord_message_id);
                        await this.announceNewIssue(currentIssue, connection);
                    }
                }
            }

            // Add new issues that aren't tracked yet
            for (const [key, issue] of currentIssueMap) {
                if (!trackedIssueMap.has(key)) {
                    console.log(`➕ Adding new issue: ${issue.title}`);
                    await this.announceNewIssue(issue, connection);
                }
            }

            console.log(`✅ Channel sync completed for ${connection.notion_database_name}`);

        } catch (error) {
            console.error('Error performing channel sync:', error);
        }
    }

    async removeDiscordMessage(channel, messageId) {
        try {
            const message = await channel.messages.fetch(messageId);
            if (message && message.author.id === this.client.user.id) {
                await message.delete();
                console.log(`🗑️ Deleted Discord message: ${messageId}`);
                return true;
            }
        } catch (error) {
            console.log(`⚠️ Could not delete message ${messageId}: ${error.message}`);
            // If we can't delete due to permissions, try to edit with a "DELETED" marker
            if (error.code === 50013) { // Missing Permissions
                try {
                    const message = await channel.messages.fetch(messageId);
                    if (message && message.author.id === this.client.user.id) {
                        const deletedEmbed = new EmbedBuilder()
                            .setTitle('🗑️ [DELETED] Issue Removed')
                            .setDescription('This issue has been removed from the tracker.')
                            .setColor(0x808080);
                        await message.edit({ embeds: [deletedEmbed], components: [] });
                        console.log(`📝 Marked message as deleted: ${messageId}`);
                        return true;
                    }
                } catch (editError) {
                    console.log(`⚠️ Could not edit message to mark as deleted: ${editError.message}`);
                }
            }
            return false;
        }
        return false;
    }

    async updateDiscordMessage(channel, messageId, issue) {
        try {
            const message = await channel.messages.fetch(messageId);
            if (message && message.author.id === this.client.user.id) {
                const updatedEmbed = this.createIssueEmbed(issue, true);
                const actionRow = this.createActionRow(issue.issueId || issue.id);
                
                await message.edit({
                    embeds: [updatedEmbed],
                    components: [actionRow]
                });
                console.log(`🔄 Updated Discord message for: ${issue.title}`);
                return true;
            }
        } catch (error) {
            console.log(`⚠️ Could not update message ${messageId}: ${error.message}`);
            // If we can't update due to permissions, create a new message and remove the old tracking
            if (error.code === 50013) { // Missing Permissions
                console.log(`🔄 Creating new message due to permission error for: ${issue.title}`);
                return false; // Signal that we need to create a new message
            }
        }
        return false;
    }

    async announceOpenIssues(issues, connection) {
        try {
            const channel = await this.client.channels.fetch(connection.discord_channel_id);
            if (!channel) {
                console.error(`Channel ${connection.discord_channel_id} not found`);
                return;
            }

            // Create a comprehensive announcement embed
            const embed = new EmbedBuilder()
                .setTitle(`🚨 Open Issues Report - ${connection.notion_database_name}`)
                .setColor(0xFF6B35)
                .setDescription(`Found **${issues.length}** open issues that need attention:`)
                .setTimestamp();

            // Add fields for each issue (limit to 25 fields max)
            const maxFields = 25;
            const issuesToShow = issues.slice(0, maxFields);
            
            for (const issue of issuesToShow) {
                const fieldValue = `**Status:** ${issue.status}\n**Priority:** ${issue.priority || 'Not set'}\n[View Issue](${issue.url})`;
                embed.addFields({
                    name: `📋 ${issue.title}`,
                    value: fieldValue,
                    inline: true
                });
            }

            if (issues.length > maxFields) {
                embed.addFields({
                    name: '⚠️ Additional Issues',
                    value: `... and ${issues.length - maxFields} more issues. Check your Notion database for the complete list.`,
                    inline: false
                });
            }

            // Add summary footer
            embed.setFooter({
                text: `Total Open Issues: ${issues.length} | Last Updated`,
                iconURL: this.client.user.displayAvatarURL()
            });

            await channel.send({ embeds: [embed] });
            console.log(`📢 Announced ${issues.length} open issues to Discord`);

        } catch (error) {
            console.error('Error announcing open issues:', error);
        }
    }

    async announceNewIssue(issue, connection) {
        try {
            console.log(`🔍 Processing issue: ${issue.title} | Issue ID: ${issue.issueId || 'Not found'} | Notion ID: ${issue.id}`);
            
            // Primary check: Use Issue ID from Notion if available
            if (issue.issueId) {
                const isAlreadyAnnounced = await this.db.isIssueAlreadyAnnounced(issue.issueId, connection.id);
                if (isAlreadyAnnounced) {
                    console.log(`⏭️ Skipping duplicate issue: ${issue.title} (Issue ID: ${issue.issueId})`);
                    return;
                }
            } else {
                // Fallback: Check by Notion page ID only if no Issue ID is available
                const existingIssue = await this.db.getTrackedIssueByNotionId(issue.id);
                if (existingIssue) {
                    console.log(`⏭️ Skipping duplicate issue: ${issue.title} (using Notion ID as fallback - no Issue ID found)`);
                    return;
                }
            }

            const channel = await this.client.channels.fetch(connection.discord_channel_id);
            if (!channel) {
                console.error(`Channel ${connection.discord_channel_id} not found`);
                return;
            }

            const embed = this.createIssueEmbed(issue);
            const actionRow = this.createActionRow(issue.id, issue.status);

            const message = await channel.send({
                embeds: [embed],
                components: [actionRow]
            });

            // Track this issue in the database
            await this.db.addTrackedIssue(
                issue.id,
                message.id,
                connection.id,
                issue.title,
                issue.status,
                issue.issueId
            );

            console.log(`📢 Announced new issue: ${issue.title}${issue.issueId ? ` (Issue ID: ${issue.issueId})` : ''}`);
        } catch (error) {
            console.error('Error announcing new issue:', error);
        }
    }

    createIssueEmbed(issue, isUpdate = false) {
        const statusColor = issue.status === 'Fixed' ? 0x00FF00 : 
                           issue.status === 'Open' ? 0xFF9900 : 0x0099FF;
        
        const embed = new EmbedBuilder()
            .setTitle(`${isUpdate ? '🔄 ' : '🆕 '}${issue.title}`)
            .setColor(statusColor)
            .addFields(
                { name: 'Status', value: issue.status, inline: true },
                { name: 'Issue ID', value: issue.issueId || issue.id.slice(-8), inline: true }
            )
            .setTimestamp();

        if (issue.description) {
            embed.setDescription(issue.description.slice(0, 200) + (issue.description.length > 200 ? '...' : ''));
        }

        if (issue.url) {
            embed.setURL(issue.url);
        }

        return embed;
    }

    createActionRow(issueId, currentStatus) {
        const openButton = new ButtonBuilder()
            .setCustomId(`mark-open_${issueId}`)
            .setLabel('Mark as Open')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔓')
            .setDisabled(currentStatus === 'Open');

        const fixedButton = new ButtonBuilder()
            .setCustomId(`mark-fixed_${issueId}`)
            .setLabel('Mark as Fixed')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅')
            .setDisabled(currentStatus === 'Fixed');

        return new ActionRowBuilder().addComponents(openButton, fixedButton);
    }

    async start() {
        try {
            await this.client.login(process.env.DISCORD_BOT_TOKEN);
        } catch (error) {
            console.error('Failed to start bot:', error);
            process.exit(1);
        }
    }

    async stop() {
        console.log('🛑 Shutting down bot...');
        await this.db.close();
        this.client.destroy();
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    if (global.bot) {
        await global.bot.stop();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    if (global.bot) {
        await global.bot.stop();
    }
    process.exit(0);
});

// Start the bot
if (require.main === module) {
    const bot = new DiscordNotionBot();
    global.bot = bot;
    bot.start();
}

module.exports = DiscordNotionBot;