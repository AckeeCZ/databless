import Bookshelf, { Model } from 'bookshelf';
import Knex, { QueryBuilder } from 'knex';
import { forEach, isArray, isObject, isString, negate, omit, pickBy, snakeCase } from 'lodash';
import { ModelOptions, AttributeRelation, Relation, WildcardQuery, wildcards as repositoryWildcards } from './repository';

export interface BookshelfRelationHasOne {
    // Target (from Attribute). Constructor of Model targeted by join. Can be a string specifying a previously registered model with Bookshelf#model.
    /** Foreign key in the Target model. By default the foreign key is assumed to be the singular form of this model's tableName followed by _id / _{{idAttribute}}. */
    foreignKey?: string
    /** Column in this model's table which foreignKey references, if other than this model's id / idAttribute. */
    foreignKeyTarget?: string
}

export interface BookshelfRelationHasMany {
    // Target (from Attribute). Constructor of Model targeted by join. Can be a string specifying a previously registered model with Bookshelf#model.
    /** ForeignKey in the Target model. By default, the foreign key is assumed to be the singular form of this model's tableName, followed by _id / _{{idAttribute}}. */
    foreignKey?: string
    /** Column in this model's table which foreignKey references, if other than this model's id / idAttribute. */
    foreignKeyTarget?: string
}

export interface BookshelfRelationBelongsTo {
    // Target (from Attribute). Constructor of Model targeted by the join. Can be a string specifying a previously registered model with Bookshelf#model.
    /** Foreign key in this model. By default, the foreignKey is assumed to be the singular form of the Target model's tableName, followed by _id, or _{{idAttribute}} if the idAttribute property is set. */
    foreignKey?: string
    /** Column in the Target model's table which foreignKey references. This is only needed in case it's other than Target model's id / idAttribute. */
    foreignKeyTarget?: string
}

export interface BookshelfRelationBelongsToMany {
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
};

const bookshelfRelation = {
    createHasOne: (opts: BookshelfRelationHasOne = {}) => ({
        collection: false as const,
        isRelation: true,
        hasOne: opts,
    }),
    createHasMany: (opts: BookshelfRelationHasMany = {}) => ({
        collection: true as const,
        isRelation: true,
        hasMany: opts,
    }),
    createBelongsTo: (opts: BookshelfRelationBelongsTo = {}) => ({
        collection: false as const,
        isRelation: true,
        belongsTo: opts,
    }),
    createBelongsToMany: (opts: BookshelfRelationBelongsToMany = {}) => ({
        collection: true as const,
        isRelation: true,
        belongsToMany: opts,
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
        .filter((x): x is { name: string, value: AttributeRelation<any, BookshelfRelation> } => x.value.type === 'relation')
        .reduce((acc, attribute) => {
            const target = attribute.value.targetModel === 'self'
                ? () => model
                : () => (attribute.value.targetModel as any /* WTF Type :( */)().getBookshelfModel();
            {
                const relation = attribute.value.relation.hasOne;
                if (relation) {
                    acc = {
                        ...acc,
                        [attribute.name](this: any /* TODO Type */) {
                            return this.hasOne(target(), relation.foreignKey, relation.foreignKeyTarget);
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
                            return this.hasMany(target(), relation.foreignKey, relation.foreignKeyTarget);
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
                            return this.belongsTo(target(), relation.foreignKey, relation.foreignKeyTarget);
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
                            return this.belongsToMany(target(),
                                relation.joinTableName,
                                relation.foreignKey,
                                relation.otherKey,
                                relation.foreignKeyTarget,
                                relation.otherKeyTarget);
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
// TODO Refactor
const snakelize = (obj: any) => {
    if (isString(obj)) {
        return snakeCase(obj);
    }
    if (isArray(obj) === true) {
        const out: any[] = [];
        obj.forEach((item: any) => {
            out.push(exports.snakelize(item));
        });
        return out;
    }
    if (!obj || !isObject(obj)) {
        return obj;
    }
    const out = {};
    Object.keys(obj).forEach(key => {
        // @ts-ignore
        out[snakeCase(key)] = obj[key];
    });
    return out;
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

const select = (queryParams: any = {}, options: any = {}) => {
    return (qb: QueryBuilder) => {
        [queryParams, options] = wildcards(queryParams, options);
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
};
const count = (options: any = {}, model: ReturnType<typeof createModel>) => {
    // TODO How about now to have a `count` option, but have a clean `.count` method instead
    if (!options.count) return (qb: QueryBuilder) => qb;
    const { tableName, idAttribute } = (model as any /* TODO Type */).forge();

    return (qb: QueryBuilder) => {
        qb.countDistinct(`${tableName}.${idAttribute} AS total`);
    };
};

const order = (options: any = {}): ((qb: QueryBuilder) => any) => {
    // Skip for missing order, skip for count
    if (!options.order || options.count) return () => {};
    options.order = (typeof options.order === 'string') ? [options.order] : options.order;
    if (!Array.isArray(options.order)) throw TypeError(`Invalid order option ${options.order}, expected string or array of strings`);
    const orderDefs = (options.order as string[]).map(order => {
        const matches = order.match(/(\+|\-)(.*)/)
        if (matches === null) return { columnName: order, order: 'ASC' };
        const [, sign, columnName] = matches;
        return { columnName, order: sign === '-' ? 'DESC' : 'ASC' }
    })
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

const queryModel = (source: ReturnType<typeof createModel>, queryParams?: any, options?: any) => {
    return source
        .query((qb: QueryBuilder) => {
            select(queryParams, options)(qb);
            count(options, source)(qb);
            paginate(options)(qb);
            order(options)(qb);
        });
};

export {
    createModel,
    bookshelfRelation,
    serializer,
    queryModel,
};
