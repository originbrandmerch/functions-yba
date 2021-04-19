const axios = require('axios');
const functions = require('firebase-functions');
const { pubsub } = require('./pubsub');
// const { url } = require('./constants');
const { admin } = require('./admin');

exports.foundersOrder = functions.pubsub.topic('founders_order').onPublish(async (message) => {
  const { jobId, jobTypeId, body } = message.json;
  const jsonBody = JSON.parse(body);
  return axios({
    method: 'POST',
    url: 'https://api-test.teamworkathletic.com/order_items',
    data: jsonBody,
  })
    .then(async ({ data: responseData }) => {
      console.log(JSON.stringify(responseData));
      console.log(responseData);
      const res = await pubsub.topic('founders_response').publish(Buffer.from(JSON.stringify({ jobId, jobTypeId, body: responseData })));
      console.log(JSON.stringify({ res, jobId, jobTypeId, body: responseData }));
      return responseData;
    })
    .catch((err) => {
      console.log(JSON.stringify(err.response.data));
      throw err;
    });
});

exports.foundersUpdates = functions
  .runWith({ memory: '2GB', timeoutSeconds: 540 })
  .pubsub.schedule('0 8-20 * * *')
  .timeZone('America/Denver')
  .onRun(async () => {
    try {
      console.log('Getting founders updates', Date.now());
      const apiToken = await admin
        .auth()
        .createCustomToken(functions.config().fire.uid)
        .catch((err) => {
          throw err;
        });
      const filter = {
        eager: {
          $where: {
            'lineItems.ybaSku.externalSku.companyId': 2,
            'lineItems.statusId': {
              $in: [3, 11, 4],
            },
          },
        },
      };
      // TODO change this after we're pretty sure it works
      const unfulfilledFoundersOrdersResponse = await axios.get(
        `https://yba-dev-v5py6hh2tq-uc.a.run.app/api/fulfillment/orders?filter=${JSON.stringify(filter)}`,
        {
          headers: {
            apiToken,
          },
        },
      );
      console.log(unfulfilledFoundersOrdersResponse);
      const unfulfilledFoundersOrders = unfulfilledFoundersOrdersResponse.data.results;
      console.log(unfulfilledFoundersOrders);

      return Promise.all(
        unfulfilledFoundersOrders.map(async (order) => {
          console.log(order);
          return pubsub.topic('foundersUpdates').publish(Buffer.from(JSON.stringify(order)));
        }),
      );
    } catch (err) {
      console.error('whole thing', err.message);
      return err;
    }
  });
