const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Migration script to add connection_name field to connections table
const db = new sqlite3.Database('./database/bot.db');

console.log('🔄 Starting connection name migration...');

db.serialize(() => {
    // Check if connection_name column already exists
    db.get("PRAGMA table_info(connections)", (err, row) => {
        if (err) {
            console.error('Error checking table schema:', err);
            db.close();
            return;
        }
        
        // Get all columns to check if connection_name exists
        db.all("PRAGMA table_info(connections)", (err, columns) => {
            if (err) {
                console.error('Error getting table info:', err);
                db.close();
                return;
            }
            
            const hasConnectionName = columns.some(col => col.name === 'connection_name');
            
            if (!hasConnectionName) {
                console.log('📋 Adding connection_name column to connections table...');
                
                // Add connection_name column
                db.run('ALTER TABLE connections ADD COLUMN connection_name TEXT', (err) => {
                    if (err) {
                        console.error('Error adding connection_name column:', err);
                        db.close();
                        return;
                    }
                    
                    console.log('✅ connection_name column added successfully');
                    
                    // Update existing connection with the name 'LMS Project Issue'
                    db.run(`
                        UPDATE connections 
                        SET connection_name = 'LMS Project Issue' 
                        WHERE connection_name IS NULL OR connection_name = ''
                    `, (err) => {
                        if (err) {
                            console.error('Error updating connection name:', err);
                        } else {
                            console.log('✅ Updated existing connection with name "LMS Project Issue"');
                        }
                        
                        // Show updated connections
                        db.all('SELECT * FROM connections', (err, rows) => {
                            if (err) {
                                console.error('Error fetching connections:', err);
                            } else {
                                console.log('📊 Current connections:');
                                rows.forEach(row => {
                                    console.log(`  - ID: ${row.id}, Name: ${row.connection_name || 'No name'}, Notion DB: ${row.notion_database_name}, Discord Channel: ${row.discord_channel_name}`);
                                });
                            }
                            
                            db.close();
                            console.log('🎉 Migration completed successfully!');
                        });
                    });
                });
            } else {
                console.log('✅ connection_name column already exists');
                
                // Still update the connection name if it's empty
                db.run(`
                    UPDATE connections 
                    SET connection_name = 'LMS Project Issue' 
                    WHERE connection_name IS NULL OR connection_name = ''
                `, (err) => {
                    if (err) {
                        console.error('Error updating connection name:', err);
                    } else {
                        console.log('✅ Updated existing connection with name "LMS Project Issue"');
                    }
                    
                    // Show updated connections
                    db.all('SELECT * FROM connections', (err, rows) => {
                        if (err) {
                            console.error('Error fetching connections:', err);
                        } else {
                            console.log('📊 Current connections:');
                            rows.forEach(row => {
                                console.log(`  - ID: ${row.id}, Name: ${row.connection_name || 'No name'}, Notion DB: ${row.notion_database_name}, Discord Channel: ${row.discord_channel_name}`);
                            });
                        }
                        
                        db.close();
                        console.log('🎉 Migration completed successfully!');
                    });
                });
            }
        });
    });
});