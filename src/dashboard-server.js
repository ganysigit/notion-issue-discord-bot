require('dotenv').config();
const express = require('express');
const path = require('path');
const DatabaseService = require('./database');
const NotionService = require('./notion-service');

class DashboardServer {
    constructor() {
        this.app = express();
        this.port = process.env.DASHBOARD_PORT || 3000;
        this.db = new DatabaseService(process.env.DATABASE_PATH);
        this.notion = new NotionService(process.env.NOTION_API_KEY);
        
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(express.static(path.join(__dirname, '../dashboard/public')));
        
        // CORS for local development
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            next();
        });
    }

    setupRoutes() {
        // Serve main dashboard page
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '../dashboard/enhanced.html'));
        });
        
        // Serve original dashboard for comparison
        this.app.get('/original', (req, res) => {
            res.sendFile(path.join(__dirname, '../dashboard/index.html'));
        });

        // API Routes
        this.app.get('/api/connections', this.getConnections.bind(this));
        this.app.post('/api/connections', this.addConnection.bind(this));
        this.app.delete('/api/connections/:id', this.deleteConnection.bind(this));
        this.app.post('/api/test-notion', this.testNotionDatabase.bind(this));
        this.app.get('/api/status', this.getStatus.bind(this));
        this.app.get('/api/tracked-issues', this.getTrackedIssues.bind(this));
    }

    async getConnections(req, res) {
        try {
            const connections = await this.db.getConnections();
            res.json({ success: true, data: connections });
        } catch (error) {
            console.error('Error fetching connections:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async addConnection(req, res) {
        try {
            const { notionDatabaseId, discordChannelId } = req.body;
            
            if (!notionDatabaseId || !discordChannelId) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Missing required fields: notionDatabaseId, discordChannelId' 
                });
            }

            // Clean and validate database ID
            const cleanDbId = this.cleanDatabaseId(notionDatabaseId);
            if (!cleanDbId) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Invalid database ID format. Please provide a valid 32-character Notion database ID.' 
                });
            }

            // Test Notion database access
            const dbInfo = await this.notion.getDatabaseInfo(cleanDbId);
            
            // Add connection to database
            const result = await this.db.addConnection(
                cleanDbId,
                dbInfo.title,
                discordChannelId
            );

            res.json({ 
                success: true, 
                data: { 
                    id: result.id, 
                    notionDatabaseName: dbInfo.title 
                } 
            });
        } catch (error) {
            console.error('Error adding connection:', error);
            
            // Handle SQLite constraint errors (duplicate connections)
            if (error.code === 'SQLITE_CONSTRAINT' && error.message.includes('UNIQUE constraint failed: connections.notion_database_id')) {
                return res.status(409).json({ 
                    success: false, 
                    error: 'This Notion database is already connected. Each database can only be connected once.' 
                });
            }
            
            // Handle specific Notion API errors
            if (error.code === 'object_not_found' || error.status === 404) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'Database not found or not accessible. Make sure the database ID is correct and your Notion integration has access to it.' 
                });
            }
            
            if (error.code === 'unauthorized' || error.status === 401) {
                return res.status(401).json({ 
                    success: false, 
                    error: 'Invalid Notion API token. Please check your NOTION_API_KEY in the .env file.' 
                });
            }
            
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async deleteConnection(req, res) {
        try {
            const { id } = req.params;
            await this.db.deleteConnection(id);
            res.json({ success: true });
        } catch (error) {
            console.error('Error deleting connection:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async testNotionDatabase(req, res) {
        try {
            const { databaseId } = req.body;
            
            if (!databaseId) {
                return res.status(400).json({ success: false, error: 'Database ID is required' });
            }

            // Clean and validate database ID format
            const cleanId = this.cleanDatabaseId(databaseId);
            if (!cleanId) {
                return res.status(400).json({ 
                    success: false, 
                    code: 'invalid_database_id',
                    error: 'Invalid database ID format. Please provide a valid 32-character Notion database ID.' 
                });
            }

            const dbInfo = await this.notion.getDatabaseInfo(cleanId);
            res.json({ 
                success: true, 
                data: {
                    title: dbInfo.title,
                    id: dbInfo.id,
                    properties: Object.keys(dbInfo.properties)
                }
            });
        } catch (error) {
            console.error('Notion API Error:', error);
            
            // Handle specific Notion API errors
            if (error.code === 'unauthorized' || error.status === 401 || 
                (error.message && error.message.toLowerCase().includes('invalid'))) {
                return res.status(401).json({ 
                    success: false, 
                    code: 'invalid_token',
                    error: 'Invalid Notion API token. Please check your NOTION_API_KEY in the .env file.' 
                });
            }
            
            if (error.code === 'object_not_found' || error.status === 404) {
                return res.status(404).json({ 
                    success: false, 
                    code: 'database_not_found',
                    error: 'Database not found or not accessible. Make sure the database ID is correct and your Notion integration has access to it.' 
                });
            }
            
            if (error.code === 'validation_error') {
                return res.status(400).json({ 
                    success: false, 
                    code: 'validation_error',
                    error: 'Invalid request format. Please check the database ID format.' 
                });
            }
            
            res.status(500).json({ success: false, error: error.message });
        }
    }
    
    cleanDatabaseId(databaseId) {
        if (!databaseId) return null;
        
        // Remove any URL parts if it's a full URL
        if (databaseId.includes('notion.so')) {
            const match = databaseId.match(/([a-f0-9]{32})/i);
            return match ? match[1] : null;
        }
        
        // Remove hyphens and clean the ID
        const cleaned = databaseId.replace(/[-\s]/g, '');
        
        // Validate format (should be 32 hex characters)
        if (!/^[a-f0-9]{32}$/i.test(cleaned)) {
            return null;
        }
        
        return cleaned;
    }

    async getStatus(req, res) {
        try {
            const connections = await this.db.getConnections();
            const trackedIssues = await this.db.getAllTrackedIssues();
            
            res.json({
                success: true,
                data: {
                    connectionsCount: connections.length,
                    trackedIssuesCount: trackedIssues.length,
                    uptime: process.uptime(),
                    nodeVersion: process.version,
                    memoryUsage: process.memoryUsage()
                }
            });
        } catch (error) {
            console.error('Error getting status:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async getTrackedIssues(req, res) {
        try {
            const issues = await this.db.getAllTrackedIssues();
            res.json({ success: true, data: issues });
        } catch (error) {
            console.error('Error fetching tracked issues:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async start() {
        try {
            await this.db.connect();
            
            this.app.listen(this.port, () => {
                console.log(`🌐 Dashboard server running at http://localhost:${this.port}`);
                console.log(`📊 Access the dashboard to manage Notion connections`);
            });
        } catch (error) {
            console.error('Failed to start dashboard server:', error);
            process.exit(1);
        }
    }

    async stop() {
        console.log('🛑 Shutting down dashboard server...');
        await this.db.close();
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    if (global.dashboardServer) {
        await global.dashboardServer.stop();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    if (global.dashboardServer) {
        await global.dashboardServer.stop();
    }
    process.exit(0);
});

// Start the server
if (require.main === module) {
    const server = new DashboardServer();
    global.dashboardServer = server;
    server.start();
}

module.exports = DashboardServer;