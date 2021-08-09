/* eslint-disable no-restricted-syntax */
const axios = require('axios');
const functions = require('firebase-functions');
const { admin } = require('./admin');
const { pubsub } = require('./pubsub');

exports.inventorySync = functions
  .runWith({ memory: '2GB', timeoutSeconds: 540 })
  .pubsub.schedule('0 2,8,14,20 * * *')
  .timeZone('America/Denver')
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
          $where: {
            shipThroughShopify: true,
          },
          products: {
            ybaSkus: {
              externalProduct: {},
            },
          },
        },
      };

      const result = await axios.get(`https://lordrahl.ngrok.io/api/stores?filter=${JSON.stringify(filter)}`, {
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
                  if (ybaSku.externalProduct && ybaSku.inventoryItemId) {
                    return pubsub.topic('inventoryUpdate-drew').publish(
                      Buffer.from(
                        JSON.stringify({
                          ybaSku,
                          storeId: store.id,
                        }),
                      ),
                    );
                  }
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
