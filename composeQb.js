const { defaults, noop } = require('lodash');

const composeQb = (options = {}, decorateQb) => {
    const originalQb = options.qb || noop;
    return defaults(
        {
            qb: (qb) => {
                originalQb(qb);
                decorateQb(qb);
            },
        },
        options
    );
};

module.exports = composeQb;
