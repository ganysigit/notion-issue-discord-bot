const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class DatabaseService {
    constructor(dbPath = './database/bot.db') {
        this.dbPath = dbPath;
        this.db = null;
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log('Connected to SQLite database');
                    resolve();
                }
            });
        });
    }

    close() {
        return new Promise((resolve, reject) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) {
                        reject(err);
                    } else {
                        console.log('Database connection closed');
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        });
    }

    // Connection management
    async addConnection(notionDbId, notionDbName, discordChannelId) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO connections (notion_database_id, notion_database_name, discord_channel_id)
                VALUES (?, ?, ?)
            `;
            this.db.run(sql, [notionDbId, notionDbName, discordChannelId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ id: this.lastID, notionDbId, notionDbName, discordChannelId });
                }
            });
        });
    }

    async getConnections() {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM connections WHERE active = 1';
            this.db.all(sql, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async getConnectionById(id) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM connections WHERE id = ?';
            this.db.get(sql, [id], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    async updateConnectionLastChecked(connectionId, timestamp) {
        return new Promise((resolve, reject) => {
            const sql = 'UPDATE connections SET last_checked = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
            this.db.run(sql, [timestamp, connectionId], (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    async deleteConnection(id) {
        return new Promise((resolve, reject) => {
            const sql = 'UPDATE connections SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
            this.db.run(sql, [id], (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    // Tracked issues management
    async addTrackedIssue(notionPageId, discordMessageId, connectionId, issueTitle, status = 'Open') {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO tracked_issues (notion_page_id, discord_message_id, connection_id, current_status, issue_title)
                VALUES (?, ?, ?, ?, ?)
            `;
            this.db.run(sql, [notionPageId, discordMessageId, connectionId, status, issueTitle], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ id: this.lastID });
                }
            });
        });
    }

    async getTrackedIssueByNotionId(notionPageId) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM tracked_issues WHERE notion_page_id = ?';
            this.db.get(sql, [notionPageId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    async getTrackedIssueByDiscordId(discordMessageId) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM tracked_issues WHERE discord_message_id = ?';
            this.db.get(sql, [discordMessageId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    async updateIssueStatus(notionPageId, newStatus) {
        return new Promise((resolve, reject) => {
            const sql = 'UPDATE tracked_issues SET current_status = ?, updated_at = CURRENT_TIMESTAMP WHERE notion_page_id = ?';
            this.db.run(sql, [newStatus, notionPageId], (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    async getAllTrackedIssues() {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT ti.*, c.discord_channel_id, c.notion_database_name 
                FROM tracked_issues ti 
                JOIN connections c ON ti.connection_id = c.id 
                WHERE c.active = 1
            `;
            this.db.all(sql, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }
}

module.exports = DatabaseService;