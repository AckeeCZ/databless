const { initBookshelf, initKnex, getKnex, defaultBookshelfRepository, getBookshelf } = require('..');

const init = () => {
    initBookshelf(
        initKnex({ client: 'sqlite3', useNullAsDefault: true, connection: ':memory:' })
    )
}

test('Can init rdbgw', () => {
    init();
    const bookshelf = getBookshelf();
    expect(bookshelf).toBeDefined();
});

test('Can create model', () => {
    const User = getBookshelf().Model.extend({
        tableName: 'user',
    });
    const users = defaultBookshelfRepository.bind(getBookshelf(), User);
    expect(users).toBeDefined();
});
