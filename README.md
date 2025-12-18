# Connectify Backend Setup

## Prerequisites

1. **Node.js** (v14 or higher)
2. **MongoDB** (either local installation or cloud Atlas)

## MongoDB Setup Options

### Option 1: Local MongoDB (Recommended for development)

1. Install MongoDB Community Server from [MongoDB Download Center](https://www.mongodb.com/try/download/community)
2. Start MongoDB service:
   - On Windows: Make sure MongoDB service is running in Services
   - On macOS/Linux: Run `mongod` in terminal

### Option 2: MongoDB Atlas (For cloud database)

1. Create a free account at [MongoDB Atlas](https://www.mongodb.com/atlas/database)
2. Create a new cluster
3. In the Database Access section, add a new database user
4. In the Network Access section, add your current IP address or add `0.0.0.0/0` to allow all IPs (not recommended for production)
5. Get the connection string and update your `.env` file

## Environment Variables

The project comes with default environment variables in the `.env` file:

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/connectify
JWT_SECRET=your-super-secret-jwt-key-here
NODE_ENV=development
```

## Installation

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm run dev
   ```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update user profile

### Services
- `GET /api/services` - Get all services
- `POST /api/services` - Create a new service
- `GET /api/services/search` - Search services

### Bookings
- `GET /api/bookings` - Get user bookings
- `POST /api/bookings` - Create a booking
- `PUT /api/bookings/:id` - Update booking status

### Other Endpoints
- `GET /api/messages/conversations` - Get user conversations
- `GET /api/availability` - Get provider availability
- `POST /api/verification` - Submit verification
- `GET /api/receipts/:id` - Get booking receipt
- `GET /api/categories` - Get service categories

## Seeding Data

To add sample data to your database:

```bash
node seed.js
# or for extensive data
node seed-extensive.js
```

## Development

The backend is configured to use:
- Express.js for the server framework
- Mongoose for MongoDB object modeling
- JWT for authentication
- BCrypt for password hashing
- CORS for cross-origin resource sharing
- Morgan for HTTP request logging

## Troubleshooting

1. **MongoDB Connection Error**: Make sure MongoDB is running locally or Atlas IP whitelist is configured
2. **Port Already in Use**: Change the PORT in `.env` file to an available port
3. **JWT Secret**: Make sure to use a strong, unique JWT_SECRET in production

## Running the Full Application

To run the complete Connectify application:

1. Start the backend server:
   ```bash
   cd backend
   npm run dev
   ```

2. In a new terminal, start the frontend:
   ```bash
   cd frontend  # or the correct frontend directory
   npm install
   npm run dev
   ```