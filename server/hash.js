// Usage: node server/hash.js "your-password"   -> prints the line for your .env file
const c = require('crypto');
const pw = process.argv[2];
if (!pw || pw.length < 8) { console.log('Usage: node server/hash.js "your-password"  (min 8 characters)'); process.exit(1); }
const salt = c.randomBytes(16).toString('hex');
console.log('ADMIN_PASSWORD_HASH=' + salt + ':' + c.scryptSync(pw, salt, 32).toString('hex'));
