/* eslint no-shadow:0 */
/* eslint no-unused-vars:0 */
const { createLogger, config } = require('winston');

const { LoggingWinston } = require('@google-cloud/logging-winston');

const loggingWinston = new LoggingWinston({
  labels: {
    name: 'MSAS-Functions',
  },
});
const transports = [loggingWinston];
const logger = createLogger({
  levels: config.syslog.levels,
  transports,
});

module.exports = logger;
