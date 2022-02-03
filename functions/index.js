/* eslint-disable import/no-extraneous-dependencies */
const functions = require('firebase-functions');
const express = require('express');
const cors = require('cors');

const router = express();
router.use(cors({ origin: true }));
const { randomPassword } = require('./utils');
const { generatePDF } = require('./nes');
const { deltaOrder, deltaHook } = require('./delta');
const { wooCommerceHook } = require('./woo-commerce');
const { foundersOrder, foundersUpdates } = require('./founders');
const { sanmarSync } = require('./sanmar');
const { ssSync } = require('./ss');
const { inventorySync } = require('./inventory');
const { sendEmailHandler, rankAdvancement } = require('./beachbody');
const { getDecoOrders, translate } = require('./deconet');

// routes
router.post('/sendEmail', sendEmailHandler);
router.post('/hooks/delta', deltaHook);
router.post('/hooks/woo-commerce', wooCommerceHook);

exports.createPassword = functions.https.onRequest((req, res) => {
  res.send(randomPassword(10));
});

exports.translate = functions.https.onRequest(async (req, res) => {
  const results = await translate();
  res.send(results);
});

exports.deltaOrder = deltaOrder;
exports.generatePDF = generatePDF;
exports.foundersOrder = foundersOrder;
exports.rankAdvancement = rankAdvancement;
exports.foundersUpdates = foundersUpdates;
exports.sanmarSync = sanmarSync;
exports.ssSync = ssSync;
exports.inventorySync = inventorySync;
exports.getDecoOrders = getDecoOrders;
exports.router = functions.https.onRequest(router);
