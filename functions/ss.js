/* eslint-disable no-restricted-syntax */
const axios = require('axios');
const functions = require('firebase-functions');
const { admin } = require('./admin');
const { pubsub } = require('./pubsub');

exports.ssSync = functions
  .runWith({ memory: '2GB', timeoutSeconds: 540 })
  .pubsub.schedule('0 1 * * *')
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
            'externalSku.vendorId': 405,
          },
          externalSku: {
            style: {},
          },
        },
      };
      const skuResponse = await axios.get(`https://lordrahl.ngrok.io/api/fulfillment/ybaSkus?filter=${JSON.stringify(filter)}`, {
        headers: {
          apiToken,
        },
      });

      return Promise.all(
        skuResponse.map(async (sRequest) => {
          return pubsub.topic('ssUpdate-drew').publish(Buffer.from(JSON.stringify(sRequest)));
        }),
      );
    } catch (err) {
      console.error('whole thing', err.message);
      return err;
    }
  });
