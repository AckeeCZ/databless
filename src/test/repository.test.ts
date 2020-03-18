import connect from 'knex';
import * as repository from '../lib/repository';

describe('Repository (Knex)', () => {
    const knex = connect({ client: 'sqlite3', connection: ':memory:', pool: { min: 1, max: 1 }, debug: false });
    const whiskerModel = repository.createModel({
        adapter: knex,
        collectionName: 'whiskers',
        attributes: {
            length: { type: 'number' },
            color: { type: 'string' },
            cat_id: { type: 'number' },
        },
    });
    const catModel = repository.createModel({
        adapter: knex,
        attributes: {
            name: {
                type: 'string',
            },
            mainWhisker: {
                type: 'relation',
                relation: repository.bookshelfRelation.createHasOne({
                    foreignKey: 'cat_id',
                }),
                targetModel: () => whiskerModel,
            },
        },
        collectionName: 'cats',
    });
    beforeAll(async () => {
        // Make sure it works
        await knex.raw('select 1');
        // Run migrations
        await knex.schema.createTable('cats', table => {
            table.bigIncrements('id').primary();
            table.string('name');
        });
        await knex.schema.createTable('whiskers', table => {
            table.bigIncrements('id').primary();
            table.decimal('length');
            table.string('color');
            table.bigInteger('cat_id').references('cats.id');
        });
    });
    afterAll(async () => {
        await knex.destroy();
    });
    test('Create', async () => {
        const result = await repository.create(catModel, { name: 'Fluffy' });
        expect(result).toMatchInlineSnapshot(`
            Object {
              "id": 1,
              "name": "Fluffy",
            }
        `);
    });
    describe('Relation hasOne', () => {
        let cat: any; // TODO Type
        let whisker: any; // TODO Type
        beforeAll(async () => {
            cat = await repository.create(catModel, { name: 'Fluffy' });
            whisker = await repository.create(whiskerModel, { length: 10, cat_id: cat.id });
        });
        it('Fetch using withRelated', async () => {
            const populatedCat = await repository.detail(catModel, { id: cat.id }, { withRelated: ['mainWhisker'] });
            expect(populatedCat).toMatchInlineSnapshot(`
Array [
  Object {
    "id": 2,
    "mainWhisker": Object {
      "cat_id": 2,
      "color": null,
      "id": 1,
      "length": 10,
    },
    "name": "Fluffy",
  },
]
`);
        });
    });
});
