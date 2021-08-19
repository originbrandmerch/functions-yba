/* eslint-disable no-restricted-syntax */
const axios = require('axios');
const functions = require('firebase-functions');
const { admin } = require('./admin');
const { pubsub } = require('./pubsub');

const SS_VENDOR_ID = 405;

exports.ssSync = functions
  .runWith({ memory: '2GB', timeoutSeconds: 540 })
  .pubsub.schedule('0 0,6,12,18 * * *')
  .timeZone('America/Denver')
  .onRun(async () => {
    try {
      console.log('Syncing with SS ', Date.now());
      const apiToken = await admin
        .auth()
        .createCustomToken(functions.config().fire.uid)
        .catch((err) => {
          throw err;
        });
      const filter = {
        eager: {
          $where: {
            'rawMaterial.externalSkus.vendorId': SS_VENDOR_ID,
          },
          rawMaterial: {
            style: {},
            externalSkus: {},
          },
        },
      };
      // const skuResponse = await axios.get(`https://lordrahl.ngrok.io/api/fulfillment/ybaSkus?filter=${JSON.stringify(filter)}`, {
      const skuResponse = await axios.get(`https://yba-live-v5py6hh2tq-uc.a.run.app/api/fulfillment/ybaSkus?filter=${JSON.stringify(filter)}`, {
        headers: {
          apiToken,
        },
      });

      return Promise.all(
        skuResponse.data.map(async (sRequest) => {
          console.log(`Sending pubsub push ${sRequest.id}`);
          return pubsub.topic('ssUpdate-prod').publish(Buffer.from(JSON.stringify(sRequest)));
        }),
      );
    } catch (err) {
      console.error('whole thing', err.message);
      return err;
    }
  });
