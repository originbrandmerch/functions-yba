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
  const { id, data } = message.json;
  return axios({
    method: 'POST',
    url: 'https://sandbox.dtg2goportal.com/api/v1/workorders',
    headers: {
      apikey: 'CD3D4D76634395EA7AA2019A3A10D2ED',
    },
    data,
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
