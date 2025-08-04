const { Client } = require('@notionhq/client');

class NotionService {
    constructor(apiKey) {
        this.notion = new Client({ auth: apiKey });
    }

    async getDatabaseInfo(databaseId) {
        try {
            const database = await this.notion.databases.retrieve({
                database_id: databaseId
            });
            return {
                id: database.id,
                title: database.title[0]?.plain_text || 'Untitled Database',
                properties: database.properties
            };
        } catch (error) {
            console.error('Error fetching database info:', error);
            throw error;
        }
    }

    async getNewIssues(databaseId, lastChecked) {
        try {
            const response = await this.notion.databases.query({
                database_id: databaseId,
                filter: {
                    and: [
                        {
                            timestamp: 'created_time',
                            created_time: {
                                after: lastChecked
                            }
                        }
                    ]
                },
                sorts: [
                    {
                        timestamp: 'created_time',
                        direction: 'ascending'
                    }
                ]
            });

            return response.results.map(page => this.formatPageData(page));
        } catch (error) {
            console.error('Error fetching new issues:', error);
            throw error;
        }
    }

    async getUpdatedIssues(databaseId, lastChecked) {
        try {
            const response = await this.notion.databases.query({
                database_id: databaseId,
                filter: {
                    and: [
                        {
                            timestamp: 'last_edited_time',
                            last_edited_time: {
                                after: lastChecked
                            }
                        }
                    ]
                },
                sorts: [
                    {
                        timestamp: 'last_edited_time',
                        direction: 'ascending'
                    }
                ]
            });

            return response.results.map(page => this.formatPageData(page));
        } catch (error) {
            console.error('Error fetching updated issues:', error);
            throw error;
        }
    }

    formatPageData(page) {
        const properties = page.properties;
        
        // Try to find title property (could be 'Name', 'Title', or first title property)
        let title = 'Untitled';
        const titleProperty = Object.values(properties).find(prop => prop.type === 'title');
        if (titleProperty && titleProperty.title.length > 0) {
            title = titleProperty.title[0].plain_text;
        }

        // Try to find status property (could be 'Status', 'State', etc.)
        let status = 'Open';
        const statusProperty = Object.values(properties).find(prop => 
            prop.type === 'select' && 
            (prop.name?.toLowerCase().includes('status') || prop.name?.toLowerCase().includes('state'))
        );
        if (statusProperty && statusProperty.select) {
            status = statusProperty.select.name;
        }

        // Try to find description or content
        let description = '';
        const descProperty = Object.values(properties).find(prop => 
            prop.type === 'rich_text' && 
            (prop.name?.toLowerCase().includes('description') || prop.name?.toLowerCase().includes('content'))
        );
        if (descProperty && descProperty.rich_text.length > 0) {
            description = descProperty.rich_text[0].plain_text;
        }

        return {
            id: page.id,
            title,
            status,
            description,
            url: page.url,
            created_time: page.created_time,
            last_edited_time: page.last_edited_time,
            properties: page.properties
        };
    }

    async updatePageStatus(pageId, newStatus) {
        try {
            // First, get the page to understand its structure
            const page = await this.notion.pages.retrieve({ page_id: pageId });
            
            // Find the status property
            const statusProperty = Object.entries(page.properties).find(([key, prop]) => 
                prop.type === 'select' && 
                (key.toLowerCase().includes('status') || key.toLowerCase().includes('state'))
            );

            if (!statusProperty) {
                throw new Error('No status property found in the page');
            }

            const [statusPropertyName] = statusProperty;

            // Update the page
            const response = await this.notion.pages.update({
                page_id: pageId,
                properties: {
                    [statusPropertyName]: {
                        select: {
                            name: newStatus
                        }
                    }
                }
            });

            return this.formatPageData(response);
        } catch (error) {
            console.error('Error updating page status:', error);
            throw error;
        }
    }

    async getPage(pageId) {
        try {
            const page = await this.notion.pages.retrieve({ page_id: pageId });
            return this.formatPageData(page);
        } catch (error) {
            console.error('Error fetching page:', error);
            throw error;
        }
    }

    // Utility method to test database access
    async testDatabaseAccess(databaseId) {
        try {
            await this.notion.databases.retrieve({ database_id: databaseId });
            return true;
        } catch (error) {
            console.error('Database access test failed:', error);
            return false;
        }
    }
}

module.exports = NotionService;