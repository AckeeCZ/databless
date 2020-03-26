import Knex from 'knex';
import { memoize, pick } from 'lodash';
import * as bookshelfUtil from './bookshelfUtil';

type Primitive = 'string' | 'number' | 'date' | 'bool' | 'object';
type PrimitiveToType<P> = P extends 'string' ? string : P extends 'date' ? Date : P extends 'number' ? number : P extends 'bool' ? boolean : P extends 'object' ? any : never;

export type AttributeRelation2Type<P, S = never> = P extends { type: 'relation' } ? P extends { targetModel: 'self' } ? S : P extends { targetModel: () => infer M } ? M extends Model ? Model2Entity<M> : never : never : never;
type Attribute2Type<P, S = never> = P extends AttributeRelation ? AttributeRelation2Type<P, S> : P extends { deserialize: (x: any) => infer R } ? R : P extends { type: infer X } ? PrimitiveToType<X> : never;
type PrimitiveAttribute = { type: Primitive, serialize?: (x: any) => PrimitiveToType<Primitive>, deserialize?: (x: any) => any };
type Attribute = AttributeRelation | PrimitiveAttribute;

export type AttributeRelation<A extends Record<string, PrimitiveAttribute> = Record<string, PrimitiveAttribute>> = {
    type: 'relation',
    targetModel: (() => Model<A>) | 'self',
    relation: bookshelfUtil.BookshelfRelation,
}
export type Attributes2Entity<A extends Record<string, Attribute>> = { [key in keyof A]: A[key] extends Attribute ? Attribute2Type<A[key], A> : never };
export type Model2Entity<M extends Model<any>> = Attributes2Entity<M['options']['attributes']>;

export interface ModelOptions<A extends Record<string, Attribute> = Record<string, Attribute>> {
    adapter: () => Knex;
    collectionName: string;
    attributes: A;
}

export interface Model<A extends Record<string, Attribute> = Record<string, Attribute>> {
    getBookshelfModel: () => any;
    attributeNames: string[];
    options: ModelOptions<A>;
}

export const bookshelfRelation = bookshelfUtil.bookshelfRelation;

export const create = async <A extends Record<string, Attribute>>(model: Model<A>, data: any /* TODO Type */, options?: any /* TODO Type */): Promise<Attributes2Entity<A>> => {
    const result = await (model.getBookshelfModel().forge())
        .save(pick(data, model.attributeNames), options);
    return bookshelfUtil.serializer(options)(result);
};

export const list = async <A extends Record<string, Attribute>>(model: Model<A>, filter?: any, options?: any): Promise<Attributes2Entity<A>[]> => {
    const result = await bookshelfUtil.queryModel(model.getBookshelfModel(), filter, options)
        .fetchAll();
    return bookshelfUtil.serializer(options)(result);
};

// TODO Options should have properties for current adapter, e.g. withRelated for Bookshelf. How?
export const detail = async <A extends Record<string, Attribute>>(model: Model<A>, filter?: any, options?: any): Promise<Attributes2Entity<A>> => {
    // TODO DB Limit 1
    const result = await bookshelfUtil.queryModel(model.getBookshelfModel(), filter, options)
        .fetchAll(options);
    return bookshelfUtil.serializer(options)(result);
};

export const createModel = <A extends Record<string, Attribute>>(options: ModelOptions<A>): Model<A> => {
    const getBookshelfModel: () => any /* TODO Type */ = memoize(() => bookshelfUtil.createModel(options));
    const attributeNames = Object.keys(options.attributes);
    return {
        options,
        getBookshelfModel,
        attributeNames,
    };
};
