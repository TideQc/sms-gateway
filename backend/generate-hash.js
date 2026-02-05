// Simple Node script to generate a bcrypt hash
// Run with: node generate-hash.js "yourpassword"

const crypto = require('crypto');

const password = process.argv[2];
if (!password) {
    console.error('Usage: node generate-hash.js "password"');
    process.exit(1);
}

// Use a simple SHA256 hash as a workaround
// In production, you should use bcrypt properly
const hash = crypto.createHash('sha256').update(password).digest('hex');
console.log('SHA256 Hash: ' + hash);
console.log('\nWARNING: This is a temporary solution. For production:');
console.log('1. Use bcrypt properly by running the server with npm start');
console.log('2. Or use an online bcrypt generator');
