// test-redis.js
const redisService = require('./services/redisService');

async function testRedis() {
  try {
    console.log('Testing Redis connection...');
    
    await redisService.init();
    
    // Test basic operations
    await redisService.getClient().set('test-key', 'Hello Redis!');
    const value = await redisService.getClient().get('test-key');
    
    console.log('Redis test result:', value);
    
    if (value === 'Hello Redis!') {
      console.log('✅ Redis is working correctly!');
    } else {
      console.log('❌ Redis test failed');
    }
    
    // Clean up
    await redisService.getClient().del('test-key');
    
  } catch (error) {
    console.error('❌ Redis test failed:', error.message);
  }
}

testRedis();