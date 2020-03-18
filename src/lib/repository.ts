import Knex from 'knex';
import { pick } from 'lodash';
import * as bookshelfUtil from './bookshelfUtil';

type Primitive = 'string' | 'number' | 'date' | 'bool' | 'object';
type PrimitiveToType<P> = P extends 'string' ? string : P extends 'date' ? Date : P extends 'number' ? number : P extends 'bool' ? boolean : P extends 'object' ? any : never;

type AttributeRelation2Type<P> = P extends AttributeRelation<infer M> ? CreateEntity<M['options']['attributes']> : never;
type Attribute2Type<P> = P extends AttributeRelation<infer M> ? AttributeRelation2Type<M> : P extends { deserialize: (x: any) => infer R } ? R : P extends { type: infer X } ? PrimitiveToType<X> : never;
type Attribute = AttributeRelation | { type: Primitive | 'relation', serialize?: (x: any) => PrimitiveToType<Primitive>, deserialize?: (x: any) => any };
export type AttributeRelation<M extends Model = any> = {
    type: 'relation',
    targetModel: () => M,
    relation: bookshelfUtil.BookshelfRelation,
}
export type CreateEntity<A extends Record<string, Attribute>> = { [key in keyof A]: A[key] extends Attribute ? Attribute2Type<A[key]> : never };
export type Model2Entity<M extends Model> = CreateEntity<M['options']['attributes']>;

export interface ModelOptions {
    adapter: Knex
    collectionName: string
    attributes: Record<string, Attribute>
}

interface Model<O extends ModelOptions> {
    bookshelfModel: any
    attributeNames: string[]
    options: O
}

export const bookshelfRelation = bookshelfUtil.bookshelfRelation;

export const create = async <T extends ModelOptions>(model: Model<T>, data: any /* TODO Type */, options?: any /* TODO Type */) => {
    const result = await (new model.bookshelfModel())
        .save(pick(data, model.attributeNames), options);
    return bookshelfUtil.serializer(options)(result);
};

export const list = async <T extends ModelOptions>(model: Model<T>, filter?: any, options?: any) => {
    const result = await bookshelfUtil.queryModel(model.bookshelfModel, filter, options);
    return bookshelfUtil.serializer(options)(result);
}

export const detail = async <T extends ModelOptions>(model: Model<T>, filter?: any, options?: any) => {
    // TODO DB Limit 1
    const result = await bookshelfUtil.queryModel(model.bookshelfModel, filter, options)
        .fetchAll(options);
    return bookshelfUtil.serializer(options)(result);
};

export const createModel = <O extends ModelOptions>(options: O): Model<O> => {
    const bookshelfModel: any /* TODO Type */ = bookshelfUtil.createModel(options);
    const attributeNames = Object.keys(options.attributes);
    return {
        options,
        bookshelfModel,
        attributeNames,
    };
};
