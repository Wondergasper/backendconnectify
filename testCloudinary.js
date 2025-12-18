// TEST FILE - Test Cloudinary Connection
// Run this with: node testCloudinary.js

require('dotenv').config();
const cloudStorageService = require('./services/cloudStorageService');

async function testCloudinaryConnection() {
    console.log('\n🔍 Testing Cloudinary Connection...\n');

    // Check if credentials are configured
    console.log('1. Checking Cloudinary Credentials:');
    console.log('   Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME ? '✅ Set' : '❌ Missing');
    console.log('   API Key:', process.env.CLOUDINARY_API_KEY ? '✅ Set' : '❌ Missing');
    console.log('   API Secret:', process.env.CLOUDINARY_API_SECRET ? '✅ Set' : '❌ Missing');

    const isConfigured = cloudStorageService.isConfigured();
    console.log('\n   Configuration Status:', isConfigured ? '✅ Valid' : '❌ Invalid');

    if (!isConfigured) {
        console.log('\n❌ Cloudinary is NOT configured properly!');
        console.log('\nPlease check your .env file has:');
        console.log('CLOUDINARY_CLOUD_NAME=your_cloud_name');
        console.log('CLOUDINARY_API_KEY=your_api_key');
        console.log('CLOUDINARY_API_SECRET=your_api_secret');
        return;
    }

    // Test upload with a small test image
    console.log('\n2. Testing Upload Capability:');
    try {
        // Create a tiny test image buffer (1x1 pixel PNG)
        const testImageBuffer = Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            'base64'
        );

        console.log('   Uploading test image...');
        const result = await cloudStorageService.uploadFile(
            testImageBuffer,
            'connectify/test',
            { public_id: `test_${Date.now()}` }
        );

        console.log('   ✅ Upload successful!');
        console.log('   URL:', result.secure_url);
        console.log('   Public ID:', result.public_id);

        // Test deletion
        console.log('\n3. Testing Delete Capability:');
        console.log('   Deleting test image...');
        await cloudStorageService.deleteFile(result.public_id);
        console.log('   ✅ Delete successful!');

        console.log('\n✅ Cloudinary is fully connected and working!\n');
        console.log('📊 Summary:');
        console.log('   • Configuration: ✅ Valid');
        console.log('   • Upload: ✅ Working');
        console.log('   • Delete: ✅ Working');
        console.log('   • Your uploads will be stored at: connectify/ folder');
        console.log('\n🎉 You can now upload images from your app!\n');

    } catch (error) {
        console.log('   ❌ Upload failed!');
        console.error('   Error:', error.message);
        console.log('\n❌ Cloudinary connection has issues!');
        console.log('\nPossible issues:');
        console.log('1. Invalid API credentials');
        console.log('2. Network connectivity problem');
        console.log('3. Cloudinary account not active');
        console.log('\nPlease verify your Cloudinary account at: https://cloudinary.com');
    }
}

// Run the test
testCloudinaryConnection().then(() => {
    process.exit(0);
}).catch((error) => {
    console.error('\n❌ Test failed with error:', error);
    process.exit(1);
});
