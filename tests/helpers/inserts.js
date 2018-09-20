module.exports = function(bookshelf) {
    const knex = bookshelf.knex;

    return Promise.all([
        knex('posts').insert([{
            user_id: 1,
            blog_id: 1,
            name: 'This is a new Title!',
            content: 'Lorem ipsum Labore eu sed sed Excepteur enim laboris deserunt adipisicing dolore culpa aliqua cupidatat proident ea et commodo labore est adipisicing ex amet exercitation est.'
        },{
            user_id: 2,
            blog_id: 2,
            name: 'This is a new Title 2!',
            content: 'Lorem ipsum Veniam ex amet occaecat dolore in pariatur minim est exercitation deserunt Excepteur enim officia occaecat in exercitation aute et ad esse ex in in dolore amet consequat quis sed mollit et id incididunt sint dolore velit officia dolor dolore laboris dolor Duis ea ex quis deserunt anim nisi qui culpa laboris nostrud Duis anim deserunt esse laboris nulla qui in dolor voluptate aute reprehenderit amet ut et non voluptate elit irure mollit dolor consectetur nisi adipisicing commodo et mollit dolore incididunt cupidatat nulla ut irure deserunt non officia laboris fugiat ut pariatur ut non aliqua eiusmod dolor et nostrud minim elit occaecat commodo consectetur cillum elit laboris mollit dolore amet id qui eiusmod nulla elit eiusmod est ad aliqua aute enim ut aliquip ex in Ut nisi sint exercitation est mollit veniam cupidatat adipisicing occaecat dolor irure in aute aliqua ullamco.'
        },{
            user_id: 2,
            blog_id: 1,
            name: 'This is a new Title 3!',
            content: 'Lorem ipsum Reprehenderit esse esse consectetur aliquip magna.'
        },{
            user_id: 3,
            blog_id: 3,
            name: 'This is a new Title 4!',
            content: 'Lorem ipsum Anim sed eu sint aute.'
        },{
            user_id: 4,
            blog_id: 4,
            name: 'This is a new Title 5!',
            content: 'Lorem ipsum Commodo consectetur eu ea amet laborum nulla eiusmod minim veniam ullamco nostrud sed mollit consectetur veniam mollit Excepteur quis cupidatat.'
        }]),

        knex('tags').insert([{
            id: 1,
            name: 'This is a new Title!',
        },{
            id: 2,
            name: 'This is a new Title 2!',
        }]),

        knex('users').insert({id: 1, name: 'root'}),
    ]).catch(function(e) {
        console.log(e.stack);
    });
};