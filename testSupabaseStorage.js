// Test file - Supabase Storage connection
// Run this with: node testSupabaseStorage.js

require('dotenv').config();
const cloudStorageService = require('./services/cloudStorageService');

async function testSupabaseStorageConnection() {
  console.log('\nTesting Supabase Storage Connection...\n');

  console.log('1. Checking Supabase Storage Configuration:');
  console.log('   SUPABASE_URL:', process.env.SUPABASE_URL ? 'Set' : 'Missing');
  console.log('   SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'Missing');
  console.log('   SUPABASE_STORAGE_BUCKET:', process.env.SUPABASE_STORAGE_BUCKET || 'connectify-uploads');

  const isConfigured = cloudStorageService.isConfigured();
  console.log('\n   Configuration Status:', isConfigured ? 'Valid' : 'Invalid');

  if (!isConfigured) {
    console.log('\nSupabase Storage is not configured properly.');
    return;
  }

  try {
    const testImageBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    console.log('\n2. Testing Upload Capability:');
    const result = await cloudStorageService.uploadFile(
      testImageBuffer,
      'connectify/test',
      {
        public_id: `test_${Date.now()}`,
        mimetype: 'image/png',
        contentType: 'image/png'
      }
    );

    console.log('   Upload successful:', result.secure_url);

    console.log('\n3. Testing Delete Capability:');
    await cloudStorageService.deleteFile(result.public_id);
    console.log('   Delete successful');

    console.log('\nSupabase Storage is working.\n');
  } catch (error) {
    console.error('\nStorage test failed:', error.message);
  }
}

testSupabaseStorageConnection()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });
