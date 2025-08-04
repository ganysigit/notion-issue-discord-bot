# Discord-Notion Bot 🤖

A powerful Discord bot that connects your Notion databases with Discord channels, providing real-time announcements for new issues and two-way synchronization for status updates.

## Features ✨

- 🔔 **Automatic Announcements**: Get notified in Discord when new issues are created in Notion
- 🔄 **Two-way Sync**: Update issue status (Open/Fixed) directly from Discord
- 📊 **Local Dashboard**: Manage connections and monitor bot activity through a web interface
- 🎯 **Multiple Databases**: Connect multiple Notion databases to different Discord channels
- ⚡ **Real-time Updates**: 2-minute polling ensures quick notifications
- 🛡️ **Error Handling**: Robust error handling and logging

## Prerequisites 📋

- Node.js 16+ installed
- Discord Bot Token and Application
- Notion Integration Token
- Notion Database with proper permissions

## Setup Instructions 🚀

### 1. Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to "Bot" section and create a bot
4. Copy the bot token
5. Enable the following bot permissions:
   - Send Messages
   - Use Slash Commands
   - Embed Links
   - Add Reactions
6. Invite the bot to your server with these permissions

### 2. Notion Integration Setup

1. Go to [Notion Integrations](https://www.notion.so/my-integrations)
2. Create a new integration
3. Copy the integration token
4. Share your Notion database with the integration:
   - Open your Notion database
   - Click "Share" → "Invite"
   - Search for your integration name and invite it

### 3. Project Setup

1. Clone or download this project
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create environment file:
   ```bash
   cp .env.example .env
   ```

4. Edit `.env` file with your credentials:
   ```env
   DISCORD_TOKEN=your_discord_bot_token
   DISCORD_CLIENT_ID=your_discord_application_id
   NOTION_API_KEY=your_notion_integration_token
   DASHBOARD_PORT=3000
   DATABASE_PATH=./data/bot.db
   POLLING_INTERVAL_MINUTES=2
   LOG_LEVEL=info
   ```

5. Setup the database:
   ```bash
   npm run setup-db
   ```

## Usage 🎯

### Starting the Bot

```bash
# Start both bot and dashboard
npm start

# Development mode with auto-restart
npm run dev

# Start only the dashboard
npm run dashboard
```

### Dashboard Access

Open your browser and go to: `http://localhost:3000`

The dashboard allows you to:
- Add new Notion database connections
- Test Notion database access
- View active connections
- Monitor tracked issues
- Check bot status and uptime

### Discord Commands

The bot supports these slash commands:

- `/sync-now` - Manually trigger a sync with all connected Notion databases
- `/list-connections` - Show all active database connections
- `/bot-status` - Display bot status and statistics

### Notion Database Requirements

Your Notion database should have these properties:

- **Title** (Title property) - Issue title
- **Status** (Select property) - Issue status with options: "Open", "Fixed"
- **Description** (Rich Text property) - Issue description (optional)

## How It Works 🔧

1. **Polling**: Bot checks Notion databases every 2 minutes for new issues
2. **Announcement**: When a new issue is found, bot posts an embed message in Discord
3. **Action Buttons**: Discord message includes "Mark as Fixed" and "Reopen" buttons
4. **Status Sync**: Clicking buttons updates both Discord message and Notion database
5. **Tracking**: Bot maintains a local database to track issue-message relationships

## Project Structure 📁

```
bot-discord-notion/
├── src/
│   ├── app.js              # Main application entry point
│   ├── bot.js              # Discord bot implementation
│   ├── notion-service.js   # Notion API integration
│   ├── database.js         # SQLite database operations
│   ├── dashboard-server.js # Express.js dashboard server
│   └── setup-database.js   # Database initialization
├── dashboard/
│   └── index.html          # Dashboard web interface
├── data/
│   └── bot.db              # SQLite database (created automatically)
├── package.json
├── .env.example
└── README.md
```

## API Endpoints 🌐

The dashboard server provides these API endpoints:

- `GET /api/connections` - List all connections
- `POST /api/connections` - Add new connection
- `DELETE /api/connections/:id` - Delete connection
- `POST /api/test-notion` - Test Notion database access
- `GET /api/status` - Get bot status
- `GET /api/tracked-issues` - List tracked issues

## Troubleshooting 🔧

### Common Issues

1. **Bot not responding to commands**
   - Check if bot has proper permissions in Discord server
   - Verify DISCORD_TOKEN is correct
   - Ensure bot is online (check dashboard)

2. **Notion connection failed**
   - Verify NOTION_API_KEY is correct
   - Check if database is shared with the integration
   - Ensure database has required properties

3. **Dashboard not loading**
   - Check if port 3000 is available
   - Try changing DASHBOARD_PORT in .env
   - Check console for error messages

### Logs

Bot logs are displayed in the console. Set `LOG_LEVEL=debug` in `.env` for detailed logging.

## Development 👨‍💻

### Running in Development Mode

```bash
npm run dev
```

This starts the application with nodemon for auto-restart on file changes.

### Database Management

```bash
# Reset database (WARNING: This deletes all data)
npm run setup-db
```

## Contributing 🤝

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License 📄

This project is licensed under the MIT License.

## Support 💬

If you encounter any issues or have questions:

1. Check the troubleshooting section
2. Review the logs for error messages
3. Ensure all prerequisites are met
4. Verify your environment configuration

---

**Happy Discord-Notion integration! 🎉**