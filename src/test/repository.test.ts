import { default as connect, default as Knex } from 'knex';
import * as repository from '../lib/repository';

const db = (() => {
    let knex: ReturnType<typeof connect>;

    /**
     * Dummy migration runner for a model
     * - PRIMARY KEY - attribute `id` is always set as BigInt Primary key
     * @param model repository.Model
     */
    const createTable = async (model: repository.Model) => {
        // TODO Cast needed, model.options is any
        const modelOptions = model.options;
        await knex.schema.createTable(modelOptions.collectionName, table => {
            Array.from(Object.entries(modelOptions.attributes)).forEach(([name, attribute]) => {
                if (name === 'id') {
                    table.bigIncrements(name).primary();
                    return;
                }
                switch (attribute.type) {
                    case 'string':
                        table.string(name);
                        break;
                    case 'bool':
                        table.boolean(name);
                        break;
                    case 'date':
                        table.dateTime(name);
                        break;
                    case 'number':
                        table.decimal(name);
                        break;
                    case 'object':
                        table.jsonb(name);
                        break;
                    case 'relation':
                        break;
                    default:
                        throw new TypeError('Invalid type');
                }
            });
        });
    };
    const reset = async (): Promise<Knex> => {
        if (knex) {
            await knex.destroy();
            knex = undefined as any;
        }
        knex = connect({ client: 'sqlite3', connection: ':memory:', pool: { min: 1, max: 1 }, debug: false });
        return knex as any;
    };
    const disconnect = async () => {
        await knex.destroy();
    };
    return {
        reset,
        disconnect,
        createTable,
    };
})();

