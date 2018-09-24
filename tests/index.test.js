const { initBookshelf, initKnex, defaultBookshelfRepository, getBookshelf } = require('..');

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

init();
const { User } = require('./helpers/models')(getBookshelf());

test('Can create model', () => {
    const users = defaultBookshelfRepository.bind(getBookshelf(), User);
    expect(users).toBeDefined();
});
