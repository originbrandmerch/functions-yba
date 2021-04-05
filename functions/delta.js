/* eslint-disable no-console */
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
  const { jobId, jobTypeId, body } = message.json;
  console.log(typeof body);
  console.log(body);
  console.log(typeof body.data);
  console.log(body.data);
  const jsonBody = JSON.parse(body);
  return axios({
    method: 'POST',
    url: 'https://sandbox.dtg2goportal.com/api/v1/workorders',
    headers: {
      apikey: 'AB909D6C79252F0CCBC65870D1B89B40',
    },
    data: jsonBody.data,
  })
    .then(async ({ data: responseData }) => {
      const res = await pubsub.topic('delta_response').publish(Buffer.from(JSON.stringify({ jobId, jobTypeId, data: responseData })));
      console.log({ res, jobId, data: responseData });
      return responseData;
    })
    .catch((err) => {
      console.log(err.response.data);
      throw err;
    });
});
