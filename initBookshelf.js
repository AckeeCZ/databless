const instances = new Map();

module.exports = (knex, plugins = ['registry', 'bookshelf-camelcase', 'visibility', 'pagination', 'bookshelf-paranoia']) => {
    const bookshelf = require('bookshelf')(knex); // eslint-disable-line global-require
    bookshelf.__rdbGwKey = knex.__rdbGwKey;
    plugins.forEach(plugin => {
        bookshelf.plugin(plugin);
    });
    instances.set(bookshelf.__rdbGwKey, bookshelf);
    return bookshelf;
};

module.exports.bookshelfInstances = instances;
