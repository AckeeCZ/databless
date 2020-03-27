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
                }
            `);
        });
    });
    describe('Property serialization', () => {
        let knex: Knex;
        const model = repository.createModel({
            adapter: () => knex,
            collectionName: 'model',
            attributes: {
                id: { type: 'number' },
                objectStoredAsJson: {
                    type: 'string',
                    serialize: x => JSON.stringify(x || null),
                    deserialize: x => JSON.parse(x),
                },
            },
        });
        let record: repository.Model2Entity<typeof model>;
        beforeAll(async () => {
            knex = await db.reset();
            await db.createTable(model);
            record = await repository.create(model, {});
        });
        test('Save undefined, get null', async () => {
            const object = undefined;
            await repository.update(model, { id: record.id }, { id: record.id, objectStoredAsJson: object });
            const result = await repository.detail(model, { id: record.id });
            expect(result.objectStoredAsJson).toEqual(null);
        });
        test('Save null, get null', async () => {
            const object = null;
            await repository.update(model, { id: record.id }, { id: record.id, objectStoredAsJson: object });
            const result = await repository.detail(model, { id: record.id });
            expect(result.objectStoredAsJson).toEqual(null);
        });
        test('Save object, get object', async () => {
            const object = { foo: 'bar' };
            await repository.update(model, { id: record.id }, { id: record.id, objectStoredAsJson: object });
            const result = await repository.detail(model, { id: record.id });
            expect(result.objectStoredAsJson).toMatchObject(object);
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
        describe('Order', () => {
            const byProp = (prop: string) => (a: any, b: any) => (typeof a === 'string' ? a.localeCompare(b) : a[prop] - b[prop]);
            const omitId = (a: any) => { const {id, ...rest} = a; return rest };
            test('Order string', async () => {
                const result = await repository.list(model, {}, { order: 'string' });
                const resultPlus = await repository.list(model, {}, { order: '+string' });
                expect(result).toStrictEqual(resultPlus)
                expect(result.map(omitId)).toStrictEqual([...inputData].sort(byProp('string')));
            });
            test('Order -string', async () => {
                const result = await repository.list(model, {}, { order: '-string' });
                expect(result.map(omitId)).toStrictEqual([...inputData].sort(byProp('string')).reverse());
            });
            test('Order number', async () => {
                const result = await repository.list(model, {}, { order: 'number' });
                const resultPlus = await repository.list(model, {}, { order: '+number' });
                expect(result).toStrictEqual(resultPlus)
                expect(result.map(omitId)).toStrictEqual([...inputData].sort(byProp('number')));
            });
            test('Order -number', async () => {
                const result = await repository.list(model, {}, { order: '-number' });
                expect(result.map(omitId)).toStrictEqual([...inputData].sort(byProp('number')).reverse());
            });
            test('Order by multiple', async () => {
                const result = await repository.list(model, {}, { order: ['-number', 'string'] });
                expect(result.map(omitId)).toStrictEqual([...inputData].sort(byProp('number')).reverse().sort(byProp('string')));
            });
        })
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
            expect(result.hasManyRelation.length)
                .toBeGreaterThanOrEqual(1);
            result.hasManyRelation
                .forEach(relation => {
                    expect(relation.id).toBeDefined();
                    expect(relation.model_id).toEqual(result.id);
                });
        });
        test('Fetch with related models (reflexive)', async () => {
            const result = await repository.detail(model, { id: motherRecord.id }, { withRelated: ['hasManyRelationReflexive'] });
            expect(result.hasManyRelationReflexive.length)
                .toBeGreaterThanOrEqual(1);
            result.hasManyRelationReflexive
                .forEach(relation => {
                    expect(relation.id).toBeDefined();
                    expect(relation.model_id).toEqual(result.id);
                });
        });
    });
    describe('model-belongsTo', () => {
        let knex: Knex;
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
    describe('model-belongsToMany', () => {
        let knex: Knex;
        const accountModel = repository.createModel({
            adapter: () => knex,
            collectionName: 'accounts',
            attributes: {
                id: { type: 'number' },
                users: {
                    type: 'relation',
                    //  TODO Circular reference type problem. But works in JS
                    targetModel: () => userModel,
                    relation: repository.bookshelfRelation.createBelongsToMany(),
                } as any,
            },
        });
        const userModel = repository.createModel({
            adapter: () => knex,
            collectionName: 'users',
            attributes: {
                id: { type: 'number' },
                friends: {
                    type: 'relation',
                    targetModel: 'self',
                    relation: repository.bookshelfRelation.createBelongsToMany({
                        foreignKey: 'user_a_id',
                        otherKey: 'user_b_id',
                    }),
                },
                accounts: {
                    type: 'relation',
                    targetModel: () => accountModel,
                    relation: repository.bookshelfRelation.createBelongsToMany(),
                },
            },
        });
        // Defined for the Migration util to create the table
        const usersAccountsModel = repository.createModel({
            adapter: () => knex,
            collectionName: 'accounts_users',
            attributes: {
                account_id: { type: 'number' },
                user_id: { type: 'number' },
            },
        });
        const usersUsersModel = repository.createModel({
            adapter: () => knex,
            collectionName: 'users_users',
            attributes: {
                user_a_id: { type: 'number' },
                user_b_id: { type: 'number' },
            },
        });
        let abigail: repository.Model2Entity<typeof userModel>;
        let betsy: repository.Model2Entity<typeof userModel>;
        let abigailsAccount1: repository.Model2Entity<typeof accountModel>;
        let abigailsAccount2: repository.Model2Entity<typeof accountModel>;
        beforeAll(async () => {
            knex = await db.reset();
            await db.createTable(userModel);
            await db.createTable(accountModel);
            await db.createTable(usersAccountsModel);
            await db.createTable(usersUsersModel);
            abigail = await repository.create(userModel, {});
            betsy = await repository.create(userModel, {});
            abigailsAccount1 = await repository.create(accountModel, {});
            abigailsAccount2 = await repository.create(accountModel, {});
            await Promise.all([
                [abigail, abigailsAccount1],
                [abigail, abigailsAccount2],
            ]
                .map(([user, account]) =>
                    repository.create(usersAccountsModel, { user_id: user.id, account_id: account.id })
                )
            );
            repository.create(usersUsersModel, { user_a_id: abigail.id, user_b_id: betsy.id });
        });
        test('Fetch with related models', async () => {
            const result = await repository.detail(userModel, { id: abigail.id }, { withRelated: ['accounts'] });
            [abigailsAccount1, abigailsAccount2]
                .forEach(account => {
                    expect(!!result.accounts.find(acc => acc.id === account.id)).toEqual(true);
                });
        });
        test('Fetch with related models (reflexive', async () => {
            const result = await repository.detail(userModel, { id: abigail.id }, { withRelated: ['friends'] });
            [betsy]
                .forEach(user => {
                    expect(!!result.friends.find(friend => friend.id === user.id)).toEqual(true);
                });
        });
    });
});
