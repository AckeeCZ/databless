import connect from 'knex';
import * as repository from '../lib/repository';

describe('Model types', () => {
    const knex = connect({ client: 'sqlite3', connection: ':memory:', pool: { min: 1, max: 1 }, debug: false });
    const whiskerModel = repository.createModel({
        adapter: () => knex,
        collectionName: 'whiskers',
        attributes: {
            length: { type: 'number' },
            color: { type: 'string' },
            cat_id: { type: 'number' },
        },
    });
    const catModel = repository.createModel({
        adapter: () => knex,
        attributes: {
            name: { type: 'string' },
            paws: { type: 'number' },
            birthDate: { type: 'date' },
            isNice: { type: 'bool' },
            color: { type: 'object', deserialize: (c): 'black' | 'white' => c },
            jsonCat: { type: 'object', serialize: cat => JSON.stringify(cat), deserialize: (cat: any): {
                id?: string
                name: string
            } => JSON.parse(cat) },
            whiskers: {
                type: 'relation',
                relation: repository.bookshelfRelation.createHasOne({
                    // foreignKey: 'cat_id',
                }),
                targetModel: () => whiskerModel,
            },
        },
        collectionName: 'cats',
    });
    const whiskerRelation = {
        type: 'relation',
        relation: repository.bookshelfRelation.createHasOne({
            // foreignKey: 'cat_id',
        }),
        targetModel: () => whiskerModel as any,
    };
    type test = repository.AttributeRelation2Type<typeof whiskerRelation>;
    type Cat = repository.Model2Entity<typeof catModel>;
});
