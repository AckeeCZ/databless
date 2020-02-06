const instances = new Map();
const cursorPlugin = require('bookshelf-cursor-pagination').default;

module.exports = (knex, plugins = ['bookshelf-camelcase', 'bookshelf-paranoia', cursorPlugin]) => {
    const bookshelf = require('bookshelf')(knex); // eslint-disable-line global-require
    bookshelf.__rdbGwKey = knex.__rdbGwKey;
    bookshelf.__rdbGwCamelCase = plugins.includes('bookshelf-camelcase');
    plugins.forEach(plugin => {
        bookshelf.plugin(plugin);
    });
    bookshelf.__rdbgwCursorPagination = typeof bookshelf.Collection.prototype.fetchCursorPage === 'function';
    instances.set(bookshelf.__rdbGwKey, bookshelf);
    return bookshelf;
};

module.exports.bookshelfInstances = instances;
