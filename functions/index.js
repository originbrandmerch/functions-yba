const functions = require('firebase-functions');
const FormData = require('form-data');
const axios = require('axios');
const admin = require("firebase-admin");

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

const url = 'https://yba-shirts.uc.r.appspot.com/api';
// const url = 'http://localhost:3001/api';

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
            console.error('get Beach body email');
            console.error(err.message);
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
            console.error('Error updating word press id', err.message);
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
            console.error('Error updating email sent', err.message);
        })
}

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
            console.error('Error updating rank', err.message);
        });
};

const createBeachBodyUser = (user, password, auth) => {
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
            return data.id;
        })
        .catch(err => {
            console.error('Error updating beach body user', err.message);
        });
};

const searchForBeachBodyUser = (user, auth) => {
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
            console.error('Error searching for beach body user', err.message);
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
            return sendEmail(apiToken, user, null, emails);
        })
        .catch(err => {
            console.error('Error creating beach body user', err.message);
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

exports.scheduledFunction = functions.runWith({memory: '2GB', timeoutSeconds: 540}).pubsub.schedule('*/10 8-20 * * *')
    .timeZone('America/Denver')
    .onRun(async context => {
        try {
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

            const username = functions.config().beachbody.username;
            const password = functions.config().beachbody.password;
            const auth = Buffer.from(username + ":" + password).toString('base64');
            const emails = await getEmails(apiToken);

            for (let user of users) {
                // eslint-disable-next-line no-await-in-loop
                user.wordPressId = await searchForBeachBodyUser(user, auth);
                if (!user.wordPressId) {
                    let password = randomPassword(10);
                    // eslint-disable-next-line no-await-in-loop
                    user.wordPressId = await createBeachBodyUser(user, password, auth);
                    // eslint-disable-next-line no-await-in-loop
                    await sendEmail(apiToken, user, password, emails);
                } else {
                    // eslint-disable-next-line no-await-in-loop
                    await updateBeachBodyUser(user, auth, apiToken, emails);
                    // eslint-disable-next-line no-await-in-loop
                    await updateRankUpdated(apiToken, user);
                }
                // eslint-disable-next-line no-await-in-loop
                await updateWordPressId(apiToken, user);
            }
            return users;
        } catch (err) {
            console.error('whole thing', err.message);
        }
    });

exports.test = functions.https.onRequest(async (req, res) => {
    try {
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

        const username = functions.config().beachbody.username;
        const password = functions.config().beachbody.password;
        const auth = Buffer.from(username + ":" + password).toString('base64');
        const emails = await getEmails(apiToken);

        for (let user of users) {
            // eslint-disable-next-line no-await-in-loop
            user.wordPressId = await searchForBeachBodyUser(user, auth);
            if (!user.wordPressId) {
                let password = randomPassword(10);
                // eslint-disable-next-line no-await-in-loop
                user.wordPressId = await createBeachBodyUser(user, password, auth);
                // eslint-disable-next-line no-await-in-loop
                await updateRankUpdated(apiToken, user);
                // eslint-disable-next-line no-await-in-loop
                await sendEmail(apiToken, user, password, emails);
            } else {
                // eslint-disable-next-line no-await-in-loop
                await updateBeachBodyUser(user, auth, apiToken, emails);
                // eslint-disable-next-line no-await-in-loop
                await updateRankUpdated(apiToken, user);
            }
            // eslint-disable-next-line no-await-in-loop
            await updateWordPressId(apiToken, user);
        }
        return users;
    } catch (err) {
        console.error('whole thing', err.message);
    }
});
