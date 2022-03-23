const { pubsub } = require('./pubsub');

exports.wooCommerceHook = (req, res) => {
  const { body } = req;
  pubsub
    .topic('crons-prod')
    .publish(Buffer.from(JSON.stringify({ type: 'wooCommerce', data: body })))
    .then((results) => {
      res.send(results);
    })
    .catch((err) => {
      res.send({ message: err.message });
    });
};
