// Test file to verify upload endpoint is working
// Run this with: node test-upload.js

const fs = require('fs');
const FormData = require('form-data');
const fetch = require('node-fetch');

async function testUpload() {
    try {
        console.log('Testing upload endpoint...');

        // You'll need to replace this with a real JWT token from your login
        const token = 'YOUR_JWT_TOKEN_HERE';

        // Create a test FormData (you need a real image file)
        const form = new FormData();
        // form.append('image', fs.createReadStream('./test-image.jpg'));

        const response = await fetch('http://localhost:5000/api/upload/profile-image', {
            method: 'POST',
            headers: {
                'Cookie': `accessToken=${token}`
            },
            body: form
        });

        const result = await response.json();
        console.log('Result:', result);

        if (response.ok) {
            console.log('✅ Upload successful!');
            console.log('Image URL:', result.data.url);
        } else {
            console.log('❌ Upload failed:', result.error);
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Better: Test the endpoint availability
async function testEndpoint() {
    try {
        const response = await fetch('http://localhost:5000/api/health');
        const data = await response.json();
        console.log('Server health:', data);

        if (data.status === 'OK') {
            console.log('✅ Server is running and database is connected');
        }
    } catch (error) {
        console.error('❌ Server not accessible:', error.message);
    }
}

testEndpoint();
