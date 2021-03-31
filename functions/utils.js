/* eslint-disable no-console */
const axios = require('axios');
const { url } = require('./constants');

exports.randomPassword = (length) => {
  const chars = 'abcdefghijklmnopqrstuvwxyz!@#$%^&*()-+<>ABCDEFGHIJKLMNOP1234567890';
  let pass = '';
  for (let x = 0; x < length; x += 1) {
    const i = Math.floor(Math.random() * chars.length);
    pass += chars.charAt(i);
  }
  return pass;
};

exports.createError = (apiToken, user, err, ourError) => {
  let error;
  if (err.response) {
    if (err.response.data && err.response.data.message) {
      error = err.response.data.message;
    } else {
      error = JSON.stringify(err);
    }
  } else {
    error = JSON.stringify(err);
  }
  const errMessage = `${ourError}: ${error}`;
  axios({
    method: 'post',
    url: `${url}/createError`,
    headers: {
      apiToken,
    },
    data: {
      insertId: user.id,
      uploadId: user.uploadId,
      errMessage,
    },
  })
    .then(() => {
      console.error(errMessage);
      return errMessage;
    })
    .catch((sendErr) => {
      console.error("sending error to database didn't work: ", sendErr.message);
    });
};
