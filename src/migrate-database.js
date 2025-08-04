const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Database migration script to update schema for multiple connections
const db = new sqlite3.Database('./database/bot.db');

console.log('🔄 Starting database migration...');

db.serialize(() => {
    // Check if we need to migrate the connections table
    db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='connections'", (err, row) => {
        if (err) {
            console.error('Error checking table schema:', err);
            return;
        }
        
        if (row && row.sql.includes('notion_database_id TEXT NOT NULL UNIQUE')) {
            console.log('📋 Migrating connections table to allow multiple connections...');
            
            // Drop temporary table if it exists from previous failed migration
            db.run('DROP TABLE IF EXISTS connections_new', (err) => {
                if (err) {
                    console.error('Error dropping temporary table:', err);
                    return;
                }
                
                // Create new table with updated schema
                db.run(`
                    CREATE TABLE connections_new (
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
            `, (err) => {
                if (err) {
                    console.error('Error creating new connections table:', err);
                    return;
                }
                
                // Copy data from old table to new table
                db.run(`
                    INSERT INTO connections_new 
                    (id, notion_database_id, notion_database_name, discord_channel_id, discord_channel_name, 
                     last_checked, active, created_at, updated_at)
                    SELECT id, notion_database_id, notion_database_name, discord_channel_id, 
                           '', last_checked, active, created_at, updated_at
                    FROM connections
                `, (err) => {
                    if (err) {
                        console.error('Error copying data:', err);
                        return;
                    }
                    
                    // Drop old table
                    db.run('DROP TABLE connections', (err) => {
                        if (err) {
                            console.error('Error dropping old table:', err);
                            return;
                        }
                        
                        // Rename new table
                        db.run('ALTER TABLE connections_new RENAME TO connections', (err) => {
                            if (err) {
                                console.error('Error renaming table:', err);
                                return;
                            }
                            
                            console.log('✅ Database migration completed successfully!');
                            console.log('📋 You can now connect the same Notion database to multiple Discord channels');
                            
                            db.close((err) => {
                                if (err) {
                                    console.error('Error closing database:', err);
                                } else {
                                    console.log('🔒 Database connection closed.');
                                }
                            });
                        });
                    });
                });
            });
            });
        } else {
            console.log('✅ Database schema is already up to date!');
            db.close();
        }
    });
});