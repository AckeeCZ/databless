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
        knex = connect({ client: 'sqlite3', connection: ':memory:', pool: { min: 1, max: 1 }, debug: true });
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
                model_id: { type: 'number' },
                hasManyRelationReflexive: {
                    type: 'relation',
                    targetModel: 'self',
                    relation: repository.bookshelfRelation.createHasMany({
                        foreignKey: 'model_id',
                    }),
                },
                hasManyRelation: {
                    type: 'relation',
                    targetModel: () => relatedModel,
                    relation: repository.bookshelfRelation.createHasMany(),
                },
            },
        });
        let motherRecord: repository.Model2Entity<typeof model>;
        beforeAll(async () => {
            knex = await db.reset();
            await db.createTable(model);
            await db.createTable(relatedModel);
            motherRecord = await repository.create(model, {});
            await Promise.all([
                repository.create(model, { model_id: motherRecord.id }),
                repository.create(model, { model_id: motherRecord.id }),
                repository.create(relatedModel, { model_id: motherRecord.id }),
                repository.create(relatedModel, { model_id: motherRecord.id }),
            ]);
        });
        test('Fetch with related models', async () => {
            const result = await repository.detail(model, { id: motherRecord.id }, { withRelated: ['hasManyRelation'] });
            expect((result.hasManyRelation as any as Array<any> /* TODO Remove when types are fixed */).length)
                .toBeGreaterThanOrEqual(1);
            (result.hasManyRelation as any as Array<any> /* TODO Remove when types are fixed */)
                .forEach(relation => {
                    expect(relation.id).toBeDefined();
                    expect(relation.model_id).toEqual(result.id);
                });
        });
        test('Fetch with related models (reflexive)', async () => {
            const result = await repository.detail(model, { id: motherRecord.id }, { withRelated: ['hasManyRelationReflexive'] });
            expect((result.hasManyRelationReflexive as any as Array<any> /* TODO Remove when types are fixed */).length)
                .toBeGreaterThanOrEqual(1);
            (result.hasManyRelationReflexive as any as Array<any> /* TODO Remove when types are fixed */)
                .forEach(relation => {
                    expect(relation.id).toBeDefined();
                    expect(relation.model_id).toEqual(result.id);
                });
        });
    });
    describe('model-belongsTo', () => {
        let knex: Knex;
        // TODO Save for belongsToMany
        // Defined for the Migration util to create the table
        // const joinModel = repository.createModel({
        //     adapter: () => knex,
        //     collectionName: 'model_related_model',
        //     attributes: {
        //         model_id: { type: 'number' },
        //         related_model_id: { type: 'number' },
        //     },
        // });
        const authorModel = repository.createModel({
            adapter: () => knex,
            collectionName: 'authors',
            attributes: {
                id: { type: 'number' },
            },
        });
        const bookModel = repository.createModel({
            adapter: () => knex,
            collectionName: 'books',
            attributes: {
                id: { type: 'number' },
                author_id: { type: 'number' },
                next_book_id: { type: 'number' },
                nextBook: {
                    type: 'relation',
                    targetModel: 'self',
                    relation: repository.bookshelfRelation.createBelongsTo({
                        foreignKey: 'next_book_id',
                    }),
                },
                author: {
                    type: 'relation',
                    targetModel: () => authorModel,
                    relation: repository.bookshelfRelation.createBelongsTo(),
                },
            },
        });
        let book: repository.Model2Entity<typeof bookModel>;
        let author: repository.Model2Entity<typeof authorModel>;
        beforeAll(async () => {
            knex = await db.reset();
            await db.createTable(bookModel);
            await db.createTable(authorModel);
            author = await repository.create(authorModel, {});
            book = await repository.create(bookModel, { author_id: author.id });
            await repository.update(bookModel, { id: book.id }, { next_book_id: book.id });
            book = await repository.detail(bookModel, { id: book.id });
        });
        test('Fetch with related models', async () => {
            const result = await repository.detail(bookModel, { id: book.id }, { withRelated: ['author'] });
            expect(result.author).toMatchObject(author);
        });
        test('Fetch with related models (reflexive)', async () => {
            const result = await repository.detail(bookModel, { id: book.id }, { withRelated: ['nextBook'] });
            expect(result.nextBook).toMatchObject(book);
        });
    });
});
