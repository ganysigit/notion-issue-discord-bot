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
    async addConnection(notionDbId, notionDbName, discordChannelId, discordChannelName = '') {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO connections (notion_database_id, notion_database_name, discord_channel_id, discord_channel_name)
                VALUES (?, ?, ?, ?)
            `;
            this.db.run(sql, [notionDbId, notionDbName, discordChannelId, discordChannelName], function(err) {
                if (err) {
                    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                        reject(new Error('This Notion database is already connected to this Discord channel'));
                    } else {
                        reject(err);
                    }
                } else {
                    resolve({ id: this.lastID, notionDbId, notionDbName, discordChannelId, discordChannelName });
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
            // First delete all tracked issues for this connection
            const deleteTrackedIssuesSql = 'DELETE FROM tracked_issues WHERE connection_id = ?';
            this.db.run(deleteTrackedIssuesSql, [id], (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                // Then delete the connection itself
                const deleteConnectionSql = 'DELETE FROM connections WHERE id = ?';
                this.db.run(deleteConnectionSql, [id], (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        });
    }

    // Tracked issues management
    async addTrackedIssue(notionPageId, discordMessageId, connectionId, issueTitle, status = 'Open', issueId = null) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO tracked_issues (notion_page_id, discord_message_id, connection_id, current_status, issue_title, issue_id)
                VALUES (?, ?, ?, ?, ?, ?)
            `;
            this.db.run(sql, [notionPageId, discordMessageId, connectionId, status, issueTitle, issueId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ id: this.lastID });
                }
            });
        });
    }

    async getTrackedIssueByIssueId(issueId, connectionId) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM tracked_issues WHERE issue_id = ? AND connection_id = ?';
            this.db.get(sql, [issueId, connectionId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    async isIssueAlreadyAnnounced(issueId, connectionId) {
        if (!issueId) return false;
        
        const existingIssue = await this.getTrackedIssueByIssueId(issueId, connectionId);
        return !!existingIssue;
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

    async getTrackedIssuesByConnection(connectionId) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM tracked_issues WHERE connection_id = ?';
            this.db.all(sql, [connectionId], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async removeTrackedIssue(discordMessageId) {
        return new Promise((resolve, reject) => {
            const sql = 'DELETE FROM tracked_issues WHERE discord_message_id = ?';
            this.db.run(sql, [discordMessageId], (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }
}

module.exports = DatabaseService;