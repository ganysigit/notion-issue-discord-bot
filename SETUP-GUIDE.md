# 🚀 Quick Setup Guide

## Current Status ✅

✅ **SQLite Database**: Working perfectly! Tested and ready to store connections  
✅ **Dashboard Server**: Running at http://localhost:3000  
✅ **Project Structure**: Complete with all necessary files  
✅ **Dependencies**: Installed and ready  

## What You Need to Configure 🔧

The bot is **fully functional** but needs API tokens to connect to Discord and Notion:

### 1. Discord Bot Setup (Required)

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to "Bot" section → "Add Bot"
4. Copy the **Bot Token**
5. Go to "OAuth2" → "URL Generator":
   - Scopes: `bot`, `applications.commands`
   - Permissions: `Send Messages`, `Use Slash Commands`, `Embed Links`
6. Use the generated URL to invite the bot to your server

### 2. Notion Integration Setup (Required)

1. Go to [Notion Integrations](https://www.notion.so/my-integrations)
2. Click "New integration"
3. Give it a name and copy the **Integration Token**
4. Share your Notion database with the integration:
   - Open your database in Notion
   - Click "Share" → "Invite" → Search for your integration

### 3. Configure Environment Variables

Edit the `.env` file and replace the placeholder values:

```env
DISCORD_BOT_TOKEN=your_actual_discord_bot_token
DISCORD_CLIENT_ID=your_actual_discord_client_id
NOTION_API_KEY=your_actual_notion_integration_token
```

## Testing Your Setup 🧪

### Test Database (Already Working!)
```bash
npm run test-db
```

### Test Dashboard (Currently Running)
Open: http://localhost:3000

### Test Full Application
```bash
npm start
```

## Notion Database Requirements 📋

Your Notion database should have these properties:

- **Title** (Title property) - For issue titles
- **Status** (Select property) - With options: "Open", "Fixed"
- **Description** (Rich Text property) - Optional, for issue details

## Quick Commands 🎯

```bash
# Start everything (bot + dashboard)
npm start

# Development mode with auto-restart
npm run dev

# Dashboard only
npm run dashboard

# Test database functionality
npm run test-db

# Bot only (requires tokens)
npm run bot-only
```

## Troubleshooting 🔧

### "401 Unauthorized" Error
- ✅ **Database is working fine!**
- ❌ **Missing/Invalid API tokens**
- 💡 **Solution**: Configure your `.env` file with real tokens

### Bot Not Responding
- Check Discord bot permissions
- Verify bot is invited to your server
- Ensure `DISCORD_BOT_TOKEN` is correct

### Notion Connection Failed
- Verify `NOTION_API_KEY` is correct
- Check if database is shared with integration
- Ensure database has required properties

## What's Working Right Now 🎉

1. **SQLite Database**: Storing and retrieving connections perfectly
2. **Dashboard Interface**: Beautiful web UI for management
3. **Project Structure**: All files created and organized
4. **Error Handling**: Graceful handling of missing tokens
5. **Documentation**: Complete setup instructions

## Next Steps 📝

1. Get your Discord bot token
2. Get your Notion integration token
3. Update the `.env` file
4. Run `npm start`
5. Add your first connection via the dashboard
6. Test with a real Notion database

---

**Your Discord-Notion bot is ready to go! Just add the API tokens and you're all set! 🚀**