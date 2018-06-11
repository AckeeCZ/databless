const { defaults, identity, keys, pick, camelCase, pickBy, negate, isArray, isEmpty, forEach } = require('lodash');
const snakelize = require('./utils/snakelize');

const timestampAdder = (hasTimestamps) => (
    hasTimestamps
        ? data => defaults(
            {
                createdAt: new Date(),
                updatedAt: new Date(),
            },
            data
        )
        : identity
);

const extractPagination = (options = {}, defaultLimit = 10, defaultOffset = 0) => {
    if ('fetchAll' in options || 'count' in options) {
        return {
            limit: undefined,
            offset: undefined,
        };
    }
    if (('limit' in options) || ('offset' in options)) {
        return {
            limit: isNaN(parseInt(options.limit, 10)) ? defaultLimit : Number(options.limit),
            offset: isNaN(parseInt(options.offset, 10)) ? defaultOffset : Number(options.offset),
        };
    }
    return {
        limit: defaultLimit,
        offset: defaultOffset,
    };
};

const select = (queryParams = {}, options = {}) =>
    qb => {
        const arrayQueryParams = pickBy(queryParams, isArray);
        const primitiveQueryParams = pickBy(queryParams, negate(isArray));
        qb.where(snakelize(primitiveQueryParams));
        forEach(arrayQueryParams, (value, field) => {
            qb.whereIn(snakelize(field), value);
        });
        if (options.qb) {
            options.qb(qb);
        }
    };

const paginate = (options = {}) => {
    const { limit, offset } = extractPagination(options);
    return qb => {
        if (limit !== undefined) {
            qb.limit(limit);
        }
        if (offset !== undefined) {
            qb.offset(offset);
        }
    };
};

const queryModel = (Model, queryParams, options) => {
    return Model
        .query(qb => {
            select(queryParams, options)(qb);
            paginate(options)(qb);
        });
};

const serializer = (options = {}) =>
    (result) => {
        if (options.raw) {
            return result;
        }
        if (result && result.toJSON) {
            return result.toJSON(options.toJSON);
        }
        return result;
    };

const getModelFields = (() => {
    const colsCache = new Map();
    return (bookshelf, Model) => {
        const tableName = Model.forge().tableName;
        if (!colsCache.has(tableName)) {
            return bookshelf.knex(tableName).columnInfo()
                .then(info => {
                    colsCache.set(tableName, keys(info).map(camelCase));
                    return colsCache.get(tableName);
                });
        }
        // Keep the promise iface, but dont create a microtask
        return { then: fn => fn(colsCache.get(tableName)) };
    };
})();

// ---

const list = (bookshelf, Model, queryParams, options) => {
    return queryModel(Model, queryParams, options)
        .fetchAll(options)
        .then(serializer(options));
};

const detail = (bookshelf, Model, queryParams, options) => {
    return list(bookshelf, Model, queryParams, defaults({ limit: 1, offset: 0 }, options))
        // for raw option support
        .then(results => (results.head ? results.head() : results[0] || null));
};

const bulkCreate = (bookshelf, Model, bulkData = [], options = {}) => {
    const model = Model.forge({});

    return bookshelf.knex.batchInsert(
        model.tableName,
        bulkData
            .map(timestampAdder(model.hasTimestamps === true))
            .map(snakelize)
    );
};

const create = (bookshelf, Model, data = {}, options = {}) => {
    return getModelFields(bookshelf, Model)
        .then(fields =>
            Model.forge().save(pick(data, fields), options)
        )
        .then(serializer(options));
};
create.withDetailBy = (detailQuery) =>
    (bookshelf, Model, data, options) =>
        create(bookshelf, Model, data, options)
            .then(() => detail(bookshelf, Model, detailQuery, options));

create.withDetailById = (bookshelf, Model, data, options) =>
    create(bookshelf, Model, data, options)
        .then(({ id }) => detail(bookshelf, Model, { id: (id || null) }, options));

const destroy = (bookshelf, Model, queryParams, options) => {
    return queryModel(Model, queryParams, options)
        .destroy(defaults({ require: false }, options));
};

const destroyById = (bookshelf, Model, id, options) =>
    destroy(bookshelf, Model, { id: (id || null) }, options);

const detailById = (bookshelf, Model, id, options) =>
    detail(bookshelf, Model, { id: (id || null) }, options);

const update = (bookshelf, Model, queryParams, updateData, options) => {
    return getModelFields(bookshelf, Model)
        .then(fields => Promise.resolve(pick(updateData, fields)))
        .then(filteredData => (
            isEmpty(filteredData)
                ? Promise.resolve(null)
                : queryModel(Model, queryParams, options)
                    .save(snakelize(filteredData), defaults({ method: 'update', require: false }, options))
        ))
        .then(serializer(options));
};

update.withDetailBy = (detailQuery) =>
    (bookshelf, Model, queryParams, updateData, options) =>
        update(bookshelf, Model, queryParams, updateData, options)
            .then(() => detail(bookshelf, Model, detailQuery, options));

const updateById = (bookshelf, Model, id, updateData, options) =>
    update(bookshelf, Model, { id: (id || null) }, updateData, options);

updateById.withDetail = (bookshelf, Model, id, updateData, options) =>
    update.withDetailBy({ id: (id || null) })(bookshelf, Model, { id: (id || null) }, updateData, options);

const bind = (bookshelf, Model) => {
    const boundUpdateById = (id, updateData, options) => updateById(bookshelf, Model, id, updateData, options);
    boundUpdateById.withDetail = (id, updateData, options) => updateById.withDetail(bookshelf, Model, id, updateData, options);
    const boundCreate = (data, options) => create(bookshelf, Model, data, options);
    boundCreate.withDetailById = (data, options) => create.withDetailById(bookshelf, Model, data, options);

    return {
        bulkCreate: (bulkData, options) => bulkCreate(bookshelf, Model, bulkData, options),
        create: boundCreate,
        delete: (queryParams, options) => destroy(bookshelf, Model, queryParams, options),
        destroy: (queryParams, options) => destroy(bookshelf, Model, queryParams, options),
        deleteById: (id, options) => destroyById(bookshelf, Model, id, options),
        destroyById: (id, options) => destroyById(bookshelf, Model, id, options),
        list: (queryParams, options) => list(bookshelf, Model, queryParams, options),
        detail: (queryParams, options) => detail(bookshelf, Model, queryParams, options),
        detailById: (id, options) => detailById(bookshelf, Model, id, options),
        update: (queryParams, data, options) => update(bookshelf, Model, queryParams, data, options),
        updateById: boundUpdateById,
    };
};

module.exports = {
    bulkCreate,
    create,
    delete: destroy,
    deleteById: destroyById,
    list,
    detail,
    detailById,
    update,
    updateById,
    // --
    bind,
};
