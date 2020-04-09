<div align="center">


# Databless
[![Build Status](https://img.shields.io/travis/com/AckeeCZ/databless/master.svg?style=flat-square)](https://travis-ci.com/AckeeCZ/databless)
[![Coverage](https://img.shields.io/codeclimate/coverage/AckeeCZ/databless.svg?style=flat-square)](https://codeclimate.com/github/AckeeCZ/databless)
[![Maintainability](https://img.shields.io/codeclimate/maintainability/AckeeCZ/databless.svg?style=flat-square)](https://codeclimate.com/github/AckeeCZ/databless)
[![Vulnerabilities](https://img.shields.io/snyk/vulnerabilities/github/AckeeCZ/databless.svg?style=flat-square)](https://snyk.io/test/github/AckeeCZ/databless?targetFile=package.json)
[![Dependency Status](https://img.shields.io/david/AckeeCZ/databless.svg?style=flat-square)](https://david-dm.org/AckeeCZ/databless)
[![Dev Dependency Status](https://img.shields.io/david/dev/AckeeCZ/databless.svg?style=flat-square)](https://david-dm.org/AckeeCZ/databless?type=dev)

<img src="./resources/logo.png" height="170"/>

</div>

# TL;DR manual
- `.create(data, options)`
    - creates new record with given data
    - for optimized batch create use `bulkCreate(data[], options)`
- `.detail(filters, options)`
    - gets a single record based on filters
- `.list(filters, options)`
    - get a list of records based on filters
- `.update(filters, data, options)`
    - updates a record based on filters with given data
- `.delete(filters, options)`
    - deletes records based on filters (if empty, deletes all)

- 🧙 Databless uses Bookshelf for underlying models, and even though Databless should be enough for most of the times, refer Bookshelf documentation for options if necessary, as they are passed to [save](https://bookshelfjs.org/api.html#Model-instance-save)/[fetch](https://bookshelfjs.org/api.html#Model-instance-fetch)/[fetchAll](https://bookshelfjs.org/api.html#Model-instance-fetchAll)/[destroy](https://bookshelfjs.org/api.html#Model-instance-destroy) metods as options.

## Model

- creating a model

    ```js
    const userModel = createModel({
        adapter: () => knex     // Knex getter
        collectionName: 'users' // Table name
        attributes: {           // Record properties
            id: { type: 'number' },
            name: { type: 'string' }
        }
    })
    ```

- attributes
    - define model shape and propety types
    - not defined attributes are filtered before inserting/updating into a database

- custom serialization
    - via `attribute.serialize`

    ```js
    objectStoredAsJson: {
        type: 'string',
        // serialize before inserting into a database
        serialize: x => JSON.stringify(x || null),
        // deserialize from database shape
        // deserialize can also be used to define attribute TS type, e.g. (x: string): MyEnum => x
        deserialize: x => JSON.parse(x),
    }
    ```
- bulk create
    - via `bulkCreate(data[], options)`
    - uses [knex Batch insert](http://knexjs.org/#Utility-BatchInsert)

## Repository

- via `createRepository(model)`
- helper to create CRUD methods bound to a model

## Filtering
- via `filters` (except custom queries)
- exact match

    ```js
    { foo: 'bar' }
    // SELECT ... WHERE foo='bar'
    ```
- where-in

    ```js
    { foo: ['bar', 'baz'] }
    // SELECT ... WHERE foo IN ('bar', 'baz')
    ```
- inequality
    - prefix value with one of `>`, `<`, `>=`, `<=`

    ```js
    { foo: '>2' }
    // SELECT ... WHERE foo > 2
    ```
- searching

    - only left and right wildcards are supported
    ```js
    { foo: '*abc*' }
    // SELECT ... WHERE foo LIKE '%abc%'
    { foo: 'abc*' }
    // SELECT ... WHERE foo LIKE 'abc%'
    { foo: '*abc' }
    // SELECT ... WHERE foo LIKE '%abc'
    ```
- custom queries
    - via `options.qb` parametr
    - `options.qb` handler is passed to Bookshelf `model.query(arguments)`, [see docs](https://bookshelfjs.org/api.html#Model-instance-query)
    - ⚠️  Use with care - any SQL you make is processed, means you can group, join, add columns and change the logic output of completely and the return value and types dont have to match.
    ```js
    { qb: (qb: Knex.QueryBuilder) => qb.whereRaw('...') }
    // SELECT WHERE ...
    ```
## Counting

- via `options.count`
- use `count: true` to get number of filtered records
- filtering applies

## Ordering

- via `options.order`
- default ordering

    ```js
    { order: 'foo' }
    // SELECT ... ORDER BY foo ASC
    ```
- asc ordering

    ```js
    { order: '+foo' }
    // SELECT ... ORDER BY foo ASC
    ```
- desc ordering

    ```js
    { order: '-foo' }
    // SELECT ... ORDER BY foo DESC
    ```

- order by multiple

    ```js
    { order: ['+foo', '-baz'] }
    // SELECT ... ORDER BY foo ASC, baz DESC 
    ```

## Pagination

- via `options.limit` and `options.offset`
- if either of `limit` or `offset` is defined, the other is filled with defaults (defaults: limit=10, offset=0)

    ```js
    { limit: 10, offset: 0 }
    // SELECT ... LIMIT 10 OFFSET 0
    ```


## Relations

### Define a relation

- via attribute of type=`relation`

    ```js
    books: {
        type: 'relation',
        targetModel: () => bookModel, // Databless model getter
        relation: bookshelfRelation.createHasMany(/* ... */),
        // Resolves to Bookshelf relation
        // books() {
        //     return this.hasMany('Book')
        // }
    }
    ```
- refer to Bookshelf docs if you want to take full advantage of configuration [createBelongsTo](https://bookshelfjs.org/api.html#Model-instance-belongsTo)/[createHasMany](https://bookshelfjs.org/api.html#Model-instance-hasMany)/[createBelongsToMany](https://bookshelfjs.org/api.html#Model-instance-belongsToMany)/[createHasOne](https://bookshelfjs.org/api.html#Model-instance-hasOne)

### Populating relation properties
- via `options.withRelated` on `.list`, `.detail`

    ```js
    // Simplified example for brevity

    // Author
    { id, name }
    // Book
    { id, author: { relation: { targetModel: Author /*... */} } }
    
    const book = Books.detail({ id }, { withRelated: ['author' ] })
    // { id, author: Author }
    ```

- invokes original [`withRelated`](https://bookshelfjs.org/api.html#Collection-instance-fetch) on underlying Boookshelf model


### Reflexive relation

- via `targetModel='self'`


## TODO

- [x] Range queries
- [x] Like queries
- [x] Option typing
- [x] Custom relation queries (e.g. in Bookshelf `this.hasMany().where(...)`)
- [x] Custom queries (via options.qb)
- [x] Pagination (limit/offset)
- [ ] Cursor streaming
- [x] Model serialization/deserialization
- [ ] (docs) knex-stringgify doesnt work on sqlite in memory
- [ ] `withRelated` should be optional
- [ ] `withRelated` shouldn't be available for update/create

### Discussion
- [ ] Fetch all (fetchAll option)
- [ ] Default pagination
- [ ] Bug: Knex connection reuse (if a adapter getter fn value changes, its never used)


## License

This project is licensed under [MIT](./LICENSE).
