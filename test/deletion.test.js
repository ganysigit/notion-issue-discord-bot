// Jest globals are automatically available

// Mock Discord.js Collection-like behavior
class MockCollection extends Map {
  filter(fn) {
    const filtered = new MockCollection();
    for (const [key, value] of this) {
      if (fn(value)) {
        filtered.set(key, value);
      }
    }
    return filtered;
  }
  
  first() {
    return this.values().next().value;
  }
  
  forEach(fn) {
    for (const [key, value] of this) {
      fn(value, key, this);
    }
  }
}

// Mock Discord.js components
const createMockMessage = (id, timestamp = Date.now() - 1000 * 60 * 60) => ({
  id,
  createdTimestamp: timestamp,
  delete: jest.fn().mockResolvedValue(true)
});

const mockDatabase = {
  getTrackedIssuesByConnection: jest.fn(),
  removeTrackedIssue: jest.fn().mockResolvedValue(true)
};

const createMockChannel = () => ({
  name: 'test-channel',
  messages: {
    fetch: jest.fn(),
  },
  bulkDelete: jest.fn().mockResolvedValue(true)
});

// Mock the bot class structure
class MockBot {
  constructor() {
    this.db = mockDatabase;
  }

  async performSync() {
    return Promise.resolve();
  }

  // Extract the deletion logic from bot.js for testing
  async clearChannelMessages(validChannels) {
    let totalDeletedCount = 0;
    const channelResults = [];
    
    for (const { channel, connection } of validChannels) {
      let deletedCount = 0;
      const deletedMessageIds = new Set();
      let fetched;
      
      do {
        fetched = await channel.messages.fetch({ limit: 100 });
        if (fetched.size === 0) break;
        
        // Filter messages older than 14 days (Discord limitation)
        const recentMessages = fetched.filter(msg => Date.now() - msg.createdTimestamp < 14 * 24 * 60 * 60 * 1000);
        const oldMessages = fetched.filter(msg => Date.now() - msg.createdTimestamp >= 14 * 24 * 60 * 60 * 1000);
        
        // Bulk delete recent messages
        if (recentMessages.size > 0) {
          try {
            if (recentMessages.size === 1) {
              const msg = recentMessages.first();
              await msg.delete();
              deletedMessageIds.add(msg.id);
              deletedCount += 1;
            } else {
              // Attempt bulk delete
              await channel.bulkDelete(recentMessages);
              // Only track message IDs after successful bulk delete
              recentMessages.forEach(msg => deletedMessageIds.add(msg.id));
              deletedCount += recentMessages.size;
            }
          } catch (error) {
            console.log(`Could not bulk delete messages:`, error.message);
            // Try deleting messages individually if bulk delete fails
            for (const msg of recentMessages.values()) {
              try {
                await msg.delete();
                deletedMessageIds.add(msg.id);
                deletedCount++;
                await new Promise(resolve => setTimeout(resolve, 100));
              } catch (individualError) {
                console.log(`Could not delete message ${msg.id}:`, individualError.message);
              }
            }
          }
        }
        
        // Delete old messages individually
        for (const msg of oldMessages.values()) {
          try {
            await msg.delete();
            deletedMessageIds.add(msg.id);
            deletedCount++;
            // Add small delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (error) {
            console.log(`Could not delete message ${msg.id}:`, error.message);
          }
        }
        
      } while (fetched.size >= 100);
      
      channelResults.push({ channel: channel.name, deletedCount });
      totalDeletedCount += deletedCount;
      
      // Only remove tracked issues for messages that were actually deleted
      const trackedIssues = await this.db.getTrackedIssuesByConnection(connection.id);
      for (const issue of trackedIssues) {
        if (deletedMessageIds.has(issue.discord_message_id)) {
          await this.db.removeTrackedIssue(issue.discord_message_id);
        }
      }
    }
    
    return { totalDeletedCount, channelResults };
  }
}

