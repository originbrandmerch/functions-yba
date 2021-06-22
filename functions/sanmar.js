/* eslint-disable no-restricted-syntax */
const axios = require('axios');
const functions = require('firebase-functions');
const { admin } = require('./admin');
const { pubsub } = require('./pubsub');

exports.sanmarSync = functions
  .runWith({ memory: '2GB', timeoutSeconds: 540 })
  .pubsub.schedule('0 1 * * *')
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
            'externalSku.vendorId': 415,
          },
          externalSku: {
            style: {},
          },
        },
      };
      const skuResponse = await axios.get(`https://yba-live-v5py6hh2tq-uc.a.run.app/api/fulfillment/ybaSkus?filter=${JSON.stringify(filter)}`, {
        headers: {
          apiToken,
        },
      });
      console.log(skuResponse);
      const styles = [];

      for (const entry of skuResponse.data) {
        if (!styles.find((style) => entry.externalSku.styleId === style.id)) {
          styles.push(entry.externalSku.style);
        }
      }

      console.log(styles);

      const styleRequests = styles.map((style) => ({
        'shar:wsVersion': '2.0.0',
        'shar:id': 'mckaycourt',
        'shar:password': 12341234,
        'shar:productId': style.style,
        'shar:Filter': {
          'shar:partIdArray': {
            'shar:partId': skuResponse.data
              .filter((d) => d.externalSku.styleId === style.id)
              .map((rd) => {
                return rd.externalSku.sku;
              }),
          },
        },
      }));

      console.log(styleRequests);

      return Promise.all(
        styleRequests.map(async (sRequest) => {
          return pubsub.topic('sanmarUpdate').publish(Buffer.from(JSON.stringify(sRequest)));
        }),
      );
    } catch (err) {
      console.error('whole thing', err.message);
      return err;
    }
  });
