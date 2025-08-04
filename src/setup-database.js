const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Ensure database directory exists
const dbDir = path.dirname('./database/bot.db');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database('./database/bot.db');

// Create tables
db.serialize(() => {
    // Connections table to store Notion database to Discord channel mappings
    db.run(`
        CREATE TABLE IF NOT EXISTS connections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            notion_database_id TEXT NOT NULL,
            notion_database_name TEXT NOT NULL,
            discord_channel_id TEXT NOT NULL,
            discord_channel_name TEXT NOT NULL,
            last_checked DATETIME DEFAULT CURRENT_TIMESTAMP,
            active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(notion_database_id, discord_channel_id)
        )
    `);

    // Tracked issues table to maintain Discord message to Notion page relationships
    db.run(`
        CREATE TABLE IF NOT EXISTS tracked_issues (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            notion_page_id TEXT NOT NULL,
            discord_message_id TEXT NOT NULL,
            connection_id INTEGER NOT NULL,
            current_status TEXT DEFAULT 'Open',
            issue_title TEXT NOT NULL,
            issue_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (connection_id) REFERENCES connections (id),
            UNIQUE(notion_page_id, discord_message_id)
        )
    `);

    // Add issue_id column if it doesn't exist (for existing databases)
    db.run(`
        ALTER TABLE tracked_issues ADD COLUMN issue_id TEXT
    `, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('Error adding issue_id column:', err);
        }
    });

    console.log('Database tables created successfully!');
});

db.close((err) => {
    if (err) {
        console.error('Error closing database:', err.message);
    } else {
        console.log('Database setup completed.');
    }
});