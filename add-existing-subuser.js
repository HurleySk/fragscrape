// Script to add existing sub-user to database
const sqlite3 = require('sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'fragscrape.db');
const db = new sqlite3.Database(dbPath);

const subUser = {
  id: 'spwu4x55h4',
  username: 'spwu4x55h4',
  password: 'lvn4jRgbEmrhR1Q8~3',
  status: 'active',
  traffic_limit: 1073741824, // 1GB in bytes
  traffic_used: 0,
  service_type: 'residential',
  created_at: new Date().toISOString(),
  last_checked: new Date().toISOString()
};

db.run(`
  INSERT OR REPLACE INTO subusers (
    id, username, password, status, traffic_limit, traffic_used,
    service_type, created_at, last_checked
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`, [
  subUser.id,
  subUser.username,
  subUser.password,
  subUser.status,
  subUser.traffic_limit,
  subUser.traffic_used,
  subUser.service_type,
  subUser.created_at,
  subUser.last_checked
], function(err) {
  if (err) {
    console.error('Error adding sub-user:', err);
  } else {
    console.log('Successfully added sub-user to database!');
    console.log('Sub-user details:');
    console.log('  Username:', subUser.username);
    console.log('  Password:', subUser.password);
    console.log('  Status:', subUser.status);
    console.log('  Traffic Limit: 1GB');
  }

  db.close();
});