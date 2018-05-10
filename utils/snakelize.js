const { snakeCase, mapKeys } = require('lodash');

const snakelize = (input) => {
    if (typeof input === 'string') {
        return snakeCase(input);
    }
    if (Array.isArray(input)) {
        return input.map(snakelize);
    }
    if (input && typeof input === 'object') {
        return mapKeys(input, (value, key) => snakelize(key));
    }
    return input;
};

module.exports = snakelize;
