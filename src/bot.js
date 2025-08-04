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
                .setDescription('Show bot status and statistics')
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
            // Get all open issues for announcement
            const openIssues = await this.notion.getAllOpenIssues(connection.notion_database_id);
            
            console.log(`📋 Found ${openIssues.length} open issues in ${connection.notion_database_name}`);

            for (const issue of openIssues) {
                await this.announceNewIssue(issue, connection);
            }

            // Update last checked timestamp
            const now = new Date().toISOString();
            await this.db.updateConnectionLastChecked(connection.id, now);

        } catch (error) {
            console.error(`Error syncing connection ${connection.id}:`, error);
        }
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