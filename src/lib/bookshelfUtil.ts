import Bookshelf, { Model } from 'bookshelf';
import Knex, { QueryBuilder } from 'knex';
import { forEach, isArray, isObject, isString, negate, pickBy, snakeCase } from 'lodash';
import { ModelOptions, AttributeRelation, Relation } from './repository';

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

export type BookshelfRelation = Relation & {
    isRelation: true;
    hasOne?: BookshelfRelationHasOne;
    hasMany?: BookshelfRelationHasMany;
    belongsTo?: BookshelfRelationBelongsTo;
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
            if (attribute.value.relation.hasOne) {
                const hasOne = attribute.value.relation.hasOne!;
                if (attribute.value.targetModel === 'self') {
                    acc = {
                        ...acc,
                        [attribute.name](this: any /* TODO Type */ ) {
                            return this.hasOne(model, hasOne.foreignKey, hasOne.foreignKeyTarget);
                        },
                    }
                } else {
                    const target = attribute.value.targetModel().getBookshelfModel();
                    acc = {
                        ...acc,
                        [attribute.name](this: any /* TODO Type */ ) {
                            return this.hasOne(target, hasOne.foreignKey, hasOne.foreignKeyTarget);
                        },
                    };
                }
            }
            if (attribute.value.relation.hasMany) {
                const hasMany = attribute.value.relation.hasMany!;
                if (attribute.value.targetModel === 'self') {
                    acc = {
                        ...acc,
                        [attribute.name](this: any /* TODO Type */ ) {
                            return this.hasMany(model, hasMany.foreignKey, hasMany.foreignKeyTarget);
                        },
                    }
                } else {
                    const target = attribute.value.targetModel().getBookshelfModel();
                    acc = {
                        ...acc,
                        [attribute.name](this: any /* TODO Type */ ) {
                            return this.hasMany(target, hasMany.foreignKey, hasMany.foreignKeyTarget);
                        },
                    };
                }
            }
            if (attribute.value.relation.belongsTo) {
                const belongsTo = attribute.value.relation.belongsTo!;
                if (attribute.value.targetModel === 'self') {
                    acc = {
                        ...acc,
                        [attribute.name](this: any /* TODO Type */ ) {
                            return this.belongsTo(model, belongsTo.foreignKey, belongsTo.foreignKeyTarget);
                        },
                    };
                } else {
                    const target = attribute.value.targetModel().getBookshelfModel();
                    acc = {
                        ...acc,
                        [attribute.name](this: any /* TODO Type */ ) {
                            return this.belongsTo(target, belongsTo.foreignKey, belongsTo.foreignKeyTarget);
                        },
                    };
                }
            }
            return acc;
        }, { tableName: options.collectionName });
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
            return result.toJSON(options.toJSON);
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
const select = (queryParams: any = {}, options: any = {}) => {
    return (qb: QueryBuilder) => {
        const arrayQueryParams = pickBy(queryParams, isArray);
        const primitiveQueryParams = pickBy(queryParams, negate(isArray));
        qb.where(snakelize(primitiveQueryParams));
        forEach(arrayQueryParams, (value, field) => {
            qb.whereIn(snakelize(field), value);
        });
        // likes.forEach(([field, value]) => {
        //     qb.where(snakelize(field), 'like', value);
        // });
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
const queryModel = (source: ReturnType<typeof createModel>, queryParams?: any, options?: any) => {
    return source
        .query((qb: QueryBuilder) => {
            select(queryParams, options)(qb);
            count(options, source)(qb);
            // paginate(options)(qb);
            // order(queryParams, options)(qb);
        });
};

export {
    createModel,
    bookshelfRelation,
    serializer,
    queryModel,
};
