import * as Bookshelf from 'bookshelf';
import Knex, { QueryBuilder } from 'knex';
import { forEach, isArray, isObject, isString, negate, omit, pickBy, mapKeys, keys, pick, entries } from 'lodash';
import { ModelOptions, AttributeRelation, Relation, WildcardQuery, wildcards as repositoryWildcards, rangeQueries as repositoryRangeQueries, RangeQuery, Model, CustomFilters } from './repository';

type BookshelfRelationQuery = (relation: Bookshelf.Collection<any>) => Bookshelf.Collection<any>;

export type QbOption = (qb: QueryBuilder) => any;
export interface BookshelfRelationAnyType {
    query?: BookshelfRelationQuery;
}
export interface BookshelfRelationHasOne extends BookshelfRelationAnyType {
    // Target (from Attribute). Constructor of Model targeted by join. Can be a string specifying a previously registered model with Bookshelf#model.
    /** Foreign key in the Target model. By default the foreign key is assumed to be the singular form of this model's tableName followed by _id / _{{idAttribute}}. */
    foreignKey?: string
    /** Column in this model's table which foreignKey references, if other than this model's id / idAttribute. */
    foreignKeyTarget?: string
}

export interface BookshelfRelationHasMany extends BookshelfRelationAnyType  {
    // Target (from Attribute). Constructor of Model targeted by join. Can be a string specifying a previously registered model with Bookshelf#model.
    /** ForeignKey in the Target model. By default, the foreign key is assumed to be the singular form of this model's tableName, followed by _id / _{{idAttribute}}. */
    foreignKey?: string
    /** Column in this model's table which foreignKey references, if other than this model's id / idAttribute. */
    foreignKeyTarget?: string
}

export interface BookshelfRelationBelongsTo extends BookshelfRelationAnyType  {
    // Target (from Attribute). Constructor of Model targeted by the join. Can be a string specifying a previously registered model with Bookshelf#model.
    /** Foreign key in this model. By default, the foreignKey is assumed to be the singular form of the Target model's tableName, followed by _id, or _{{idAttribute}} if the idAttribute property is set. */
    foreignKey?: string
    /** Column in the Target model's table which foreignKey references. This is only needed in case it's other than Target model's id / idAttribute. */
    foreignKeyTarget?: string
}

export interface BookshelfRelationBelongsToMany extends BookshelfRelationAnyType  {
    // Target (from Attribute). Constructor of Model targeted by join. Can be a string specifying a previously registered model with Bookshelf#model.
    /** Name of the joining table. Defaults to the two table names ordered alphabetically and joined by an underscore. */
    joinTableName?: string;
    /** Foreign key in this model. By default, the foreignKey is assumed to be the singular form of this model's tableName, followed by _id / _{{idAttribute}}. */
    foreignKey?: string;
    /** Foreign key in the Target model. By default, this is assumed to be the singular form of the Target model's tableName, followed by _id / _{{idAttribute}}. */
    otherKey?: string;
    /** Column in this model's table which foreignKey references. This is only needed if it's not the default id / idAttribute. */
    foreignKeyTarget?: string;
    /** Column in the Target model's table which otherKey references. This is only needed, if it's not the expected default of the Target model's id / idAttribute. */
    otherKeyTarget?: string;
}

export type BookshelfRelation = Relation & {
    isRelation: true;
    hasOne?: BookshelfRelationHasOne;
    hasMany?: BookshelfRelationHasMany;
    belongsTo?: BookshelfRelationBelongsTo;
    belongsToMany?: BookshelfRelationBelongsToMany;
    query?: BookshelfRelationQuery;
};

const bookshelfRelation = {
    createHasOne: (opts: BookshelfRelationHasOne = {}) => ({
        collection: false as const,
        isRelation: true,
        hasOne: opts,
        query: opts.query,
    }),
    createHasMany: (opts: BookshelfRelationHasMany = {}) => ({
        collection: true as const,
        isRelation: true,
        hasMany: opts,
        query: opts.query,
    }),
    createBelongsTo: (opts: BookshelfRelationBelongsTo = {}) => ({
        collection: false as const,
        isRelation: true,
        belongsTo: opts,
        query: opts.query,
    }),
    createBelongsToMany: (opts: BookshelfRelationBelongsToMany = {}) => ({
        collection: true as const,
        isRelation: true,
        belongsToMany: opts,
        query: opts.query,
    }),
};

