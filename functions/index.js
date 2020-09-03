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

const sendEmail = (apiToken, user, password) => {
    const mailGunApiKey = functions.config().mailgun.key;
    const mailAuth = Buffer.from(`api:${mailGunApiKey}`);
    return axios.get(`${url}/getBeachBodyEmail?roleId=${user.roleId}`, {
        headers: {
            apiToken
        }
    })
        .then(results => results.data)
        .then(({subject, template}) => {
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

            return {
                method: 'post',
                url: 'https://api.mailgun.net/v3/mg.beachbodyrecognition.com/messages',
                headers,
                data: formData
            };
        })
        .then((config) => axios(config))
        .then(response => {
            if (response.data && response.data.message && response.data.message.includes('Queued')) {
                return {
                    method: 'post',
                    url: `${url}/updateBeachBodyEmailSent`,
                    data: {
                        userId: user.id,
                        emailSent: 1
                    },
                    headers: {
                        apiToken
                    }
                }
            } else {
                throw new Error(JSON.stringify(response.data))
            }
        })
        .then(config => axios(config))
        .then(results => results.data)
        .catch(err => {
            throw err;
        });
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
                    throw err;
                });

            console.log('Get Users');

            const username = functions.config().beachbody.username;
            const password = functions.config().beachbody.password;
            const auth = Buffer.from(username + ":" + password).toString('base64');

            const beachBodyUsers = [];

            users.forEach(user => {
                if (!user.wordPressId) {
                    const getBeachBodyUser = axios.get(`https://beachbodyrecognition.com/wp-json/wp/v2/users?search=${user.email}`, {
                        headers: {
                            'Authorization': `Basic ${auth.toString('base64')}`
                        }
                    })
                        .then(({data}) => {
                            if (data.length) {
                                user.wordPressId = data[0].id;
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
                                    .then(() => {
                                        return data[0];
                                    })
                                    .catch(err => {
                                        console.error('Update Word Press ID');
                                        console.error(err);
                                        throw err;
                                    });
                            } else {
                                let password = randomPassword(10);
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
                                        console.log(data);
                                        return axios({
                                            method: 'post',
                                            url: `${url}/updateWordPressId`,
                                            data: {
                                                userId: user.id,
                                                wordPressId: data.id
                                            },
                                            headers: {
                                                apiToken
                                            }
                                        })
                                            .then(() => {
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
                                                    .then(() => {
                                                        return sendEmail(apiToken, user, password);
                                                    })
                                                    .catch(err => {
                                                        console.error('set rank updated');
                                                        console.error(err);
                                                        throw err;
                                                    });
                                            })
                                            .catch(err => {
                                                throw err;
                                            });

                                    });
                            }
                        })
                        .catch(err => {
                            console.error('get beachbody users');
                            console.error(err);
                            throw err;
                        });
                    beachBodyUsers.push(getBeachBodyUser);
                }
            });
            const beachBodyUsersPromises = await Promise.all(beachBodyUsers);

            console.log('Done with Word Press Get');

            const updateRank = [];
            users.forEach(user => {
                if (user.wordPressId) {
                    const updateR = axios.post(`https://beachbodyrecognition.com/wp-json/wp/v2/users/${user.wordPressId}`, {
                        roles: [user.postRank]
                    }, {
                        headers: {
                            'Authorization': `Basic ${auth.toString('base64')}`
                        }
                    })
                        .then(() => {
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
                                .then(() => {
                                    return sendEmail(apiToken, user);
                                })
                                .catch(err => {
                                    console.error('send email');
                                    console.error(err);
                                    throw err;
                                });
                        })
                        .catch(err => {
                            throw err;
                        });
                    updateRank.push(updateR);
                }
            });
            const updatedRanks = await Promise.all(updateRank);

            console.log('Done with Word Press Update');

            return {
                beachBodyUsersPromises,
                updatedRanks
            }
        } catch (err) {
            console.error('whole thing');
            console.error(err);
            throw err;
        }
    });
