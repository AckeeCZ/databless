import * as Knex from 'knex';
import { isEmpty, memoize, pick, defaults } from 'lodash';
import * as bookshelfUtil from './bookshelfUtil';
import { SerializeOptions } from 'bookshelf';

type Primitive = 'string' | 'number' | 'date' | 'bool' | 'object';
type PrimitiveToType<P> = P extends 'string' ? string : P extends 'date' ? Date : P extends 'number' ? number : P extends 'bool' ? boolean : P extends 'object' ? any : never;

type AttributeRelation2Target<P, S = never> = P extends { targetModel: 'self' }
    ? S extends Record<string, Attribute>
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
export type Attributes2Entity<A extends Record<string, Attribute>> = { [key in keyof A]: A[key] extends Attribute ? Attribute2Type<A[key], A> : never };
export type Attributes2RelationKeys<A extends Record<string, Attribute>> = { [key in keyof A]: A[key] extends { type: 'relation' } ? key : never }[keyof A];
export type Attributes2NonRelationKeys<A extends Record<string, Attribute>> = { [key in keyof A]: A[key] extends { type: 'relation' } ? never : key }[keyof A];
export type Model2Entity<M extends Model<any>> = Attributes2Entity<M['options']['attributes']>;
export type Model2RelationKeys<M extends Model<any>> = Attributes2RelationKeys<M['options']['attributes']>;

export interface ModelOptions<A extends Record<string, Attribute> = Record<string, Attribute>> {
    adapter: () => Knex;
    collectionName: string;
    attributes: A;
}

export interface Model<A extends Record<string, Attribute> = Record<string, Attribute>> {
    getBookshelfModel: () => any;
    attributeNames: string[];
    options: ModelOptions<A>;
    deserialize: (object?: any) => any; // TODO Types
    serialize: (object?: any) => any; // TODO Types
}

export const bookshelfRelation = bookshelfUtil.bookshelfRelation;
export const patchStringcaseForBookshelf = bookshelfUtil.patchStringcaseForBookshelf;

export interface RepositoryMethodOptions {
    toJSON?: SerializeOptions;
    qb?: bookshelfUtil.QbOption;
}
export interface RepositoryDetailOptions<A extends Record<string, Attribute>> extends RepositoryMethodOptions {
    // TODO: This type restricts using withRelated on transitive fields
    withRelated?: Attributes2RelationKeys<A>[];
}
export interface RepositoryListOptions<A extends Record<string, Attribute>> extends RepositoryDetailOptions<A> {
    count?: true;
    order?: Attributes2NonRelationKeys<A> | Attributes2NonRelationKeys<A>[];
    limit?: number;
    offset?: number;
}

type Filters<A extends Record<string, Attribute>> = Partial<{[key in keyof A]: Attribute2Type<A[key], A> | Attribute2Type<A[key], A>[]}>;

export const create = async <A extends Record<string, Attribute>>(model: Model<A>, data: Partial<Model2Entity<Model<A>>>, options?: RepositoryMethodOptions): Promise<Attributes2Entity<A>> => {
    data = model.serialize(data);
    const result = await (model.getBookshelfModel().forge())
        .save(pick(data, model.attributeNames), options);
    return bookshelfUtil.serializer(options)(result);
};

export const createBulk = async <A extends Record<string, Attribute>>(model: Model<A>, data: Array<Partial<Model2Entity<Model<A>>>>, options?: RepositoryMethodOptions): Promise<unknown> => {
    return model.options.adapter().batchInsert(
        model.options.collectionName,
        data.map(dataItem => model.serialize(dataItem))
        // TODO Support transactions using .transacting(trx)
        // TODO Add timestamps if bsModel.hasTimestamps
    );
};

export const list = async <A extends Record<string, Attribute>, O extends RepositoryListOptions<A>>(model: Model<A>, filter?: Filters<A>, options?: O): Promise<O['count'] extends true ? number : Attributes2Entity<A>[]> => {
    const result = await bookshelfUtil.queryModel(model, filter, options)
        .fetchAll(options);
    if (options?.count) {
        return (bookshelfUtil.serializer(options)(result));
    }
    return (bookshelfUtil.serializer(options)(result))
        .map(model.deserialize);
};

// TODO Options should have properties for current adapter, e.g. withRelated for Bookshelf. How?
export const detail = async <A extends Record<string, Attribute>>(model: Model<A>, filter?: Filters<A>, options?: RepositoryDetailOptions<A>): Promise<Attributes2Entity<A>> => {
    // TODO DB Limit 1
    const result = await bookshelfUtil.queryModel(model, filter, options)
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
export const update = async <A extends Record<string, Attribute>>(model: Model<A>, filter: Filters<A>, data?: Partial<Model2Entity<Model<A>>>, options: RepositoryMethodOptions = {}): Promise<Attributes2Entity<A> | undefined> => {
    // TODO `defaultPagination` from master
    if (!data || isEmpty(data)) {
        return;
    }
    data = model.serialize(pick(data, model.attributeNames));
    const result = await bookshelfUtil.queryModel(model, filter, options)
        .save(data, { require: false, method: 'update', ...options });
    return bookshelfUtil.serializer(options)(result);
};

const remove = async <A extends Record<string, Attribute>>(model: Model<A>, filter?: Filters<A>, options?: RepositoryMethodOptions): Promise<unknown> => {
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
export { remove as delete }

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

export const createModel = <A extends Record<string, Attribute>>(options: ModelOptions<A>): Model<A> => {
    const getBookshelfModel: (noRelations?: boolean) => any /* TODO Type */ = memoize(() => bookshelfUtil.createModel(options));
    const attributeNames = Object.keys(options.attributes);
    return {
        options,
        getBookshelfModel,
        attributeNames,
        deserialize: createAttributesDeserializer(options),
        serialize: createAttributesSerializer(options),
    };
};

export const createRepository = <A extends Record<string, Attribute>>(model: Model<A>) => {
    return {
        create: (data: Partial<Model2Entity<Model<A>>>, options?: RepositoryMethodOptions) => create(model, data, options),
        list: <O extends RepositoryListOptions<A>>(filter?: Filters<A>, options?: O) => list(model, filter, options),
        detail: (filter?: Filters<A>, options?: RepositoryDetailOptions<A>) => detail(model, filter, options),
        update: (filter: Filters<A>, data?: Partial<Model2Entity<Model<A>>>, options: RepositoryMethodOptions = {}) => update(model, filter, data, options),
        delete: (filter?: Filters<A>, options?: RepositoryMethodOptions) => remove(model, filter, options),
    };
};
