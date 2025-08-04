const DiscordNotionBot = require('./bot');
const DashboardServer = require('./dashboard-server');
require('dotenv').config();

class DiscordNotionApp {
    constructor() {
        this.bot = null;
        this.dashboardServer = null;
        this.startTime = Date.now();
    }

    async start() {
        try {
            console.log('🚀 Starting Discord-Notion Bot Application...');
            
            // Database is automatically set up when the DatabaseService connects
            console.log('📊 Database will be initialized when services connect...');
            
            // Start dashboard server
            console.log('🌐 Starting dashboard server...');
            this.dashboardServer = new DashboardServer();
            await this.dashboardServer.start();
            console.log(`✅ Dashboard server running on http://localhost:${process.env.DASHBOARD_PORT || 3000}`);
            
            // Start Discord bot
            console.log('🤖 Starting Discord bot...');
            this.bot = new DiscordNotionBot();
            await this.bot.start();
            console.log('✅ Discord bot started successfully');
            
            console.log('\n🎉 Application started successfully!');
            console.log('📊 Dashboard: http://127.0.0.1:' + (process.env.DASHBOARD_PORT || 3000));
            console.log('🤖 Bot is now online and monitoring Notion databases');
            
            // Setup graceful shutdown
            this.setupGracefulShutdown();
            
        } catch (error) {
            console.error('❌ Failed to start application:', error);
            process.exit(1);
        }
    }

    setupGracefulShutdown() {
        const shutdown = async (signal) => {
            console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
            
            try {
                if (this.bot) {
                    console.log('🤖 Stopping Discord bot...');
                    await this.bot.stop();
                }
                
                if (this.dashboardServer) {
                    console.log('🌐 Stopping dashboard server...');
                    this.dashboardServer.close();
                }
                
                console.log('✅ Application shut down successfully');
                process.exit(0);
            } catch (error) {
                console.error('❌ Error during shutdown:', error);
                process.exit(1);
            }
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('uncaughtException', (error) => {
            console.error('❌ Uncaught Exception:', error);
            shutdown('uncaughtException');
        });
        process.on('unhandledRejection', (reason, promise) => {
            console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
            shutdown('unhandledRejection');
        });
    }

    getUptime() {
        return Math.floor((Date.now() - this.startTime) / 1000);
    }

    getMemoryUsage() {
        return process.memoryUsage();
    }

    getStatus() {
        return {
            uptime: this.getUptime(),
            memoryUsage: this.getMemoryUsage(),
            botStatus: this.bot ? this.bot.getStatus() : 'offline',
            dashboardStatus: this.dashboardServer ? 'online' : 'offline'
        };
    }
}

// Start the application if this file is run directly
if (require.main === module) {
    const app = new DiscordNotionApp();
    app.start();
}

module.exports = { DiscordNotionApp };