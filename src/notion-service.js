const { Client } = require('@notionhq/client');

class NotionService {
    constructor(apiKey) {
        this.notion = new Client({ auth: apiKey });
        this.databaseSchemas = new Map(); // Cache for database schemas
    }

    async getStatusFilter(databaseId) {
        try {
            // Check cache first
            if (this.databaseSchemas.has(databaseId)) {
                const schema = this.databaseSchemas.get(databaseId);
                return schema.statusFilter;
            }

            // Get database schema
            const database = await this.notion.databases.retrieve({ database_id: databaseId });
            const properties = database.properties;

            // Find Status property
            const statusProperty = Object.entries(properties).find(([key, prop]) => 
                key.toLowerCase() === 'status' || key.toLowerCase() === 'state'
            );

            if (!statusProperty) {
                console.warn('No Status property found in database');
                this.databaseSchemas.set(databaseId, { statusFilter: null });
                return null;
            }

            const [propertyName, propertyConfig] = statusProperty;
            let statusFilter = null;

            // Create filter based on property type
            console.log(`Status property '${propertyName}' has type: ${propertyConfig.type}`);
            switch (propertyConfig.type) {
                case 'select':
                    statusFilter = {
                        property: propertyName,
                        select: { equals: 'Open' }
                    };
                    break;
                case 'multi_select':
                    statusFilter = {
                        property: propertyName,
                        multi_select: { contains: 'Open' }
                    };
                    break;
                case 'rich_text':
                case 'title':
                    statusFilter = {
                        property: propertyName,
                        rich_text: { equals: 'Open' }
                    };
                    break;
                case 'status':
                    // Notion's built-in status property type
                    statusFilter = {
                        property: propertyName,
                        status: { equals: 'Open' }
                    };
                    break;
                default:
                    console.warn(`Unsupported Status property type: ${propertyConfig.type}`);
                    console.log('Property config:', JSON.stringify(propertyConfig, null, 2));
                    break;
            }

            // Cache the result
            this.databaseSchemas.set(databaseId, { statusFilter });
            return statusFilter;
        } catch (error) {
            console.error('Error getting status filter:', error);
            return null;
        }
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
            // Build filter array
            const filters = [
                {
                    timestamp: 'created_time',
                    created_time: {
                        after: lastChecked
                    }
                }
            ];

            // Add status filter if available
            const statusFilter = await this.getStatusFilter(databaseId);
            if (statusFilter) {
                filters.push(statusFilter);
            }

            const response = await this.notion.databases.query({
                database_id: databaseId,
                filter: {
                    and: filters
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
            // Build filter array
            const filters = [
                {
                    timestamp: 'last_edited_time',
                    last_edited_time: {
                        after: lastChecked
                    }
                }
            ];

            // Add status filter if available
            const statusFilter = await this.getStatusFilter(databaseId);
            if (statusFilter) {
                filters.push(statusFilter);
            }

            const response = await this.notion.databases.query({
                database_id: databaseId,
                filter: {
                    and: filters
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

    async getAllOpenIssues(databaseId) {
        try {
            const statusFilter = await this.getStatusFilter(databaseId);
            
            if (!statusFilter) {
                console.warn('No status filter available, returning all issues');
                // If no status filter, get all issues
                const response = await this.notion.databases.query({
                     database_id: databaseId,
                     sorts: [
                         {
                             property: 'Created time',
                             direction: 'descending'
                         }
                     ]
                 });
                return response.results.map(page => this.formatPageData(page));
            }
            
            const response = await this.notion.databases.query({
                 database_id: databaseId,
                 filter: statusFilter,
                 sorts: [
                     {
                         property: 'Created time',
                         direction: 'descending'
                     }
                 ]
             });

            return response.results.map(page => this.formatPageData(page));
        } catch (error) {
            console.error('Error fetching all open issues:', error);
            return [];
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
            (prop.type === 'status' || prop.type === 'select') && 
            (prop.name?.toLowerCase().includes('status') || prop.name?.toLowerCase().includes('state'))
        );
        if (statusProperty) {
            if (statusProperty.type === 'status' && statusProperty.status) {
                status = statusProperty.status.name;
            } else if (statusProperty.type === 'select' && statusProperty.select) {
                status = statusProperty.select.name;
            }
        }

        // Try to find Issue ID property with various naming conventions
        let issueId = null;
        const issueIdProperty = Object.entries(properties).find(([key, prop]) => {
            const keyLower = key.toLowerCase().replace(/[\s_-]/g, '');
            return keyLower === 'issueid' || 
                   keyLower === 'id' || 
                   keyLower === 'issuenum' || 
                   keyLower === 'issuenumber' || 
                   keyLower === 'ticketid' || 
                   keyLower === 'taskid';
        });
        
        if (issueIdProperty) {
            const [key, prop] = issueIdProperty;
            console.log(`📋 Found Issue ID property: "${key}" (type: ${prop.type})`);
            
            if (prop.type === 'unique_id' && prop.unique_id && prop.unique_id.number !== null) {
                issueId = prop.unique_id.prefix ? `${prop.unique_id.prefix}-${prop.unique_id.number}` : prop.unique_id.number.toString();
            } else if (prop.type === 'rich_text' && prop.rich_text.length > 0) {
                issueId = prop.rich_text[0].plain_text.trim();
            } else if (prop.type === 'number' && prop.number !== null) {
                issueId = prop.number.toString();
            } else if (prop.type === 'title' && prop.title.length > 0) {
                issueId = prop.title[0].plain_text.trim();
            } else if (prop.type === 'formula' && prop.formula && prop.formula.string) {
                issueId = prop.formula.string.trim();
            }
            
            if (issueId) {
                console.log(`✅ Extracted Issue ID: "${issueId}"`);
            } else {
                console.log(`⚠️ Issue ID property found but no value extracted`);
            }
        } else {
            console.log(`⚠️ No Issue ID property found. Available properties: ${Object.keys(properties).join(', ')}`);
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
            issueId,
            url: page.url,
            created_time: page.created_time,
            last_edited_time: page.last_edited_time,
            properties: page.properties
        };
    }

    async updatePageStatus(pageId, newStatus) {
        try {
            // First, get the page to understand its properties
            const page = await this.notion.pages.retrieve({ page_id: pageId });
            
            // Find a status property (status or select type with 'status' or 'state' in name)
            // First try exact matches for status type, then select type
            let statusProperty = Object.entries(page.properties).find(([key, prop]) => 
                prop.type === 'status' && 
                (key.toLowerCase() === 'status' || key.toLowerCase() === 'state')
            );
            
            // If no status type found, try select type with exact matches
            if (!statusProperty) {
                statusProperty = Object.entries(page.properties).find(([key, prop]) => 
                    prop.type === 'select' && 
                    (key.toLowerCase() === 'status' || key.toLowerCase() === 'state')
                );
            }
            
            // If no exact match, try partial matches for both types
            if (!statusProperty) {
                statusProperty = Object.entries(page.properties).find(([key, prop]) => 
                    (prop.type === 'status' || prop.type === 'select') && 
                    (key.toLowerCase().includes('status') || key.toLowerCase().includes('state'))
                );
            }

            if (!statusProperty) {
                console.warn(`No status property found in page ${pageId}. Available properties:`, Object.keys(page.properties));
                // Try to find any select property as fallback
                const anySelectProperty = Object.entries(page.properties).find(([key, prop]) => prop.type === 'select');
                
                if (!anySelectProperty) {
                    throw new Error('No select properties found in the page. Cannot update status.');
                }
                
                console.log(`Using fallback select property: ${anySelectProperty[0]}`);
                const [fallbackPropertyName] = anySelectProperty;
                
                // Update using fallback property
                const response = await this.notion.pages.update({
                    page_id: pageId,
                    properties: {
                        [fallbackPropertyName]: {
                            select: {
                                name: newStatus
                            }
                        }
                    }
                });
                
                return response;
            }

            const [statusPropertyName, statusPropertyConfig] = statusProperty;

            // Prepare the update object based on property type
            let updateObject;
            if (statusPropertyConfig.type === 'status') {
                updateObject = {
                    [statusPropertyName]: {
                        status: {
                            name: newStatus
                        }
                    }
                };
            } else {
                updateObject = {
                    [statusPropertyName]: {
                        select: {
                            name: newStatus
                        }
                    }
                };
            }

            // Update the page
            const response = await this.notion.pages.update({
                page_id: pageId,
                properties: updateObject
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