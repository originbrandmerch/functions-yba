/* eslint-disable no-console */
/* eslint-disable no-param-reassign */
const axios = require('axios');
const functions = require('firebase-functions');
const FormData = require('form-data');
const { randomPassword, createError } = require('./utils');
const { url } = require('./constants');
const admin = require('./admin');

const updateEmailSent = (apiToken, user) => {
  return axios({
    method: 'post',
    url: `${url}/updateBeachBodyEmailSent`,
    data: {
      userId: user.id,
      emailSent: 1,
    },
    headers: {
      apiToken,
    },
  }).catch((err) => {
    createError(apiToken, user, err, 'Error updating email sent');
  });
};

const sendEmail = (apiToken, user, password, emails) => {
  const mailGunApiKey = functions.config().mailgun.key;
  const mailAuth = Buffer.from(`api:${mailGunApiKey}`);
  const { subject, template } = emails.find((email) => email.roleId === user.roleId);
  const formData = new FormData();
  formData.append('from', 'Beachbody Recognition <noreply@beachbodyrecognition.com>');
  formData.append('to', user.email);
  formData.append('subject', subject);
  formData.append('template', template);
  formData.append(
    'h:X-Mailgun-Variables',
    JSON.stringify({
      firstName: user.firstName,
      password,
      email: user.email,
    }),
  );

  const headers = formData.getHeaders();
  headers.Authorization = `Basic ${mailAuth.toString('base64')}`;

  return axios({
    method: 'post',
    url: 'https://api.mailgun.net/v3/mg.beachbodyrecognition.com/messages',
    headers,
    data: formData,
  })
    .then((response) => {
      if (response.data && response.data.message && response.data.message.includes('Queued')) {
        return updateEmailSent(apiToken, user);
      }
      console.error('sending email from mail gun');
      console.error(JSON.stringify(response.data));
      return response.data;
    })
    .catch((err) => {
      createError(apiToken, user, err, 'get Beach body email');
    });
};

const updateRankUpdated = (apiToken, user) => {
  return axios({
    method: 'post',
    url: `${url}/setRankUpdated`,
    data: {
      userId: user.id,
      rankUpdated: 1,
    },
    headers: {
      apiToken,
    },
  }).catch((err) => {
    createError(apiToken, user, err, 'Error updating rank');
  });
};

const createBeachBodyUser = (user, password, auth, apiToken) => {
  return axios
    .post(
      `https://beachbodyrecognition.com/wp-json/wp/v2/users`,
      {
        username: user.email,
        first_name: user.firstName,
        last_name: user.lastName,
        email: user.email,
        password,
        roles: [user.postRank],
      },
      {
        headers: {
          Authorization: `Basic ${auth.toString('base64')}`,
        },
      },
    )
    .then(({ data }) => {
      updateRankUpdated(apiToken, user);
      return data.id;
    })
    .catch((err) => {
      createError(apiToken, user, err, 'Error creating beach body user');
    });
};

const searchForBeachBodyUser = (user, auth) => {
  return axios
    .get(`https://beachbodyrecognition.com/wp-json/wp/v2/users?search=${user.email}`, {
      headers: {
        Authorization: `Basic ${auth.toString('base64')}`,
      },
    })
    .then(({ data }) => {
      if (data.length) {
        return data[0].id;
      }
      return null;
    })
    .catch((err) => {
      throw err;
    });
};

const updateBeachBodyUser = (user, auth, apiToken, emails) => {
  return axios
    .post(
      `https://beachbodyrecognition.com/wp-json/wp/v2/users/${user.wordPressId}`,
      {
        roles: [user.postRank],
      },
      {
        headers: {
          Authorization: `Basic ${auth.toString('base64')}`,
        },
      },
    )
    .then(() => {
      updateRankUpdated(apiToken, user);
      return sendEmail(apiToken, user, null, emails);
    })
    .catch((err) => {
      createError(apiToken, user, err, 'Error updating beach body user');
    });
};

const updateWordPressId = (apiToken, user) => {
  return axios({
    method: 'post',
    url: `${url}/updateWordPressId`,
    data: {
      userId: user.id,
      wordPressId: user.wordPressId,
    },
    headers: {
      apiToken,
    },
  }).catch((err) => {
    createError(apiToken, user, err, 'Error updating word press id');
  });
};

const processUser = async (user, auth, apiToken, emails) => {
  try {
    user.wordPressId = await searchForBeachBodyUser(user, auth);
  } catch (err) {
    createError(apiToken, user, err, 'Error searching for user');
    throw err;
  }

  if (!user.wordPressId) {
    const password = randomPassword(10);
    user.wordPressId = await createBeachBodyUser(user, password, auth, apiToken);
    if (user.wordPressId) {
      await sendEmail(apiToken, user, password, emails);
    }
  } else {
    await updateBeachBodyUser(user, auth, apiToken, emails);
  }
  if (user.wordPressId) {
    await updateWordPressId(apiToken, user);
  }
};

const getEmails = (apiToken) => {
  return axios
    .get(`${url}/getBeachBodyEmails`, {
      headers: {
        apiToken,
      },
    })
    .then((results) => results.data)
    .catch((err) => {
      console.error('Error getting beach body emails', err.message);
    });
};