// Test cases
describe('Channel Deletion Function Tests', () => {
  let bot;
  let mockChannel;
  
  beforeEach(() => {
    bot = new MockBot();
    mockChannel = createMockChannel();
    jest.clearAllMocks();
    
    // Default mock for tracked issues
    mockDatabase.getTrackedIssuesByConnection.mockResolvedValue([
      { discord_message_id: 'msg1', issue_id: 'ISS-1' },
      { discord_message_id: 'msg2', issue_id: 'ISS-2' }
    ]);
  });
  
  test('should successfully delete recent messages with bulk delete', async () => {
    const msg1 = createMockMessage('msg1');
    const msg2 = createMockMessage('msg2');
    const mockMessages = new MockCollection([
      ['msg1', msg1],
      ['msg2', msg2]
    ]);
    
    mockChannel.messages.fetch
      .mockResolvedValueOnce(mockMessages)
      .mockResolvedValueOnce(new MockCollection());
    
    const validChannels = [{ channel: mockChannel, connection: { id: 'conn1' } }];
    const result = await bot.clearChannelMessages(validChannels);
    
    expect(mockChannel.bulkDelete).toHaveBeenCalledWith(mockMessages);
    expect(result.totalDeletedCount).toBe(2);
    expect(mockDatabase.removeTrackedIssue).toHaveBeenCalledTimes(2);
  });
  
  test('should fallback to individual deletion when bulk delete fails', async () => {
    const msg1 = createMockMessage('msg1');
    const msg2 = createMockMessage('msg2');
    const mockMessages = new MockCollection([
      ['msg1', msg1],
      ['msg2', msg2]
    ]);
    
    mockChannel.messages.fetch
      .mockResolvedValueOnce(mockMessages)
      .mockResolvedValueOnce(new MockCollection());
    
    // Make bulk delete fail
    mockChannel.bulkDelete.mockRejectedValueOnce(new Error('Bulk delete failed'));
    
    const validChannels = [{ channel: mockChannel, connection: { id: 'conn1' } }];
    const result = await bot.clearChannelMessages(validChannels);
    
    expect(mockChannel.bulkDelete).toHaveBeenCalled();
    expect(msg1.delete).toHaveBeenCalled();
    expect(msg2.delete).toHaveBeenCalled();
    expect(result.totalDeletedCount).toBe(2);
  });
  
  test('should handle old messages individually', async () => {
    const oldMsg = createMockMessage('old1', Date.now() - 15 * 24 * 60 * 60 * 1000); // 15 days ago
    const oldMessages = new MockCollection([['old1', oldMsg]]);
    
    mockChannel.messages.fetch
      .mockResolvedValueOnce(oldMessages)
      .mockResolvedValueOnce(new MockCollection());
    
    mockDatabase.getTrackedIssuesByConnection.mockResolvedValue([
      { discord_message_id: 'old1', issue_id: 'ISS-1' }
    ]);
    
    const validChannels = [{ channel: mockChannel, connection: { id: 'conn1' } }];
    const result = await bot.clearChannelMessages(validChannels);
    
    expect(oldMsg.delete).toHaveBeenCalled();
    expect(result.totalDeletedCount).toBe(1);
  });
  
  test('should only remove database entries for successfully deleted messages', async () => {
    const failingMessage = createMockMessage('failing-msg', Date.now() - 15 * 24 * 60 * 60 * 1000);
    failingMessage.delete = jest.fn().mockRejectedValue(new Error('Delete failed'));
    
    const successMessage = createMockMessage('success-msg', Date.now() - 15 * 24 * 60 * 60 * 1000);
    
    const mixedMessages = new MockCollection([
      ['failing-msg', failingMessage],
      ['success-msg', successMessage]
    ]);
    
    mockChannel.messages.fetch
      .mockResolvedValueOnce(mixedMessages)
      .mockResolvedValueOnce(new MockCollection());
    
    mockDatabase.getTrackedIssuesByConnection.mockResolvedValue([
      { discord_message_id: 'failing-msg', issue_id: 'ISS-1' },
      { discord_message_id: 'success-msg', issue_id: 'ISS-2' }
    ]);
    
    const validChannels = [{ channel: mockChannel, connection: { id: 'conn1' } }];
    await bot.clearChannelMessages(validChannels);
    
    // Should only remove the successfully deleted message from database
    expect(mockDatabase.removeTrackedIssue).toHaveBeenCalledWith('success-msg');
    expect(mockDatabase.removeTrackedIssue).not.toHaveBeenCalledWith('failing-msg');
  });
  
  test('should handle empty channels gracefully', async () => {
    mockChannel.messages.fetch.mockResolvedValue(new MockCollection());
    
    const validChannels = [{ channel: mockChannel, connection: { id: 'conn1' } }];
    const result = await bot.clearChannelMessages(validChannels);
    
    expect(result.totalDeletedCount).toBe(0);
    expect(mockDatabase.removeTrackedIssue).not.toHaveBeenCalled();
  });
});

console.log('\n🧪 Deletion Function Unit Tests Created!');
console.log('📝 Run tests with: npm test test/deletion.test.js');
console.log('🔍 Tests cover:');
console.log('  ✅ Bulk deletion success');
console.log('  ✅ Bulk deletion failure fallback');
console.log('  ✅ Old message individual deletion');
console.log('  ✅ Database consistency (only remove deleted messages)');
console.log('  ✅ Empty channel handling');