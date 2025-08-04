# Discord-Notion Bot 🤖

A powerful Discord bot that connects your Notion databases with Discord channels, providing real-time announcements for new issues and two-way synchronization for status updates.

## Features ✨

- 🔔 **Automatic Announcements**: Get notified in Discord when new issues are created in Notion
- 🔄 **Two-way Sync**: Update issue status (Open/Fixed) directly from Discord
- 🧹 **Channel Clearing**: Clear all messages from Discord channels connected to Notion databases
- 📊 **Modern React Dashboard**: Manage connections and monitor bot activity through a responsive web interface built with React, TypeScript, and shadcn/ui
- 🎯 **Multiple Databases**: Connect multiple Notion databases to different Discord channels
- ⚡ **Real-time Updates**: 2-minute polling ensures quick notifications
- 🛡️ **Error Handling**: Robust error handling and logging
- 🔧 **Git Integration**: Pre-configured Git rules and aliases for streamlined development

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
   - Manage Messages (required for `/clear` command)
   - Read Message History (required for `/clear` command)
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
# Start both bot and dashboard (production)
npm start

# Development mode with auto-restart
npm run dev

# Start only the dashboard
npm run dashboard

# Frontend development (React with HMR)
cd frontend && npm run dev

# Build frontend for production
cd frontend && npm run build
```

### Dashboard Access

Open your browser and go to: `http://127.0.0.1:3000`

The dashboard features a modern React interface with:
- Add new Notion database connections
- Test Notion database access
- View active connections with real-time status
- Monitor tracked issues with enhanced UI
- Check bot status and uptime
- Responsive design with shadcn/ui components

### Discord Commands

The bot supports these slash commands:

- `/sync-now` - Manually trigger a sync with all connected Notion databases
- `/list-connections` - Show all active database connections
- `/bot-status` - Display bot status and statistics
- `/clear` - Clear all messages from channels connected to Notion databases

#### Message Deletion Features

The `/clear` command provides comprehensive message deletion:
- ✅ Clears all messages from connected Discord channels
- ✅ Handles Discord's 2-week bulk deletion limitation
- ✅ Includes proper permission checking (ManageMessages, ReadMessageHistory)
- ✅ Provides detailed logging and error handling
- ✅ Triggers full sync after deletion to refresh with current Notion issues

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
├── frontend/
│   ├── src/
│   │   ├── components/     # React components with shadcn/ui
│   │   ├── lib/           # Utility functions
│   │   └── main.tsx       # React application entry
│   ├── package.json       # Frontend dependencies
│   └── vite.config.ts     # Vite configuration
├── dashboard/
│   └── dist/              # Production build output
├── test/
│   └── deletion.test.js    # Unit tests for deletion functionality
├── data/
│   └── bot.db              # SQLite database (created automatically)
├── .gitconfig-rules.md     # Git configuration rules and aliases
├── package.json
├── .env.example
└── README.md
```

## Frontend Architecture 🎨

The dashboard features a modern React frontend with:

- **React 18** with TypeScript for type safety
- **Vite** for fast development and optimized builds
- **shadcn/ui** component library for consistent design
- **Tailwind CSS** for utility-first styling
- **Hot Module Replacement** for instant development feedback
- **Production builds** served by the Express backend

### Development vs Production

- **Development**: Frontend runs on `http://127.0.0.1:5173` with HMR
- **Production**: Built files served from `http://127.0.0.1:3000`

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
   - For development, frontend runs on `http://127.0.0.1:5173`
   - For production, access `http://127.0.0.1:3000`
   - Check console for error messages

### Logs

Bot logs are displayed in the console. Set `LOG_LEVEL=debug` in `.env` for detailed logging.

## Development 👨‍💻

### Running in Development Mode

```bash
# Backend development (auto-restart)
npm run dev

# Frontend development (React with HMR)
cd frontend && npm run dev
```

Backend runs with nodemon for auto-restart. Frontend uses Vite with Hot Module Replacement for instant updates.

### Testing

```bash
# Run deletion functionality tests
npm run test:deletion

# Run all tests
npm test
```

### Database Management

```bash
# Reset database (WARNING: This deletes all data)
npm run setup-db
```

### Git Configuration

The project includes pre-configured Git rules and aliases. See `.gitconfig-rules.md` for:
- User profile configuration
- Commit and push automation
- Useful Git aliases (`git cap`, `git cmp`)
- Best practices for version control

#### Quick Git Commands
```bash
# Commit and push in one command
git cap

# Commit with message and push
git cmp "your commit message"
```

## Version History 📋

### v0.1 (Latest)
- ✅ Fixed Discord message deletion functionality
- ✅ Added comprehensive permission checking
- ✅ Improved message pagination and API compliance
- ✅ Enhanced error handling and logging
- ✅ Added unit tests for deletion features
- ✅ Configured Git rules and aliases

## Contributing 🤝

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly (run `npm test`)
5. Follow the Git configuration rules in `.gitconfig-rules.md`
6. Submit a pull request

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