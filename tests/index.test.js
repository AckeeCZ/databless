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
const { User, Post } = require('./helpers/models')(getBookshelf());

test('Can create model', () => {
    const users = defaultBookshelfRepository.bind(getBookshelf(), User);
    expect(users).toBeDefined();
});

test('Can get model fields', () => {
    const bookshelf = getBookshelf();
    return require('./helpers/migration')(bookshelf).then(function () {
        return require('./helpers/inserts')(bookshelf).then(() => {

            const users = defaultBookshelfRepository.bind(getBookshelf(), User);
            const posts = defaultBookshelfRepository.bind(getBookshelf(), Post);
            return Promise.all([
                users.getModelFields(),
                posts.getModelFields()
            ]).then(fields => {
                const userFields = fields[0];
                const postFields = fields[1];
                expect(userFields).toIncludeAllMembers(['id', 'name']);
                expect(postFields).toIncludeAllMembers(['id', 'userId', 'name', 'content']);
            })
        })
    });
});
