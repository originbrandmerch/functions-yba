/* eslint-disable import/no-extraneous-dependencies */
const functions = require('firebase-functions');
const express = require('express');
const cors = require('cors');

const router = express();
router.use(cors({ origin: true }));
const { randomPassword } = require('./utils');
const { generatePDF } = require('./nes');
const { deltaOrder, deltaHook } = require('./delta');
const { foundersOrder, foundersUpdates, getFoundersUpdates } = require('./founders');
const { sendEmailHandler, rankAdvancement } = require('./beachbody');

// routes
router.post('/sendEmail', sendEmailHandler);
router.post('/hooks/delta', deltaHook);
router.get('/test', getFoundersUpdates);

exports.createPassword = functions.https.onRequest((req, res) => {
  res.send(randomPassword(10));
});

exports.deltaOrder = deltaOrder;
exports.generatePDF = generatePDF;
exports.foundersOrder = foundersOrder;
exports.rankAdvancement = rankAdvancement;
exports.foundersUpdates = foundersUpdates;
exports.router = functions.https.onRequest(router);
