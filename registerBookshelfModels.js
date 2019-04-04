const path = require('path');
const fs = require('fs');

// {String} - if is dir, read all files in that dir
module.exports = (bookshelf, input) => {
    if (typeof input === 'string') {
        const lstStat = fs.lstatSync(input);
        if (lstStat.isDirectory()) {
            return fs.readdirSync(input)
                .filter(x => x.endsWith('.js') || x.endsWith('.ts'))
                .forEach(modelModuleName => {
                    const bootstrapModel = require(path.join(input, modelModuleName));
                    (bootstrapModel.default || bootstrapModel)(bookshelf);
                });
        }
        throw new TypeError('Input must be directory.');
    }
    throw new TypeError('I only accept strings.');
};
