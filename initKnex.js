
const instances = new Map();

module.exports = (config, key = 'default') => {
    const knex = require('knex')(config); // eslint-disable-line global-require
    knex.__rdbGwKey = key;
    instances.set(key, knex);
    return instances.get(key);
};

module.exports.knexInstances = instances;