exports.sendEmailHandler = ({ body }, res) => {
  const { user, password } = body;
  const mailGunApiKey = functions.config().mailgun.key;
  const mailAuth = Buffer.from(`api:${mailGunApiKey}`);
  const emails = [
    {
      subject: 'Congratulations on your new rank advancement to 1 Star Diamond Coach!',
      template: 'one-star-diamond-coach',
      roleId: 4,
    },
    {
      subject: 'Congratulations on your new rank advancement to Emerald Coach!',
      template: 'emerald-coach',
      roleId: 1,
    },
    { subject: 'Congratulations on your new rank advancement to Ruby Coach!', template: 'ruby-coach', roleId: 2 },
    {
      subject: 'Congratulations on your new rank advancement to Diamond Coach!',
      template: 'diamond-coach',
      roleId: 3,
    },
    {
      subject: 'Congratulations on your new rank advancement to 2 Star Diamond Coach!',
      template: 'two-star-diamond-coach',
      roleId: 5,
    },
    {
      subject: 'Congratulations on your new rank advancement to 3 Star Diamond Coach!',
      template: 'three-star-diamond-coach',
      roleId: 6,
    },
    {
      subject: 'Congratulations on your new rank advancement to 4 Star Diamond Coach!',
      template: 'four-star-diamond-coach',
      roleId: 7,
    },
    {
      subject: 'Congratulations on your new rank advancement to 5 Star Diamond Coach!',
      template: 'five-star-diamond-coach',
      roleId: 8,
    },
    {
      subject: 'Congratulations on your new rank advancement to 6 Star Diamond Coach!',
      template: 'six-star-diamond-coach',
      roleId: 9,
    },
    {
      subject: 'Congratulations on your new rank advancement to 7 Star Diamond Coach!',
      template: 'seven-star-diamond-coach',
      roleId: 10,
    },
    {
      subject: 'Congratulations on your new rank advancement to 8 Star Diamond Coach!',
      template: 'eight-star-diamond-coach',
      roleId: 11,
    },
    {
      subject: 'Congratulations on your new rank advancement to 9 Star Diamond Coach!',
      template: 'nine-star-diamond-coach',
      roleId: 12,
    },
    {
      subject: 'Congratulations on your new rank advancement to 10 Star Diamond Coach!',
      template: 'ten-star-diamond-coach',
      roleId: 13,
    },
    {
      subject: 'Congratulations on your new rank advancement to 11 Star Diamond Coach!',
      template: 'eleven-star-diamond-coach',
      roleId: 14,
    },
    {
      subject: 'Congratulations on your new rank advancement to 12 Star Diamond Coach!',
      template: 'twelve-star-diamond-coach',
      roleId: 15,
    },
    {
      subject: 'Congratulations on your new rank advancement to 13 Star Diamond Coach!',
      template: 'thirteen-star-diamond-coach',
      roleId: 16,
    },
    {
      subject: 'Congratulations on your new rank advancement to 14 Star Diamond Coach!',
      template: 'fourteen-star-diamond-coach',
      roleId: 17,
    },
    {
      subject: 'Congratulations on your new rank advancement to 15 Star Diamond Coach!',
      template: 'fifteen-star-diamond-coach',
      roleId: 18,
    },
  ];

  const { subject, template } = emails.find((email) => email.roleId === user.roleId);
  const formData = new FormData();
  formData.append('from', 'Beachbody Recognition <noreply@beachbodyrecognition.com>');
  formData.append('to', user.email);
  formData.append('subject', subject);
  formData.append('template', template);
  formData.append(
    'h:X-Mailgun-Variables',
    JSON.stringify({
      firstName: user.firstName,
      password,
      email: user.email,
    }),
  );

  const headers = formData.getHeaders();
  headers.Authorization = `Basic ${mailAuth.toString('base64')}`;

  axios({
    method: 'post',
    url: 'https://api.mailgun.net/v3/mg.beachbodyrecognition.com/messages',
    headers,
    data: formData,
  })
    .then((response) => {
      if (response.data && response.data.message && response.data.message.includes('Queued')) {
        res.send(response.data);
      } else {
        res.status(500).send(response.data);
      }
    })
    .catch((err) => {
      res.status(500).send(err);
    });
};

exports.rankAdvancement = functions
  .runWith({ memory: '2GB', timeoutSeconds: 540 })
  .pubsub.schedule('*/10 8-20 * * *')
  .timeZone('America/Denver')
  .onRun(async () => {
    try {
      console.log('Starting execution', Date.now());
      const apiToken = await admin
        .auth()
        .createCustomToken(functions.config().fire.uid)
        .catch((err) => {
          throw err;
        });
      const users = await axios
        .get(`${url}/newRankAdvancements`, {
          headers: {
            apiToken,
          },
        })
        .then((results) => results.data)
        .catch((err) => {
          console.error('new rank advancements');
          console.error(err.message);
        });
      if (users) {
        console.log(`Retrieved ${users.length} users`, Date.now());
      }
      const { username } = functions.config().beachbody;
      const { password } = functions.config().beachbody;
      const auth = Buffer.from(`${username}:${password}`).toString('base64');
      const emails = await getEmails(apiToken);
      if (emails) {
        console.log(`Retrieved ${emails.length} emails`, Date.now());
      }

      await Promise.allSettled(users.map((user) => processUser(user, auth, apiToken, emails)));

      console.log('Returning users', Date.now());
      return users;
    } catch (err) {
      console.error('whole thing', err.message);
      return err;
    }
  });
