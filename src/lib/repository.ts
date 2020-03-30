import Knex from 'knex';
import { defaults, isEmpty, memoize, pick } from 'lodash';
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
export type AttributeRelation<A extends Record<string, PrimitiveAttribute> = Record<string, PrimitiveAttribute>, R extends Relation = any> = {
    type: 'relation'
    targetModel: (() => Model<A>) | 'self'
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

interface RepositoryMethodOptions {
    toJSON?: SerializeOptions;
    qb?: bookshelfUtil.QbOption;
}
interface RepositoryDetailOptions<A extends Record<string, Attribute>> extends RepositoryMethodOptions {
    // TODO: This type restricts using withRelated on transitive fields
    withRelated?: Attributes2RelationKeys<A>[];
}
interface RepositoryListOptions<A extends Record<string, Attribute>> extends RepositoryDetailOptions<A> {
    count?: true;
    order?: Attributes2NonRelationKeys<A> | Attributes2NonRelationKeys<A>[];
    limit?: number;
    offset?: number;
}

type Filters<A extends Record<string, Attribute>> = Partial<{[key in keyof A]: Attribute2Type<A[key], A> | Attribute2Type<A[key], A>[]}>;

type Create<A extends Record<string, Attribute>> = (model: Model<A>, data: Partial<Model2Entity<Model<A>>>, options?: RepositoryMethodOptions) => Promise<Attributes2Entity<A>>;
export const create = (<A extends Record<string, Attribute>>(): Create<A> => async (model, data, options) => {
    data = model.serialize(data);
    const result = await (model.getBookshelfModel().forge())
        .save(pick(data, model.attributeNames), options);
    return bookshelfUtil.serializer(options)(result);
})();

type List<A extends Record<string, Attribute>> = (model: Model<A>, filter?: Filters<A>, options?: RepositoryListOptions<A>) => Promise<Attributes2Entity<A>[]>;
export const list = (<A extends Record<string, Attribute>>(): List<A> => async (model, filter, options) => {
    const result = await bookshelfUtil.queryModel(model.getBookshelfModel(), filter, options)
        .fetchAll(options);
    if (options?.count) {
        return (bookshelfUtil.serializer(options)(result));
    }
    return (bookshelfUtil.serializer(options)(result))
        .map(model.deserialize);
})();

type Detail<A extends Record<string, Attribute>> = (model: Model<A>, filter?: Filters<A>, options?: RepositoryListOptions<A>) => Promise<Attributes2Entity<A>>;
export const detail = (<A extends Record<string, Attribute>>(): Detail<A> => async (model, filter, options) => {
    const result = await bookshelfUtil.queryModel(model.getBookshelfModel(), filter, options)
        .fetch(options);
    return model.deserialize(bookshelfUtil.serializer(options)(result));
})();

/**
 * Return value may vary on driver
 * @param model 
 * @param filter 
 * @param data 
 * @param options 
 */
type Update<A extends Record<string, Attribute>> = (model: Model<A>, filter?: Filters<A>, data?: Partial<Model2Entity<Model<A>>>, options?: RepositoryMethodOptions) => Promise<Attributes2Entity<A> | undefined>;
export const update = (<A extends Record<string, Attribute>>(): Update<A> => async (model, filter, data, options = {}) => {
    // TODO `defaultPagination` from master
    if (!data || isEmpty(data)) {
        return;
    }
    data = model.serialize(pick(data, model.attributeNames));
    const result = await bookshelfUtil.queryModel(model.getBookshelfModel(), filter, options)
        .save(data, { require: false, method: 'update', ...options });
    return bookshelfUtil.serializer(options)(result);
})();

type Delete<A extends Record<string, Attribute>> = (model: Model<A>, filter?: Filters<A>, options?: RepositoryMethodOptions) => Promise<unknown>;
const remove = (<A extends Record<string, Attribute>>(): Delete<A> => async (model, filter, options = {}) => {
    return bookshelfUtil.queryModel(model.getBookshelfModel(), filter, options)
        .destroy(defaults({ require: false }, options));
})();
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
        create: (create as any as Create<A>).bind(null, model),
        update: (update as any as Update<A>).bind(null, model),
        list: (list as any as List<A>).bind(null, model),
        delete: (remove as any as Delete<A>).bind(null, model),
        detail: (detail as any as Detail<A>).bind(null, model),
    };
};
