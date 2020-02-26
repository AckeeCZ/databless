

<div align="center">

[![Build Status](https://travis-ci.org/AckeeCZ/databless.svg?branch=master)](https://travis-ci.org/AckeeCZ/databless)
[![Known Vulnerabilities](https://snyk.io/test/github/AckeeCZ/databless/badge.svg)](https://snyk.io/test/AckeeCZ/databless)

<img src="./resources/logo.png" height="170"/>
</div>

# Databless

> Relational database gateway

Providing means of communications with relational database.

Based on Ackee's former rdgw `defaultRepository` module.

Features
- (Bookshelf) automatic column cache and attributes stripping on first model use
- (Bookshelf) No default after-update fetch
- (Bookshelf) Optional Id support (not all models have an id attribute)
- (Bookshelf) Automatic offset/limit, page/pageSize option parse
- (Bookshelf) Automatic options-based support for ordering, e.g. `-id` (sort by `id` descending). May be an array of those. Use `+` for ascending.

## Quickstart

### Knex/Bookshelf
```javascript

const {
    // Initializes knex with given options and stores the instance
    // under given key. No key means default instance.
    initKnex,
    // Initializes bookshelf with given options and stores the instance
    // under given key. No key means default instance.
    initBookshelf,
    // To register bookshelf models from a directory
    registerBookshelfModels,
    // Gets an knex instance by given key. No key means the default instance.
    getKnex
    // Gets a bookshelf instance by given key. No key means the default instance.
    getBookshelf
} = require('rdbgw');

const register = (...args) =>
    registerBookshelfModels(
        initBookshelf(
            initKnex(config.bookshelf.knex.init)
        ),
    ...args)

// Read all the models to the bookshelf registry
// All model modules are expected to be a fn (bookshelf): Model
register(`${__dirname}/app/models`);

```

```javascript
const {
    // General repository
    defaultBookshelfRepository,
    getBookshelf,
} = require('rdbgw');

const Availability = getBookshelf().model('Availability');

const availabilities = (({ detail, create, updateById, deleteById, bulkCreate, list }) => (
    {
        list,
        bulkCreate,
        detail,
        create,
        updateById,
        deleteById,
    }
))(defaultBookshelfRepository.bind(getBookshelf(), Availability));

availabilities.create({ from: new Date() });

availabilities.list({});

availabilities.list({}, { qb: (qb) => qb});

/*
defaultBookshelfRepository's API

bulkCreate: (bookshelf, Model, data, options): Promise

create: (bookshelf, Model, data, options): Promise

delete: (bookshelf, Model, query, options): Promise

deleteById: (bookshelf, Model, id, options):
    delete(bookshelf, Model, { id }, options)

list: (bookshelf, Model, query, options): Promise

detail: (bookshelf, Model, query, options):
    list(bookshelf, Model, query, { ...options, limit: 1, offset: 0 })

detailById: (bookshelf, Model, id, options):
    detail(bookshelf, Model, { id }, options)

update: (bookshelf, Model, query, data, options): Promise

updateById: (bookshelf, Model, query, data, options):
    update(bookshelf, Model, { id }, data, options)

--
bind: (bookshelf, Model) returns an object with API of above with bound bookshelf instance and Model.

--
.withDetail* helpers - Returns a function of given call, successful call triggers a detail call with given query, returning this result instead.

create.withDetailBy(query) 
create.withDetailById(id)
update.withDetailBy(query)
update.withDetailById(id)
*/

```


#### Helpers

- `composeQb` - `composeQb(options, qb => ...)` automatic wrap for composing multiple querybuilders in different layers of the application. Prevents qb option overwriting.