const createModel = (options: ModelOptions) => {
    const knex: Knex = options.adapter();
    const bookshelf: Bookshelf = require('bookshelf')(knex);
    let model: Bookshelf.Model<any>;
    const modelOptions: Bookshelf.ModelOptions = Object.keys(options.attributes)
        .map(key => ({
            name: key,
            value: options.attributes[key],
        }))
        .filter((x): x is { name: string, value: AttributeRelation<BookshelfRelation> } => x.value.type === 'relation')
        .reduce((acc, attribute) => {
            const target = attribute.value.targetModel === 'self'
                ? () => model
                : () => (attribute.value.targetModel as any /* WTF Type :( */)().getBookshelfModel();
            // Allow fine relation query
            const relationQuery = (relation: Bookshelf.Collection<any>) => {
                if (!attribute.value.relation.query) {
                    return relation;
                }
                return attribute.value.relation.query(relation);
            };
            {
                const relation = attribute.value.relation.hasOne;
                if (relation) {
                    acc = {
                        ...acc,
                        [attribute.name](this: any /* TODO Type */) {
                            return relationQuery(this.hasOne(target(), relation.foreignKey, relation.foreignKeyTarget));
                        },
                    };
                }
            }
            {
                const relation = attribute.value.relation.hasMany;
                if (relation) {
                    acc = {
                        ...acc,
                        [attribute.name](this: any /* TODO Type */) {
                            return relationQuery(this.hasMany(target(), relation.foreignKey, relation.foreignKeyTarget));
                        },
                    };
                }
            }
            {
                const relation = attribute.value.relation.belongsTo;
                if (relation) {
                    acc = {
                        ...acc,
                        [attribute.name](this: any /* TODO Type */) {
                            return relationQuery(this.belongsTo(target(), relation.foreignKey, relation.foreignKeyTarget));
                        },
                    };
                }
            }
            {
                const relation = attribute.value.relation.belongsToMany;
                if (relation) {
                    acc = {
                        ...acc,
                        [attribute.name](this: any /* TODO Type */) {
                            return relationQuery(this.belongsToMany(target(),
                                relation.joinTableName,
                                relation.foreignKey,
                                relation.otherKey,
                                relation.foreignKeyTarget,
                                relation.otherKeyTarget));
                        },
                    };
                }
            }
            return acc;
        }, { tableName: options.collectionName, refresh: () => Promise.resolve({}), });
    model = bookshelf.Model.extend(modelOptions) as any;
    return model;
};
/**
 * Copy paste from Databless https://github.com/AckeeCZ/databless/blob/master/defaultBookshelfRepository.js#L167
 * @param options
 */
const serializer = (options = {} as any) =>
    (result: any) => {
        if (options.raw) {
            return result;
        }
        if (options.count) {
            return result && result.toJSON()[0].total || 0;
        }
        if (result && result.toJSON) {
            return result.toJSON({ omitPivot: true, ...options.toJSON, });
        }
        return result;
    };

const wildcards = (() => {
    const queryToSqlLike = (query: WildcardQuery): string => {
        return [
            query.wildcard.anyPrefix ? '%' : '',
            query.wildcard.query,
            query.wildcard.anySuffix ? '%' : '',
        ].join('');
    };

    return (filters: any, options: any): [any, any] => {
        if (!filters) {
            return  [filters, options];
        }
        const queries = repositoryWildcards.selectWildcards(filters);
        // Consume attributes
        filters = omit(filters, queries.map(q => q.wildcard.field));
        const parentQb = options?.qb;
        options = {
            ...options,
            qb: (qb: QueryBuilder) => {
                queries.forEach(q => {
                    qb.where(q.wildcard.field, 'like', queryToSqlLike(q));
                });
                if (parentQb) {
                    parentQb(qb);
                }
            },
        };
        return [filters, options];
    };
})();

const rangeQueries = (() => {
    const queryToSqlCompare = (query: RangeQuery) => {
        switch (true) {
            case !!query.range.gt:
                return ['>', query.range.gt!] as const;
            case !!query.range.gte:
                return ['>=', query.range.gte!] as const;
            case !!query.range.lt:
                return ['<', query.range.lt!] as const;
            case !!query.range.lte:
                return ['<=', query.range.lte!] as const;
            default:
                throw new Error('Cannot convert Range query to SQL');
        }
    };
    return (filters: any, options: any): [any, any] => {
        if (!filters) {
            return  [filters, options];
        }
        const queries = repositoryRangeQueries.selectRanges(filters);
        // Consume attributes
        filters = omit(filters, queries.map(q => q.range.field));
        const parentQb = options?.qb;
        options = {
            ...options,
            qb: (qb: QueryBuilder) => {
                queries.forEach(q => {
                    const comp = queryToSqlCompare(q);
                    qb.where(q.range.field, comp[0], comp[1]);
                });
                if (parentQb) {
                    parentQb(qb);
                }
            },
        };
        return [filters, options];
    };
})();

