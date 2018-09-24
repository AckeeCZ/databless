module.exports = function(Bookshelf) {

    const Post = Bookshelf.Model.extend({
        tableName: 'posts',

        tags() {
            return this.belongsToMany(Tag);
        }
    });

    const User = Bookshelf.Model.extend({
        tableName: 'users',

        posts() {
            return this.hasMany(Post);
        }
    });

    const Tag = Bookshelf.Model.extend({
        tableName: 'tags',
    });

    return {
        Tag,
        Post,
        User
    }
}