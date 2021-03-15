import { SerializeOptions } from 'bookshelf';
import * as Knex from 'knex';
import { defaults, flow, isEmpty, memoize, pick, omitBy } from 'lodash';
import * as bookshelfUtil from './bookshelfUtil';

type Primitive = 'string' | 'number' | 'date' | 'bool' | 'object';
type PrimitiveToType<P> = P extends 'string' ? string : P extends 'date' ? Date : P extends 'number' ? number : P extends 'bool' ? boolean : P extends 'object' ? any : never;

type AttributeRelation2Target<P, S = never> = P extends { targetModel: 'self' }
    ? S extends Attributes
        ? Attributes2Entity<S>
        : never
    : P extends { targetModel: () => infer M }
    ? M extends Model
        ? Model2Entity<M>
        : never
    : never;

export type AttributeRelation2Type<P, S = never> = P extends { type: 'relation' }
    ? P extends { relation: { collection: true } } ? AttributeRelation2Target<P, S>[] : AttributeRelation2Target<P, S>
    : never;

type Attribute2Type<P, S = never> = P extends AttributeRelation ? AttributeRelation2Type<P, S> : P extends { deserialize: (x: any) => infer R } ? R : P extends { type: infer X } ? PrimitiveToType<X> : never;
type PrimitiveAttribute = { type: Primitive, serialize?: (x: any) => PrimitiveToType<Primitive>, deserialize?: (x: any) => any };
type Attribute = AttributeRelation | PrimitiveAttribute;
export type Relation = { collection: boolean }
export type AttributeRelation<R extends Relation = any> = {
    type: 'relation'
    targetModel: (() => Model<any>) | 'self'
    relation: R
}
export type Attributes2Entity<A extends Attributes> = { [key in keyof A]: A[key] extends Attribute ? Attribute2Type<A[key], A> : never };
export type Attributes2RelationKeys<A extends Attributes> = { [key in keyof A]: A[key] extends { type: 'relation' } ? key : never }[keyof A];
export type Attributes2NonRelationKeys<A extends Attributes> = { [key in keyof A]: A[key] extends { type: 'relation' } ? never : key }[keyof A];
export type Model2Entity<M extends Model<any>> = Attributes2Entity<M['options']['attributes']>;
export type Model2RelationKeys<M extends Model<any>> = Attributes2RelationKeys<M['options']['attributes']>;
type Attributes = Record<string, Attribute>;
type CustomFilter<T = any> = (value: T, options: RepositoryMethodOptions) => void;
export type CustomFilters = Record<string, CustomFilter>;

export interface ModelOptions<E extends Entity = Entity, RK extends keyof E = never, CF extends CustomFilters = CustomFilters> {
    adapter: () => Knex;
    collectionName: string;
    attributes: Attributes;
    filters?: CF;
}

type Entity = Record<string, any>
export interface Model<E extends Entity = Entity, RK extends keyof E = never, CF extends CustomFilters = CustomFilters> {
    getBookshelfModel: () => E & any;
    attributeNames: string[];
    options: ModelOptions<CF>;
    deserialize: (object?: any) => any; // TODO Types
    serialize: (object?: any) => any; // TODO Types
}

export const bookshelfRelation = bookshelfUtil.bookshelfRelation;
export const patchStringcaseForBookshelf = bookshelfUtil.patchStringcaseForBookshelf;

export interface RepositoryMethodOptions {
    toJSON?: SerializeOptions;
    qb?: bookshelfUtil.QbOption;
}
export interface RepositoryDetailOptions<E extends Entity, RK extends keyof E> extends RepositoryMethodOptions {
    // TODO: This type restricts using withRelated on transitive fields
    withRelated?: RK[];
}
export interface RepositoryListOptions<E extends Entity, RK extends keyof E> extends RepositoryDetailOptions<E, RK> {
    count?: true;
    order?: Exclude<keyof E, RK> | Exclude<keyof E, RK>[];
    limit?: number;
    offset?: number;
}

type Filters<E extends Entity, RK extends keyof E, CF extends CustomFilters> = Partial<{[key in keyof E]: E[key] | E[key][]} & {[key in keyof CF]: CF[key] extends CustomFilter<infer T> ? T : never }>;

