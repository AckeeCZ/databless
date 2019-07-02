const {
    camelCase, cond, constant,
    defaults, forEach, isArray, isEmpty,
    identity, keys, map, negate,
    omit, pick, pickBy,
} = require('lodash');
const { snakelize } = require('desmond');

const timestampAdder = (hasTimestamps) => (
    hasTimestamps
        ? data =>
            defaults(
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
    if (!options.defaultPagination) {
        return {
            limit: isNaN(parseInt(options.limit, 10)) ? undefined : Number(options.limit),
            offset: isNaN(parseInt(options.offset, 10)) ? undefined : Number(options.offset),
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
        let likes = [];
        [queryParams, likes] = select.getWildcards(queryParams, options);
        const arrayQueryParams = pickBy(queryParams, isArray);
        const primitiveQueryParams = pickBy(queryParams, negate(isArray));
        qb.where(snakelize(primitiveQueryParams));
        forEach(arrayQueryParams, (value, field) => {
            qb.whereIn(snakelize(field), value);
        });
        likes.forEach(([field, value]) => {
            qb.where(snakelize(field), 'like', value);
        });
        if (options.qb) {
            options.qb(qb);
        }
    };

select.getWildcards = (() => {
    const rgxpLeftWildcard = /^\*/;
    const rgxpRightWildcard = /\*$/;
    const hasWildcard = (value) => {
        value = String(value);
        return rgxpLeftWildcard.test(value) || rgxpRightWildcard.test(value);
    };
    const sqlizeWildcardToken = (value) => {
        return [
            rgxpLeftWildcard.test(value) && '%' || '',
            value
                .replace(rgxpLeftWildcard, '')
                .replace(rgxpRightWildcard, ''),
            rgxpRightWildcard.test(value) && '%' || '',
        ].join('');
    };
    return (queryParams, options = {}) => {
        let likes = [];
        queryParams = pickBy(queryParams, (value, property) => {
            if (hasWildcard(value)) {
                likes.push([property, sqlizeWildcardToken(value)]);
                return false;
            }
            return true;
        });
        return [queryParams, likes];
    };
})();

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

const count = (options = {}, model) => {
    if (!options.count) return qb => qb;
    if (!model || !model.forge) {
        throw new Error('Missing model for count!');
    }
    const { tableName, idAttribute } = model.forge();

    return qb => {
        qb.countDistinct(`${tableName}.${idAttribute} AS total`);
    };
};

const order = (queryParams, options = {}) => {
    // [[orderDir=asc|desc, orderBy=propName]]
    const orderPairs = order.getOrderPairs(queryParams, options);
    return qb => {
        orderPairs.forEach(([orderDir, orderBy]) => {
            qb.orderBy(snakelize(orderBy), orderDir);
        });
    };
};

order.getOrderPairs = (queryParams, options = {}) => {
    return (
        Array.isArray(options.order)
            ? options.order
            : (options.order ? [options.order] : [])
    )
        .map(String)
        .map(
            cond([
                [
                    token => token.startsWith('-'),
                    token => ['desc', token.slice(1)],
                ],
                [
                    token => token.startsWith('+'),
                    token => ['asc', token.slice(1)],
                ],
                [
                    constant(true),
                    token => ['asc', token],
                ]
            ])
        );
};

const query = (source, queryParams, options) => {
    return source
        .query(qb => {
            select(queryParams, options)(qb);
            count(options, source)(qb);
            paginate(options)(qb);
            order(queryParams, options)(qb);
        });
}

const queryModel = query;

const queryCollection = (Model, queryParams, options) => query(Model.collection(), queryParams, options);

const serializer = (options = {}) =>
    (result) => {
        if (options.raw) {
            return result;
        }
        if (options.count) {
            return result && result.head().get('total') || 0;
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
            return bookshelf
                .knex(tableName)
                .columnInfo()
                .then(info => {
                    colsCache.set(tableName, keys(info).map(bookshelf.__rdbGwCamelCase ? camelCase : identity));
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

const listCursor = (bookshelf, Model, queryParams, options) => {
    return queryCollection(Model, queryParams, options)
        .fetchCursorPage(options)
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

/**
 * Tries to attach simple relations to bookshelf entity
 * 
 * @param {*} result Bookshelf entity
 * @param {*} possibleRelations Object where keys are names of relations and values are IDs to be attached
 * @param {*} options Options passed to bookshelf
 */
const attachSimpleRelations = (result, possibleRelations, options = {}) => {
    return Promise.all(
        map(
            possibleRelations,
            (val, key) =>
                isArray(val) && val.every(Number.isInteger) && result.related(key) && result.related(key).relatedData.type === 'belongsToMany' ? result.related(key).attach(val, options) : Promise.resolve(null)
        )
    )
        .then(() => result);
};

const create = (bookshelf, Model, data = {}, options = {}) => {
    return getModelFields(bookshelf, Model)
        .then(fields =>
            Model.forge()
                .save(pick(data, fields), options)
                .then(result => attachSimpleRelations(result, omit(data, fields), options))
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
    return queryModel(Model, queryParams, defaults({ defaultPagination: false }, options))
        .destroy(defaults({ require: false }, options));
};

const destroyById = (bookshelf, Model, id, options) =>
    destroy(bookshelf, Model, { id: (id || null) }, options);

const detailById = (bookshelf, Model, id, options) =>
    detail(bookshelf, Model, { id: (id || null) }, options);

const update = (bookshelf, Model, queryParams, updateData, options) => {
    return getModelFields(bookshelf, Model)
        .then(fields => {
            const filteredData = pick(updateData, fields);

            return isEmpty(filteredData)
                ? Promise.resolve(null)
                : queryModel(Model, queryParams, defaults({ defaultPagination: false }, options))
                    .save(snakelize(filteredData), defaults({ method: 'update', require: false }, options));
        })
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
        listCursor: bookshelf.__rdbgwCursorPagination ? (queryParams, options) => listCursor(bookshelf, Model, queryParams, options) : undefined,
        detail: (queryParams, options) => detail(bookshelf, Model, queryParams, options),
        detailById: (id, options) => detailById(bookshelf, Model, id, options),
        update: (queryParams, data, options) => update(bookshelf, Model, queryParams, data, options),
        updateById: boundUpdateById,
        getModelFields: () => getModelFields(bookshelf, Model),
    };
};

module.exports = {
    bulkCreate,
    create,
    delete: destroy,
    deleteById: destroyById,
    list,
    listCursor,
    detail,
    detailById,
    update,
    updateById,
    // --
    bind,
    select,
    getModelFields,
};
