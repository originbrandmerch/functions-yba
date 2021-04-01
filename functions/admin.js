const admin = require('firebase-admin');
const functions = require('firebase-functions');

admin.initializeApp({
  credential: admin.credential.cert(functions.config().firejson),
  databaseURL: 'https://yba-shirts.firebaseio.com',
});

exports.admin = admin;
