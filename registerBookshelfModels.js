const path = require('path');
const fs = require('fs');

// {String} - if is dir, read all files in that dir
module.exports = (bookshelf, input) => {
    if (typeof input === 'string') {
        const lstStat = fs.lstatSync(input);
        if (lstStat.isDirectory()) {
            return fs.readdirSync(input)
                .filter(x => x.endsWith('.js'))
                .forEach(modelModuleName => {
                    require(path.join(input, modelModuleName))(bookshelf); // eslint-disable-line global-require, import/no-dynamic-require
                });
        }
        throw new TypeError('Input must be directory.');
    }
    throw new TypeError('I only accept strings.');
};
