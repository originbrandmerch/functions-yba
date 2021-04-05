const axios = require('axios');
const functions = require('firebase-functions');
const { pubsub } = require('./pubsub');

exports.foundersOrder = functions.pubsub.topic('founders_order').onPublish((message) => {
  const { id, data } = message.json;
  console.log(id, data);
  return axios({
    method: 'POST',
    url: 'https://api-test.teamworkathletic.com/order_items',
    data: data.body,
  })
    .then(async ({ data: responseData }) => {
      console.log(JSON.stringify(responseData));
      const res = await pubsub.topic('founders_response').publish(Buffer.from(JSON.stringify({ id, data })));
      console.log(JSON.stringify({ res, id, data: responseData }));
      return responseData;
    })
    .catch((err) => {
      console.log(JSON.stringify(err.response.data));
      throw err;
    });
});
