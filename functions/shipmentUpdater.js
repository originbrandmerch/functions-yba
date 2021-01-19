const axios = require('axios');
const functions = require('firebase-functions');

const bfsShipBaseURL = 'https://bfsship.rocksolidinternet.com/restapi/v1';
const currentMinBookNumber = 22058441; // updated 1/19/21. should update every month or so. Starting point of results filter
const resultLimit = 1000;
const customerID = functions.config().ecommparcel.customer_id;
const apiKey = functions.config().ecommparcel.api_key;

// eslint-disable-next-line promise/catch-or-return
exports.getShipments = () => {
    axios({
        method: 'get',
        url: `${bfsShipBaseURL}/customers/${customerID}/shipments?minBookNumber=${currentMinBookNumber}&limit=${resultLimit}`,
        headers: {
            Authorization: `Bearer ${apiKey}`,
      }})
        .then(results => console.log(results))
        .catch((err) => console.error(err));
}