/* eslint-disable no-restricted-syntax */
const axios = require('axios');
const functions = require('firebase-functions');
const { admin } = require('./admin');
const { pubsub } = require('./pubsub');

exports.inventorySync = functions
  .runWith({ memory: '2GB', timeoutSeconds: 540 })
  .pubsub.schedule('0 2,8,14,20 * * *')
  .timeZone('America/Denver')
  // eslint-disable-next-line consistent-return
  .onRun(async () => {
    try {
      console.log('Syncing inventory with shopify ', Date.now());
      const apiToken = await admin
        .auth()
        .createCustomToken(functions.config().fire.uid)
        .catch((err) => {
          throw err;
        });

      const filter = {
        eager: {
          products: {
            $where: {
              statusId: 1,
            },
            ybaSkus: {
              $where: {
                statusId: 1,
              },
              rawMaterial: {},
            },
          },
        },
      };

      const result = await axios.get(`https://yba-live-v5py6hh2tq-uc.a.run.app/api/stores?pageSize=9999999&filter=${JSON.stringify(filter)}`, {
        headers: {
          apiToken,
        },
      });
      await Promise.all(
        result.data.results.map(async (store) => {
          return Promise.all(
            store.products.map((product) => {
              return Promise.all(
                product.ybaSkus.map((ybaSku) => {
                  if (ybaSku.rawMaterial && ybaSku.inventoryItemId) {
                    console.log(`sending pubsub ${ybaSku}`);
                    return pubsub.topic('inventoryUpdate-prod').publish(
                      Buffer.from(
                        JSON.stringify({
                          ybaSku,
                          storeId: store.id,
                        }),
                      ),
                    );
                  }
                  return null;
                }),
              );
            }),
          );
        }),
      );
    } catch (err) {
      console.error('whole thing', err.message);
      return err;
    }
  });
