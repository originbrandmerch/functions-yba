const functions = require('firebase-functions');
const FormData = require('form-data');
const axios = require('axios');
const admin = require("firebase-admin");
const { getShipments } = require('./shipmentUpdater');

admin.initializeApp({
    credential: admin.credential.cert(functions.config().firejson),
    databaseURL: "https://yba-shirts.firebaseio.com"
});

const randomPassword = length => {
    let chars = "abcdefghijklmnopqrstuvwxyz!@#$%^&*()-+<>ABCDEFGHIJKLMNOP1234567890";
    let pass = "";
    for (let x = 0; x < length; x++) {
        let i = Math.floor(Math.random() * chars.length);
        pass += chars.charAt(i);
    }
    return pass;
};

let url = 'https://yba-shirts.uc.r.appspot.com/api';
let devURL = 'http://localhost:3001/api';

const processUser = async (user, auth, apiToken, emails) => {
    try {
        user.wordPressId = await searchForBeachBodyUser(user, auth, apiToken);
    } catch (err) {
        createError(apiToken, user, err, 'Error searching for user');
        throw err;
    }

    if (!user.wordPressId) {
        let password = randomPassword(10);
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
    return
};

const sendEmail = (apiToken, user, password, emails) => {
    const mailGunApiKey = functions.config().mailgun.key;
    const mailAuth = Buffer.from(`api:${mailGunApiKey}`);
    let {subject, template} = emails.find(email => email.roleId === user.roleId);
    const formData = new FormData();
    formData.append('from', 'Beachbody Recognition <noreply@beachbodyrecognition.com>');
    formData.append('to', user.email);
    formData.append('subject', subject);
    formData.append('template', template);
    formData.append('h:X-Mailgun-Variables', JSON.stringify({
        firstName: user.firstName,
        password,
        email: user.email
    }));

    const headers = formData.getHeaders();
    headers.Authorization = `Basic ${mailAuth.toString('base64')}`;

    return axios({
        method: 'post',
        url: 'https://api.mailgun.net/v3/mg.beachbodyrecognition.com/messages',
        headers,
        data: formData
    })
        .then(response => {
            if (response.data && response.data.message && response.data.message.includes('Queued')) {
                return updateEmailSent(apiToken, user);
            } else {
                console.error('sending email from mail gun');
                console.error(JSON.stringify(response.data));
                return response.data;
            }
        })
        .catch(err => {
            createError(apiToken, user, err, 'get Beach body email');
        });
};

const updateWordPressId = (apiToken, user) => {
    return axios({
        method: 'post',
        url: `${url}/updateWordPressId`,
        data: {
            userId: user.id,
            wordPressId: user.wordPressId
        },
        headers: {
            apiToken
        }
    })
        .catch(err => {
            createError(apiToken, user, err, 'Error updating word press id');
        });
};

const updateEmailSent = (apiToken, user) => {
    return axios({
        method: 'post',
        url: `${url}/updateBeachBodyEmailSent`,
        data: {
            userId: user.id,
            emailSent: 1
        },
        headers: {
            apiToken
        }
    })
        .catch(err => {
            createError(apiToken, user, err, 'Error updating email sent');
        })
};

const updateRankUpdated = (apiToken, user) => {
    return axios({
        method: 'post',
        url: `${url}/setRankUpdated`,
        data: {
            userId: user.id,
            rankUpdated: 1
        },
        headers: {
            apiToken
        }
    })
        .catch(err => {
            createError(apiToken, user, err, 'Error updating rank');
        });
};

const createBeachBodyUser = (user, password, auth, apiToken) => {
    return axios.post(`https://beachbodyrecognition.com/wp-json/wp/v2/users`, {
        username: user.email,
        first_name: user.firstName,
        last_name: user.lastName,
        email: user.email,
        password,
        roles: [user.postRank]
    }, {
        headers: {
            'Authorization': `Basic ${auth.toString('base64')}`
        }
    })
        .then(({data}) => {
            updateRankUpdated(apiToken, user);
            return data.id;
        })
        .catch(err => {
            createError(apiToken, user, err, 'Error creating beach body user');
        });
};

const createError = (apiToken, user, err, ourError) => {
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
            apiToken
        },
        data: {
            insertId: user.id,
            uploadId: user.uploadId,
            errMessage
        }
    })
        .then(() => {
            console.error(errMessage);
            return errMessage;
        })
        .catch(err => {
            console.error('sending error to database didn\'t work: ', err.message);
        })
};

const searchForBeachBodyUser = (user, auth, apiToken) => {
    return axios.get(`https://beachbodyrecognition.com/wp-json/wp/v2/users?search=${user.email}`, {
        headers: {
            'Authorization': `Basic ${auth.toString('base64')}`
        }
    })
        .then(({data}) => {
            if (data.length) {
                return data[0].id;
            } else {
                return null;
            }
        })
        .catch(err => {
            throw err;
        })
};

const updateBeachBodyUser = (user, auth, apiToken, emails) => {
    return axios.post(`https://beachbodyrecognition.com/wp-json/wp/v2/users/${user.wordPressId}`, {
        roles: [user.postRank]
    }, {
        headers: {
            'Authorization': `Basic ${auth.toString('base64')}`
        }
    })
        .then(() => {
            updateRankUpdated(apiToken, user);
            return sendEmail(apiToken, user, null, emails);
        })
        .catch(err => {
            createError(apiToken, user, err, 'Error updating beach body user');
        })
};

const getEmails = (apiToken) => {
    return axios.get(`${url}/getBeachBodyEmails`, {
        headers: {
            apiToken
        }
    })
        .then(results => results.data)
        .catch(err => {
            console.error('Error getting beach body emails', err.message);
        })
};

exports.rankAdvancement = functions.runWith({memory: '2GB', timeoutSeconds: 540}).pubsub.schedule('*/10 8-20 * * *')
    .timeZone('America/Denver')
    .onRun(async context => {
        try {
            console.log('Starting execution', Date.now());
            let apiToken = await admin.auth().createCustomToken(functions.config().fire.uid)
                .catch(err => {
                    throw err;
                });
            let users = await axios.get(`${url}/newRankAdvancements`, {
                headers: {
                    apiToken
                }
            })
                .then(results => results.data)
                .catch(err => {
                    console.error('new rank advancements');
                    console.error(err.message);
                });
            if (users) {
                console.log(`Retrieved ${users.length} users`, Date.now());
            }
            const username = functions.config().beachbody.username;
            const password = functions.config().beachbody.password;
            const auth = Buffer.from(username + ":" + password).toString('base64');
            const emails = await getEmails(apiToken);
            if (emails) {
                console.log(`Retrieved ${emails.length} emails`, Date.now());
            }

            await Promise.allSettled(users.map(user => processUser(user, auth, apiToken, emails)));

            console.log('Returning users', Date.now());
            return users;
        } catch (err) {
            console.error('whole thing', err.message);
            return err;
        }
    });

exports.shipmentsUpdater = functions.runWith({memory: '2GB', timeoutSeconds: 540}).pubsub.schedule('every 10 minutes')
    .timeZone('America/Denver')
    .onRun(async context => {
        try {
            return getShipments();
        } catch (err) {
            console.error('error getting shipments', err.message);
            return err;
        }
    });
