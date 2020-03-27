import Knex from 'knex';
import { isEmpty, memoize, pick } from 'lodash';
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
}
interface RepositoryDetailOptions<A extends Record<string, Attribute>> extends RepositoryMethodOptions {
    // TODO: This type restricts using withRelated on transitive fields
    withRelated?: Attributes2RelationKeys<A>[];
}
interface RepositoryListOptions<A extends Record<string, Attribute>> extends RepositoryDetailOptions<A> {
    count?: true;
    order?: Attributes2NonRelationKeys<A> | Attributes2NonRelationKeys<A>[]
}

type Filters<A extends Record<string, Attribute>> = Partial<{[key in keyof A]: Attribute2Type<A[key], A> | Attribute2Type<A[key], A>[]}>;

export const create = async <A extends Record<string, Attribute>>(model: Model<A>, data: Partial<Model2Entity<Model<A>>>, options?: RepositoryMethodOptions): Promise<Attributes2Entity<A>> => {
    data = model.serialize(data);
    const result = await (model.getBookshelfModel().forge())
        .save(pick(data, model.attributeNames), options);
    return bookshelfUtil.serializer(options)(result);
};

export const list = async <A extends Record<string, Attribute>>(model: Model<A>, filter?: Filters<A>, options?: RepositoryListOptions<A>): Promise<Attributes2Entity<A>[]> => {
    const result = await bookshelfUtil.queryModel(model.getBookshelfModel(), filter, options)
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
    const result = await bookshelfUtil.queryModel(model.getBookshelfModel(), filter, options)
        .fetch(options);
    return model.deserialize(bookshelfUtil.serializer(options)(result));
};

/**
 * Return value may vary on
 * @param model 
 * @param filter 
 * @param data 
 * @param options 
 */
export const update = async <A extends Record<string, Attribute>>(model: Model<A>, filter: Partial<Model2Entity<Model<A>>>, data?: Partial<Model2Entity<Model<A>>>, options: RepositoryMethodOptions = {}): Promise<Attributes2Entity<A> | undefined> => {
    // TODO `defaultPagination` from master
    if (!data || isEmpty(data)) {
        return;
    }
    data = model.serialize(data);
    const result = await bookshelfUtil.queryModel(model.getBookshelfModel(), filter, options)
        .save(data, { require: false, method: 'update', ...options });
    return bookshelfUtil.serializer(options)(result);
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