const select = (queryParams: any = {}, options: any = {}) => {
    return (qb: QueryBuilder) => {
        [queryParams, options] = wildcards(queryParams, options);
        [queryParams, options] = rangeQueries(queryParams, options);
        const arrayQueryParams = pickBy(queryParams, isArray);
        const primitiveQueryParams = pickBy(queryParams, negate(isArray));
        qb.where(primitiveQueryParams);
        forEach(arrayQueryParams, (value, field) => {
            qb.whereIn(field, value);
        });
        if (options.qb) {
            options.qb(qb);
        }
    };
};
const count = (options: any = {}, model: ReturnType<typeof createModel>) => {
    // TODO How about now to have a `count` option, but have a clean `.count` method instead
    if (!options.count) return (qb: QueryBuilder) => qb;
    const { tableName, idAttribute } = (model as any /* TODO Type */).forge();

    return (qb: QueryBuilder) => {
        qb.countDistinct(`${tableName}.${idAttribute} AS total`);
    };
};

const order = (options: any = {}, validFields: string[]): ((qb: QueryBuilder) => any) => {
    // Skip for missing order, skip for count
    if (!options.order || options.count) return () => {};
    options.order = (typeof options.order === 'string') ? [options.order] : options.order;
    if (!Array.isArray(options.order)) throw TypeError(`Invalid order option ${options.order}, expected string or array of strings`);
    const orderDefs = (options.order as string[]).map(order => {
        const matches = order.match(/(\+|\-)(.*)/)
        if (matches === null) return { columnName: order, order: 'ASC' };
        const [, sign, columnName] = matches;
        return { columnName, order: sign === '-' ? 'DESC' : 'ASC' }
    }).filter(def => validFields.includes(def.columnName))
    return qb => {
        orderDefs.forEach(x => {
            qb.orderBy(x.columnName, x.order);
        })
    };
};

const paginate = (() => {
    const extractPagination = (options: any /* TODO Type */ = {}, defaultLimit = 10, defaultOffset = 0) => {
        if ('count' in options || (!('limit' in options) && !('offset' in options))) {
            return {
                limit: undefined,
                offset: undefined,
            };
        }
        return {
            limit: isNaN(parseInt(options.limit, 10)) ? defaultLimit : Number(options.limit),
            offset: isNaN(parseInt(options.offset, 10)) ? defaultOffset : Number(options.offset),
        };
    };
    return (options = {}) => {
        const { limit, offset } = extractPagination(options);
        return (qb: QueryBuilder) => {
            if (limit !== undefined) {
                qb.limit(limit);
            }
            if (offset !== undefined) {
                qb.offset(offset);
            }
        };
    };
})();

const applyCustomFilters = (customFilters?: CustomFilters, queryParams?: any, options?: any) => {
    const relevantCustomFns = pick(customFilters || {}, keys(queryParams));
    entries(relevantCustomFns).forEach(([key, val]) => {
        val(queryParams[key], options);
    })
}

const queryModel = (model: Model<any>, queryParams?: any, options?: any) => {
    options = options || {};
    queryParams = queryParams || {};
    const filters = keys(queryParams)
        .filter(f => model.attributeNames.includes(f))
        .reduce((acc, f) => {
            acc[`${model.options.collectionName}.${f}`] = queryParams[f];
            return acc;
        }, {} as any);
    const source = model.getBookshelfModel();
    return source.query((qb: QueryBuilder) => {
        applyCustomFilters(model.options.filters, queryParams, options);
        select(filters, options)(qb);
        count(options, source)(qb);
        paginate(options)(qb);
        order(options, model.attributeNames)(qb);
    });
};
/**
 * Prevents Bookshelf's pivot-prefixed (PIVOT_PREFIX) attributes _pivot_abc  to be camelcased to `pivotAbc`
 * so that BS can pair back relation attributes.
 *
 * TODO: Only works for camelcase. Ignores passed `appStringCase`. For modifying such behaviour, I suggest
 * copy+paste+modify accordingly.
 * @param stringcase
 */
const patchStringcaseForBookshelf = (stringcase: any) => {
    return (knexOptions: any = {}) => {
        const pivotPrefix = require('bookshelf/lib/constants').PIVOT_PREFIX;
        const re = new RegExp(`^${pivotPrefix}`);
        return stringcase({
            ...knexOptions,
            appStringcase: (key: string) => {
                if (!re.test(key)) {
                    return key;
                }
                return pivotPrefix + require('stringcase').camelcase(key.replace(re, ''));
            },
        });
    };
};

const composeQb = (qbOption: QbOption | undefined, fn: QbOption): QbOption => {
    const lastQb = qbOption;
    return (qb) => {
        if (lastQb) lastQb(qb);
        fn(qb);
    };
};

export {
    patchStringcaseForBookshelf,
    createModel,
    bookshelfRelation,
    serializer,
    queryModel,
    composeQb,
};
