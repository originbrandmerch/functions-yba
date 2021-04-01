const functions = require('firebase-functions');
const express = require('express');
const cors = require('cors');

const router = express();
router.use(cors({ origin: true }));
const { randomPassword } = require('./utils');
const { generatePDF } = require('./nes');
const { helloPubSub, deltaHook } = require('./delta');
const { sendEmailHandler, rankAdvancement } = require('./beachbody');

// routes
router.post('/sendEmail', sendEmailHandler);
router.post('/hooks/delta', deltaHook);

exports.createPassword = functions.https.onRequest((req, res) => {
  res.send(randomPassword(10));
});
exports.generatePDF = generatePDF;
exports.rankAdvancement = rankAdvancement;
exports.helloPubSub = helloPubSub;
exports.router = functions.https.onRequest(router);