export const create = async <E extends Entity, RK extends keyof E, CF extends CustomFilters>(model: Model<E, RK, CF>, data: Partial<E>, options?: RepositoryMethodOptions): Promise<E> => {
    data = model.serialize(data);
    const result = await (model.getBookshelfModel().forge())
        .save(pick(data, model.attributeNames), options);
    return bookshelfUtil.serializer(options)(result);
};

export const createBulk = async <E extends Entity, RK extends keyof E, CF extends CustomFilters>(model: Model<E, RK, CF>, data: Array<Partial<E>>, options?: RepositoryMethodOptions): Promise<unknown> => {
    return model.options.adapter().batchInsert(
        model.options.collectionName,
        data.map(dataItem => model.serialize(dataItem))
        // TODO Support transactions using .transacting(trx)
        // TODO Add timestamps if bsModel.hasTimestamps
    );
};

export const list = async <E extends Entity, RK extends keyof E, CF extends CustomFilters, O extends RepositoryListOptions<E, RK>>(model: Model<E, RK, CF>, filter?: Filters<E, RK, CF>, options?: O): Promise<O['count'] extends true ? number : E[]> => {
    const result = await bookshelfUtil.queryModel(model, createEmptyFilter()(filter), options)
        .fetchAll(options);
    if (options?.count) {
        return (bookshelfUtil.serializer(options)(result));
    }
    return (bookshelfUtil.serializer(options)(result))
        .map(model.deserialize);
};

// TODO Options should have properties for current adapter, e.g. withRelated for Bookshelf. How?
export const detail = async <E extends Entity, RK extends keyof E, CF extends CustomFilters>(model: Model<E, RK, CF>, filter?: Filters<E, RK, CF>, options?: RepositoryDetailOptions<E, RK>): Promise<E> => {
    // TODO DB Limit 1
    const result = await bookshelfUtil.queryModel(model, createEmptyFilter()(filter), options)
        .fetch(defaults({ require: false }, options));
    return model.deserialize(bookshelfUtil.serializer(options)(result)) || undefined;
};

/**
 * Return value may vary on driver
 * @param model 
 * @param filter 
 * @param data 
 * @param options 
 */
export const update = async <E extends Entity, RK extends keyof E, CF extends CustomFilters>(model: Model<E, RK, CF>, filter: Filters<E, RK, CF>, data?: Partial<E>, options: RepositoryMethodOptions = {}): Promise<E | undefined> => {
    // TODO `defaultPagination` from master
    data = model.serialize(pick(data, model.attributeNames));
    if (!data || isEmpty(data)) {
        return;
    }
    const result = await bookshelfUtil.queryModel(model, filter, options)
        .save(data, { require: false, method: 'update', ...options });
    return bookshelfUtil.serializer(options)(result);
};

const remove = async <E extends Entity, RK extends keyof E, CF extends CustomFilters>(model: Model<E, RK, CF>, filter?: Filters<E, RK, CF>, options?: RepositoryMethodOptions): Promise<unknown> => {
    // TODO: check there is no typo in filters
    if (!filter || isEmpty(filter)) {
        const optionQb = (options?.qb) || (x => x);
        options = {
            ...options,
            qb: (qb) => {
                qb.whereRaw('1 = 1');
                optionQb(qb);
            },
        };
    }
    return bookshelfUtil.queryModel(model, filter, options)
        .destroy(defaults({ require: false }, options));
};
export { remove as delete };

const createAttributesFilter = (options: ModelOptions) => {
    const attributes = Object.keys(options.attributes);
    return (object?: any) => {
        if (!object) {
            return object;
        }
        return pick(object, attributes);
    };
};

const createEmptyFilter = () => {
    return (object?: any) => {
        if (!object) {
            return object;
        }
        return omitBy(object, value => (value === undefined));
    };
};

const createAttributesDeserializer = (options: ModelOptions) =>
    createMapAttributes(
        options,
        attribute => (attribute as any /* TODO Type */).deserialize,
        (value, name) => (options.attributes[name] as any /* TODO Type */).deserialize(value),
    );

const createAttributesSerializer = (options: ModelOptions) =>
    createMapAttributes(
        options,
        attribute => (attribute as any /* TODO Type */).serialize,
        (value, name) => (options.attributes[name] as any /* TODO Type */).serialize(value),
    );

