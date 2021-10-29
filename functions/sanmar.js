/* eslint-disable no-restricted-syntax,no-console */
const axios = require('axios');
const functions = require('firebase-functions');
const { admin } = require('./admin');
const { pubsub } = require('./pubsub');

const SANMAR_VENDOR_ID = 415;

exports.sanmarSync = functions
  .runWith({ memory: '2GB', timeoutSeconds: 540 })
  .pubsub.schedule('0 1,7,13,19 * * *')
  .timeZone('America/Denver')
  .onRun(async () => {
    try {
      console.log('Syncing with sanmar ', Date.now());
      const apiToken = await admin
        .auth()
        .createCustomToken(functions.config().fire.uid)
        .catch((err) => {
          throw err;
        });
      const filter = {
        eager: {
          $where: {
            'rawMaterial.externalSkus.vendorId': SANMAR_VENDOR_ID,
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
      const styles = [];

      for (const entry of skuResponse.data) {
        if (!styles.find((style) => entry.rawMaterial.styleId === style.id)) {
          styles.push(entry.rawMaterial.style);
        }
      }

      const sanmarPassword = functions.config().sanmar.password;
      const styleRequests = styles.map((style) => ({
        'shar:wsVersion': '2.0.0',
        'shar:id': 'mckaycourt',
        'shar:password': sanmarPassword,
        'shar:productId': style.style,
        'shar:Filter': {
          'shar:partIdArray': {
            'shar:partId': skuResponse.data
              .filter((d) => d.rawMaterial.styleId === style.id)
              .map((rd) => {
                const eSku = rd.rawMaterial.externalSkus.find((es) => es.vendorId === SANMAR_VENDOR_ID);
                return eSku.sku;
              }),
          },
        },
      }));

      return Promise.all(
        styleRequests.map(async (sRequest) => {
          return pubsub.topic('sanmarUpdate-prod').publish(Buffer.from(JSON.stringify(sRequest)));
        }),
      );
    } catch (err) {
      console.error('whole thing', err.message);
      return err;
    }
  });
