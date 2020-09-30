const initKnex = require('./initKnex');
const replicaset = require('./replicaset');
const initBookshelf = require('./initBookshelf');

/* eslint-disable global-require */
module.exports = {
    initBookshelf,
    initKnex,
    replicaset,
    registerBookshelfModels: require('./registerBookshelfModels'),
    defaultBookshelfRepository: require('./defaultBookshelfRepository'),
    getKnex: (key = 'default') => initKnex.knexInstances.get(key),
    getBookshelf: (key = 'default') => initBookshelf.bookshelfInstances.get(key),
    composeQb: require('./composeQb'),
};
/* eslint-enable */
