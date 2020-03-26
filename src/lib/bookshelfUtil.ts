import Bookshelf, { Model } from 'bookshelf';
import Knex, { QueryBuilder } from 'knex';
import { forEach, isArray, isObject, isString, negate, pickBy, snakeCase } from 'lodash';
import { ModelOptions, AttributeRelation } from './repository';

export interface BookshelfRelationHasOne {
    /** Foreign key in the Target model. By default the foreign key is assumed to be the singular form of this model's tableName followed by _id / _{{idAttribute}}. */
    foreignKey?: string
    /** Column in this model's table which foreignKey references, if other than this model's id / idAttribute. */
    foreignKeyTarget?: string
}

export interface BookshelfRelation {
    isRelation: true;
    hasOne?: BookshelfRelationHasOne;
}

const bookshelfRelation = {
    createHasOne: (opts?: BookshelfRelationHasOne): BookshelfRelation => ({
        isRelation: true,
        hasOne: opts,
    }),
};

export const registry = (() => {
    const store = new WeakMap();
    return {
        get: (modelOptions: ModelOptions) => {
            if (!store.has(modelOptions)) {
                return store.set(modelOptions, createModel(modelOptions));
            }
            return store.get(modelOptions);
        },
    };
})();

const createModel = (options: ModelOptions) => {
    const knex: Knex = options.adapter();
    const bookshelf: Bookshelf = require('bookshelf')(knex);
    const modelOptions: Bookshelf.ModelOptions = Object.keys(options.attributes)
        .map(key => ({
            name: key,
            value: options.attributes[key],
        }))
        .filter((x): x is { name: string, value: AttributeRelation } => x.value.type === 'relation')
        .reduce((acc, attribute) => {
            if (attribute.value.relation.hasOne) {
                const hasOne = attribute.value.relation.hasOne!;
                acc = {
                    ...acc,
                    [attribute.name](this: any /* TODO Type */ ) {
                        // TODO HIGH: Shit. Prvni argument musi bejt model objekt, anebo klic do Model registry BS
                        // --> Modely musi mit jmena, ale pri vytvoreni je clovek neovlivni
                        // --> Predat model objekt nepripada v uvahu
                        return this.hasOne(attribute.value.targetModel().bookshelfModel, hasOne.foreignKey, hasOne.foreignKeyTarget);
                    },
                };
            }
            return acc;
        }, { tableName: options.collectionName });
    const model: Bookshelf.Model<any> = bookshelf.Model.extend(modelOptions) as any;
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
