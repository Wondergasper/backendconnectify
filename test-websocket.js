// test-websocket.js
const io = require('socket.io-client');

// Test WebSocket connection
async function testWebSocket() {
  console.log('Testing WebSocket connection...');
  
  // Connect to the server
  const socket = io('http://localhost:5000', {
    auth: {
      token: 'your-jwt-token-here' // Replace with actual token for testing
    },
    transports: ['websocket', 'polling']
  });

  socket.on('connect', () => {
    console.log('✅ Connected to WebSocket server');
    console.log('Socket ID:', socket.id);
    
    // Test sending a message
    setTimeout(() => {
      socket.emit('sendMessage', {
        conversationId: 'test-conversation-id',
        content: 'Hello from WebSocket test!',
        recipientId: 'test-recipient-id'
      });
    }, 1000);
  });

  socket.on('connect_error', (error) => {
    console.error('❌ Connection error:', error);
  });

  socket.on('messageSent', (message) => {
    console.log('Message sent successfully:', message);
  });

  socket.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  // Disconnect after 5 seconds
  setTimeout(() => {
    socket.disconnect();
    console.log('Disconnected from WebSocket server');
  }, 5000);
}

// For development, you can run this to test
// testWebSocket();