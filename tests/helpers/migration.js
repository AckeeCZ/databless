const drops = [
  'users', 'posts', 'tags', 'posts_tags'
];

module.exports = function(Bookshelf) {
  const knex = Bookshelf.knex;

  return Promise.all(drops.map(function(tableName) {
    return knex.schema.dropTableIfExists(tableName);
  }))
  .then(function() {
    return knex.schema.createTable('users', function(table) {
      table.increments('id');
      table.text('name');
    })
    .createTable('posts', function(table) {
      table.increments('id');
      table.integer('user_id');
      table.string('name');
      table.text('content');
    })
    .createTable('tags', function(table) {
      table.increments('id');
      table.integer('post_id');
      table.string('name');
    })
    .createTable('posts_tags', function(table) {
      table.integer('post_id');
      table.integer('tag_id');
    })
  });
};