const { initBookshelf, initKnex, defaultBookshelfRepository, getBookshelf } = require('..');

const init = () => {
    initBookshelf(initKnex({ client: 'sqlite3', useNullAsDefault: true, connection: ':memory:' }));
};

init();
const bookshelf = getBookshelf();

beforeEach(function() {
    return require('./helpers/migration')(bookshelf).then(function() {
        return require('./helpers/inserts')(bookshelf);
    });
});

test('Automatic relations disabled on one-to-many relation', () => {
    const Post = getBookshelf().Model.extend({
        tableName: 'posts'
    });
    const User = getBookshelf().Model.extend({
        tableName: 'users',

        posts() {
            return this.hasMany(Post);
        }
    });

    const users = defaultBookshelfRepository.bind(getBookshelf(), User);
    return users.create({ id: 15, posts: [1, 2, 3] }).then(() => {
        return new User({ id: 15 }).fetch({ withRelated: ['posts'] }).then(user => {
            const userData = user.toJSON();
            expect(userData.posts).toEqual([]);
        });
    })
});

test('Automatic relations disabled on non-number arrays', () => {
    const Tag = getBookshelf().Model.extend({
        tableName: 'tags',
    });

    const Post = getBookshelf().Model.extend({
        tableName: 'posts',

        tags() {
            return this.belongsToMany(Tag);
        }
    });

    const posts = defaultBookshelfRepository.bind(getBookshelf(), Post);
    return posts.create({ id: 15, tags: ["postName"] }).then(() => {
        return new Post({ id: 15 }).fetch({ withRelated: ['tags'] }).then(post => {
            const postData = post.toJSON();
            expect(postData.tags).toEqual([]);
        });
    })
});

test('Automatic relations work on many-to-many number relations', () => {
    const Tag = getBookshelf().Model.extend({
        tableName: 'tags',
    });

    const Post = getBookshelf().Model.extend({
        tableName: 'posts',

        tags() {
            return this.belongsToMany(Tag);
        }
    });

    const posts = defaultBookshelfRepository.bind(getBookshelf(), Post);
    return posts.create({ id: 15, tags: [1, 2] }).then(() => {
        return new Post({ id: 15 }).fetch({ withRelated: ['tags'] }).then(post => {
            const postData = post.toJSON();
            expect(postData.tags.length).toEqual(2);
        });
    })
});