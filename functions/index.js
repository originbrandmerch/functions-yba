const functions = require('firebase-functions');
const express = require('express');
const cors = require('cors');

const router = express();
router.use(cors({ origin: true }));
const { randomPassword } = require('./utils');
const { sendEmailHandler, rankAdvancement } = require('./beachbody');

router.post('/sendEmail', sendEmailHandler);

exports.createPassword = functions.https.onRequest((req, res) => {
  res.send(randomPassword(10));
});
exports.rankAdvancement = rankAdvancement;
exports.router = functions.https.onRequest(router);
