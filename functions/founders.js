const axios = require('axios');
const functions = require('firebase-functions');
const { pubsub } = require('./pubsub');

exports.foundersOrder = functions.pubsub.topic('founders_order').onPublish((message) => {
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
