const instances = new Map();

module.exports = (knex, plugins = ['registry', 'bookshelf-camelcase', 'visibility', 'pagination', 'bookshelf-paranoia', 'bookshelf-cursor-pagination']) => {
    const bookshelf = require('bookshelf')(knex); // eslint-disable-line global-require
    bookshelf.__rdbGwKey = knex.__rdbGwKey;
    bookshelf.__rdbGwCamelCase = plugins.includes('bookshelf-camelcase');
    bookshelf.__rdbgwCursorPagination = plugins.includes('bookshelf-cursor-pagination');
    plugins.forEach(plugin => {
        bookshelf.plugin(plugin);
    });
    instances.set(bookshelf.__rdbGwKey, bookshelf);
    return bookshelf;
};

module.exports.bookshelfInstances = instances;