const createMapAttributes = (
    options: ModelOptions,
    shouldMapAttribute: (attribute: Attribute) => boolean,
    mapValue: (value: any, name: string) => any
) => {
    const fields = Array.from(Object.entries(options.attributes))
        .filter(([, attribute]) => shouldMapAttribute(attribute))
        .map(([key]) => key);
    return (object?: any) => {
        if (!object) {
            return object;
        }
        const mapped = fields.reduce((acc, name) => {
            acc[name] = mapValue(object[name], name);
            return acc;
        }, {} as any);
        return {
            ...object,
            ...mapped,
        };
    };
};

export type RangeQuery = {
    range: {
        field: string;
        gt?: string | number | number | Date | boolean;
        lt?: string | number | number | Date | boolean;
        gte?: string | number | number | Date | boolean;
        lte?: string | number | number | Date | boolean;
    };
};

export const rangeQueries = (() => {
    enum Sign {
        Lte = '<=',
        Lt = '<',
        Gte = '>=',
        Gt = '>',
    }
    const selectRanges = (filters: any): RangeQuery[] => {
        return (Array.from(Object.entries(filters))
            .filter(([, value]) => (typeof value === 'string')) as Array<[string, string]>)
            .map(([key, value]): RangeQuery => {
                const gte = value.startsWith(Sign.Gte)
                    ? value.substr(Sign.Gte.length)
                    : undefined;
                const gt = !gte && value.startsWith(Sign.Gt)
                    ? value.substr(Sign.Gt.length)
                    : undefined;
                const lte = value.startsWith(Sign.Lte)
                    ? value.substr(Sign.Lte.length)
                    : undefined;
                const lt = !lte && value.startsWith(Sign.Lt)
                    ? value.substr(Sign.Lt.length)
                    : undefined;
                return {
                    range: {
                        gt,
                        lte,
                        gte,
                        lt,
                        field: key,
                    },
                };
            })
            .filter(query => query.range.gt || query.range.gte || query.range.lt || query.range.lte);
    };
    return {
        selectRanges,
    };
})();

export type WildcardQuery = {
    wildcard: {
        field: string;
        query: string;
        anyPrefix: boolean;
        anySuffix: boolean;
    }
};

export const wildcards = (() => {
    const rgLeft = /^\*/;
    const rgRight = /\*$/;
    const selectWildcards = (filters: any): WildcardQuery[] => {
        return Array.from(Object.entries(filters))
            .filter(([, value]) => (typeof value === 'string'))
            .map(([key, value]): WildcardQuery => {
                return {
                    wildcard: {
                        field: key,
                        query: (value as string)
                            .replace(rgLeft, '')
                            .replace(rgRight, ''),
                        anyPrefix: rgLeft.test(value as string),
                        anySuffix: rgRight.test(value as string),
                    },
                };
            })
            .filter(query => query.wildcard.anyPrefix || query.wildcard.anySuffix);
    };
    return {
        selectWildcards,
    };
})();

export const createModel = <E extends Entity, RK extends keyof E, CF extends CustomFilters>(options: ModelOptions<E, RK, CF>): Model<E, RK, CF> => {
    const getBookshelfModel: (noRelations?: boolean) => any /* TODO Type */ = memoize(() => bookshelfUtil.createModel(options));
    const attributeNames = Object.keys(options.attributes);
    return {
        options,
        getBookshelfModel,
        attributeNames,
        deserialize: createAttributesDeserializer(options),
        serialize: flow(createEmptyFilter(), createAttributesSerializer(options), createAttributesFilter(options)),
    };
};

export const createRepository = <E extends Entity,RK extends keyof E, CF extends CustomFilters>(model: Model<E, RK, CF>) => {
    return {
        create: (data: Partial<E>, options?: RepositoryMethodOptions) => create(model, data, options),
        list: <O extends RepositoryListOptions<E, RK>>(filter?: Filters<E, RK, CF>, options?: O) => list(model, filter, options),
        detail: (filter?: Filters<E, RK, CF>, options?: RepositoryDetailOptions<E, RK>) => detail(model, filter, options),
        update: (filter: Filters<E, RK, CF>, data?: Partial<E>, options: RepositoryMethodOptions = {}) => update(model, filter, data, options),
        delete: (filter?: Filters<E, RK, CF>, options?: RepositoryMethodOptions) => remove(model, filter, options),
        createBulk: (dataItems: Array<Partial<E>>, options?: RepositoryMethodOptions) => createBulk(model, dataItems, options),
    };
};
