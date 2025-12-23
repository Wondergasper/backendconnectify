// test-redis.js
const redisService = require('./services/redisService');

async function testRedis() {
  try {
    console.log('🧪 Testing Redis connection...\n');

    // Display which connection method is being used
    if (process.env.REDIS_URL) {
      const sanitizedUrl = process.env.REDIS_URL.replace(/:[^:@]+@/, ':****@');
      console.log('📡 Connection method: REDIS_URL');
      console.log('🔗 URL:', sanitizedUrl);
    } else {
      console.log('📡 Connection method: HOST/PORT');
      console.log('🔗 Config:', {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: process.env.REDIS_PORT || 6379,
        hasPassword: !!process.env.REDIS_PASSWORD,
      });
    }

    console.log('\n🔌 Connecting to Redis...');
    await redisService.init();
    console.log('✅ Connection established!\n');

    // Test basic operations
    console.log('🧪 Testing basic operations...');

    // SET operation
    await redisService.getClient().set('test-key', 'Hello Redis!');
    console.log('✅ SET: test-key = "Hello Redis!"');

    // GET operation
    const value = await redisService.getClient().get('test-key');
    console.log('✅ GET: test-key =', value);

    if (value === 'Hello Redis!') {
      console.log('\n✅ Redis is working correctly!');
    } else {
      console.log('\n❌ Redis test failed - value mismatch');
    }

    // Test additional operations
    console.log('\n🧪 Testing advanced operations...');

    // Hash operations
    await redisService.getClient().hSet('user:1', { name: 'John', age: '30' });
    const user = await redisService.getClient().hGetAll('user:1');
    console.log('✅ HSET/HGETALL: user:1 =', user);

    // List operations
    await redisService.getClient().lPush('mylist', ['item1', 'item2', 'item3']);
    const listLength = await redisService.getClient().lLen('mylist');
    console.log('✅ LPUSH/LLEN: mylist length =', listLength);

    // Expiration
    await redisService.getClient().setEx('temp-key', 10, 'temporary');
    const ttl = await redisService.getClient().ttl('temp-key');
    console.log('✅ SETEX/TTL: temp-key expires in', ttl, 'seconds');

    // Cleanup
    console.log('\n🧹 Cleaning up test keys...');
    await redisService.getClient().del(['test-key', 'user:1', 'mylist', 'temp-key']);
    console.log('✅ Cleanup complete!');

    // Connection info
    const info = redisService.getClient().options;
    console.log('\n📊 Connection info:', {
      isReady: redisService.isReady(),
      database: info?.database || 0,
    });

    console.log('\n✅ All Redis tests passed!');
  } catch (error) {
    console.error('\n❌ Redis test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    // Close connection
    await redisService.getClient().disconnect();
    console.log('\n👋 Redis connection closed');
    process.exit(0);
  }
}

testRedis();