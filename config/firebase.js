// config/firebase.js
const admin = require('firebase-admin');

let db = null;
let fcm = null;

// Initialize Firebase Admin SDK
function initializeFirebase() {
    try {
        // Check if Firebase is already initialized
        if (admin.apps.length > 0) {
            console.log('✅ Firebase already initialized');
            db = admin.firestore();
            fcm = admin.messaging();
            return { db, fcm };
        }

        // Check if we have Firebase credentials
        if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
            console.warn('⚠️  Firebase credentials not found. In-app notifications and FCM disabled.');
            return { db: null, fcm: null };
        }

        // Initialize Firebase with credentials from environment variables
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
            })
        });

        db = admin.firestore();
        fcm = admin.messaging();

        console.log('✅ Firebase Admin SDK initialized successfully');
        return { db, fcm };
    } catch (error) {
        console.error('❌ Failed to initialize Firebase:', error.message);
        return { db: null, fcm: null };
    }
}

// Initialize on module load
const { db: firestoreDb, fcm: firebaseMessaging } = initializeFirebase();

module.exports = {
    db: firestoreDb,
    fcm: firebaseMessaging,
    admin,
    initializeFirebase
};