describe('Repository (Knex/Bookshelf)', () => {
    afterAll(async () => {
        await db.disconnect();
    });
    describe('Single model create', () => {
        let knex: Knex;
        const model = repository.createModel({
            adapter: () => knex,
            collectionName: 'model',
            attributes: {
                id: { type: 'number' },
                string: { type: 'string' },
            },
        });
        beforeAll(async () => {
            knex = await db.reset();
            await db.createTable(model);
        });
        test('Create with no data creates only automatically set fields', async () => {
            const result = await repository.create(model, {});
            expect(result).toMatchInlineSnapshot(`
                Object {
                  "id": 1,
                  "string": null,
                }
            `);
        });
        test('Create sets given fields', async () => {
            const result = await repository.create(model, { string: 'stringValue' });
            expect(result).toMatchInlineSnapshot(`
                Object {
                  "id": 2,
                  "string": "stringValue",
                }
            `);
        });
        test('Create ignores columns not set in attributes', async () => {
            const result = await repository.create(model, { nonExisting: 'stringValue' });
            expect(result).toMatchInlineSnapshot(`
                Object {
                  "id": 3,
                  "string": null,
                }
            `);
        });
    });
    describe('Single model update', () => {
        let knex: Knex;
        const model = repository.createModel({
            adapter: () => knex,
            collectionName: 'model',
            attributes: {
                id: { type: 'number' },
                string: { type: 'string' },
                string2: { type: 'string' },
            },
        });
        let record: repository.Model2Entity<typeof model>;
        beforeAll(async () => {
            knex = await db.reset();
            await db.createTable(model);
            record = await repository.create(model, {});
        });
        test('Empty update does nothing (empty object)', async () => {
            const before = await repository.detail(model, { id: record.id });
            await repository.update(model, { id: record.id }, {});
            const after = await repository.detail(model, { id: record.id });
            expect(after).toMatchObject(before);
        });
        test('Empty update does nothing (undefined)', async () => {
            const before = await repository.detail(model, { id: record.id });
            await repository.update(model, { id: record.id });
            const after = await repository.detail(model, { id: record.id });
            expect(after).toMatchObject(before);
        });
        test('Multifield update', async () => {
            const before = await repository.detail(model, { id: record.id });
            await repository.update(model, { id: record.id }, { string: 'stringupdated', string2: 'string2updated' });
            const after = await repository.detail(model, { id: record.id });
            expect(after).toMatchObject({ ...before, string: 'stringupdated', string2: 'string2updated' });
        });
    });
    describe('Single model read', () => {
        let knex: Knex;
        const model = repository.createModel({
            adapter: () => knex,
            collectionName: 'model',
            attributes: {
                id: { type: 'number' },
                string: { type: 'string' },
                number: { type: 'number' },
            },
        });
        const inputData = [
            {
                string: 'abcdefg',
                number: -10,
            },
            {
                string: 'hijklmn',
                number: 10,
            },
        ];
        beforeAll(async () => {
            knex = await db.reset();
            await db.createTable(model);
            await Promise.all(
                inputData.map(data => repository.create(model, data))
            );
        });
        test('No params means no filtering', async () => {
            const result = await repository.list(model);
            expect(result.length).toEqual(inputData.length);
        });
        test('Exact match filtering', async () => {
            const filter = { number: 10, string: 'hijklmn' };
            const results = await repository.list(model, filter);
            results.forEach(result => {
                expect(result).toMatchObject(filter);
            });
        });
        test('Count using filters', async () => {
            const filter = { number: 10, string: 'hijklmn' };
            const result = await repository.list(model, filter, { count: true });
            expect(result).toEqual(
                inputData
                    .filter(data => (data.number === filter.number))
                    .filter(data => (data.string === filter.string))
                    .length
            );
        });
    });
    describe('model-hasOne', () => {
        let knex: Knex;
        const relatedModel = repository.createModel({
            adapter: () => knex,
            collectionName: 'related_model',
            attributes: {
                id: { type: 'number' },
                model_id: { type: 'number' },
            },
        });
        const model = repository.createModel({
            adapter: () => knex,
            collectionName: 'model',
            attributes: {
                id: { type: 'number' },
                hasOneRelationReflexive: {
                    type: 'relation',
                    targetModel: 'self',
                    relation: repository.bookshelfRelation.createHasOne({
                        foreignKey: 'id',
                    }),
                },
                hasOneRelation: {
                    type: 'relation',
                    targetModel: () => relatedModel,
                    relation: repository.bookshelfRelation.createHasOne(),
                },
            },
        });
        beforeAll(async () => {
            knex = await db.reset();
            await db.createTable(model);
            await db.createTable(relatedModel);
            const modelRecord = await repository.create(model, {});
            await repository.create(relatedModel, { model_id: modelRecord.id });
        });
        test('Default fetch is without relations', async () => {
            const results = await repository.list(model);
            expect(results.length).toBeGreaterThan(0);
            results.forEach(result => {
                expect(result.hasOneRelation).toEqual(undefined);
            });
        });

        // TODO relation named `hasOne` fails due to recursive call, preferring
        // attribute over bookshelf.prototype.hasOne

        test('Fetch with related model', async () => {
            const results = await repository.list(model, {}, { withRelated: ['hasOneRelation'] });
            const relatedEntity = (await repository.list(relatedModel))[0];
            expect(results.length).toBeGreaterThan(0);
            results.forEach(result => {
                expect(result.hasOneRelation.id).toEqual(relatedEntity.id);
            });
        });

        test('Fetch with related model (reflexive)', async () => {
            const results = await repository.list(model, {}, { withRelated: ['hasOneRelationReflexive'] });
            expect(results.length).toBeGreaterThan(0);
            results.forEach(result => {
                expect(result.hasOneRelationReflexive.id).toEqual(result.id);
            });
        });
    });
    describe('model-hasMany', () => {
        let knex: Knex;
        const relatedModel = repository.createModel({
            adapter: () => knex,
            collectionName: 'related_model',
            attributes: {
                id: { type: 'number' },
                model_id: { type: 'number' },
            },
        });
        const model = repository.createModel({
            adapter: () => knex,
            collectionName: 'model',
            attributes: {
                id: { type: 'number' },
                hasManyRelationReflexive: {
                    type: 'relation',
                    targetModel: 'self',
                    relation: repository.bookshelfRelation.createHasMany({
                        foreignKey: 'id',
                    }),
                },
                hasManyRelation: {
                    type: 'relation',
                    targetModel: () => relatedModel,
                    relation: repository.bookshelfRelation.createHasMany(),
                },
            },
        });
        beforeAll(async () => {
            knex = await db.reset();
            await db.createTable(model);
            await db.createTable(relatedModel);
            const modelRecord = await repository.create(model, {});
            await repository.create(relatedModel, { model_id: modelRecord.id });
            await repository.create(relatedModel, { model_id: modelRecord.id });
        });
        test('Fetch with related models', async () => {
            const results = await repository.list(model, {}, { withRelated: ['hasManyRelation'] });
            expect(results.length).toBeGreaterThan(0);
            results.forEach(result => {
                expect((result.hasManyRelation as any as Array<any> /* TODO Remove when types are fixed */).length)
                    .toBeGreaterThanOrEqual(1);
                (result.hasManyRelation as any as Array<any> /* TODO Remove when types are fixed */)
                    .forEach(relation => {
                        expect(relation.id).toBeDefined();
                        expect(relation.model_id).toEqual(result.id);
                    });
            });
        });

        test.skip('Fetch with related models (reflexive)', async () => {
            // TODO
        });
    });
    //     const ;
    //     const reset = async () => {
    //         if (knex) {
    //             await knex.destroy();
    //             knex = undefined as any;
    //         }
    //         knex = connect({ client: 'sqlite3', connection: ':memory:', pool: { min: 1, max: 1 }, debug: false });
    //     };

    //     const whiskerModel = repository.createModel({
    //         adapter: knex,
    //         collectionName: 'whiskers',
    //         attributes: {
    //             length: { type: 'number' },
    //             color: { type: 'string' },
    //             cat_id: { type: 'number' },
    //         },
    //     });
    //     const catModel = repository.createModel({
    //         adapter: knex,
    //         attributes: {
    //             name: {
    //                 type: 'string',
    //             },
    //             mainWhisker: {
    //                 type: 'relation',
    //                 relation: repository.bookshelfRelation.createHasOne({
    //                     foreignKey: 'cat_id',
    //                 }),
    //                 targetModel: () => whiskerModel,
    //             },
    //         },
    //         collectionName: 'cats',
    //     });
    //     beforeAll(async () => {
    //         // Make sure it works
    //         await knex.raw('select 1');
    //         // Run migrations
    //         await knex.schema.createTable('cats', table => {
    //             table.bigIncrements('id').primary();
    //             table.string('name');
    //         });
    //         await knex.schema.createTable('whiskers', table => {
    //             table.bigIncrements('id').primary();
    //             table.decimal('length');
    //             table.string('color');
    //             table.bigInteger('cat_id').references('cats.id');
    //         });
    //     });
    //     afterAll(async () => {
    //         await knex.destroy();
    //     });
    //     test('Create', async () => {
    //         const result = await repository.create(catModel, { name: 'Fluffy' });
    //         expect(result).toMatchInlineSnapshot(`
    //             Object {
    //               "id": 1,
    //               "name": "Fluffy",
    //             }
    //         `);
    //     });
    //     describe('Relation hasOne', () => {
    //         let cat: any; // TODO Type
    //         let whisker: any; // TODO Type
    //         beforeAll(async () => {
    //             cat = await repository.create(catModel, { name: 'Fluffy' });
    //             whisker = await repository.create(whiskerModel, { length: 10, cat_id: cat.id });
    //         });
    //         it('Fetch using withRelated', async () => {
    //             const populatedCat = await repository.detail(catModel, { id: cat.id }, { withRelated: ['mainWhisker'] });
    //             expect(populatedCat).toMatchInlineSnapshot(`
    // Array [
    //   Object {
    //     "id": 2,
    //     "mainWhisker": Object {
    //       "cat_id": 2,
    //       "color": null,
    //       "id": 1,
    //       "length": 10,
    //     },
    //     "name": "Fluffy",
    //   },
    // ]
    // `);
    //         });
    //     });
});
