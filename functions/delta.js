const axios = require('axios');
const functions = require('firebase-functions');
const { pubsub } = require('./pubsub');

exports.deltaHook = (req, res) => {
  const { body } = req;
  pubsub
    .topic('delta_hook')
    .publish(Buffer.from(JSON.stringify(body)))
    .then((results) => {
      res.send(results);
    })
    .catch((err) => {
      res.send({ message: err.message });
    });
};

exports.deltaOrder = functions.pubsub.topic('delta_order').onPublish((message) => {
  console.log(typeof message);
  console.log(JSON.stringify(message.json));
  const { id, data } = message.json;
  return axios({
    method: 'POST',
    url: 'https://sandbox.dtg2goportal.com/api/v1/workorders',
    headers: {
      apikey: 'AB909D6C79252F0CCBC65870D1B89B40',
    },
    data: data?.body,
  })
    .then(async ({ data: responseData }) => {
      const res = await pubsub.topic('delta_response').publish(Buffer.from(JSON.stringify({ id, data: responseData })));
      console.log(JSON.stringify({ res, id, data: responseData }));
      return responseData;
    })
    .catch((err) => {
      console.log(JSON.stringify(err.response.data));
      throw err;
    });
});
