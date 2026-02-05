const bcrypt = require('bcrypt');

async function hashPassword() {
    try {
        const password = process.argv[2];
        if (!password) {
            console.error('Usage: node simple-hash.js "password"');
            process.exit(1);
        }
        const hash = await bcrypt.hash(password, 10);
        console.log(hash);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

hashPassword();
