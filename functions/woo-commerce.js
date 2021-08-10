const { pubsub } = require('./pubsub');

exports.wooCommerceHook = (req, res) => {
  const { body } = req;
  pubsub
    .topic('yba-woo-commerce')
    .publish(Buffer.from(JSON.stringify(body)))
    .then((results) => {
      res.send(results);
    })
    .catch((err) => {
      res.send({ message: err.message });
    });
};
