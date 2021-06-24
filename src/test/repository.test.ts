import { Knex } from 'knex';
import * as repository from '../lib/repository';
import createDatabase from './knexDatabase';

const db = createDatabase({ debug: false });

type IdStringEntity = {
    id: number;
    string: string;
};

describe('Repository (Knex/Bookshelf)', () => {
    afterAll(async () => {
        await db.disconnect();
    });
    describe('Single model create', () => {
        let knex: Knex;
        const model = repository.createModel<IdStringEntity>({
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
            const data = { nonExisting: 'stringValue' } as Partial<IdStringEntity>;
            const result = await repository.create(model, data);
            expect(result).toMatchInlineSnapshot(`
                Object {
                  "id": 3,
                }
            `);
        });
    });
    describe('Repository', () => {
        let knex: Knex;
        const model = repository.createModel<IdStringEntity>({
            adapter: () => knex,
            collectionName: 'model',
            attributes: {
                id: { type: 'number' },
                string: { type: 'string' },
            },
        });
        let repo: ReturnType<typeof repository.createRepository>;
        beforeAll(async () => {
            knex = await db.reset();
            await db.createTable(model);
            // TODO Type. This is ok, but `repo` type above cannot be made with ReturnType (looses generics)
            repo = repository.createRepository(model as any);
        });
        it('create', async () => {
            await repo.create({});
        });
        it('update', async () => {
            const created = await repository.create(model, {});
            await repo.update({ id: created.id }, { string: `updated(${created.string})` });
        });
        it('delete', async () => {
            const created = await repository.create(model, {});
            await repo.delete({ id: created.id });
        });
        it('list', async () => {
            await repo.list();
        });
        it('detail', async () => {
            const created = await repository.create(model, {});
            await repo.detail({ id: created.id });
        });
        it('createBulk', async () => {
            await repo.createBulk([{}]);
        });
    });
    describe('Property serialization', () => {
        let knex: Knex;
        type SerializationEntity = { id: number, objectStoredAsJson: any }
        const model = repository.createModel<SerializationEntity>({
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
        let record: SerializationEntity;
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
    describe('Delete', () => {
        let knex: Knex;
        type Entity = { id: number }
        let model: repository.Model<Entity>;
        let record1: Entity;
        let record2: Entity;
        beforeEach(async () => {
            knex = await db.reset();
            model = repository.createModel({
                adapter: () => knex,
                collectionName: 'model',
                attributes: {
                    id: { type: 'number' },
                },
            });
            await db.createTable(model);
            record1 = await repository.create(model, {});
            record2 = await repository.create(model, {});
        });
        test('Delete where', async () => {
            const before1 = await repository.detail(model, { id: record1.id });
            await repository.delete(model, { id: record1.id }, {});
            const after1 = await repository.detail(model, { id: record1.id });
            const after2 = await repository.detail(model, { id: record2.id });
            expect(before1).toBeTruthy();
            expect(after1).toEqual(undefined);
            expect(after2).toBeTruthy();
        });
        test('Delete all', async () => {
            const before = await repository.detail(model, { id: record2.id });
            await repository.delete(model, {});
            const after = await repository.detail(model, { id: record2.id });
            expect(before).toBeTruthy();
            expect(after).toEqual(undefined);
        });
        test('Accidental delete-all throws an error', async () => {
            try {
                await repository.delete(model, { id: undefined });
            } catch (error) {
                return;
            }
            throw new Error('Should throw an error');
        });
    });
    describe('Single model update', () => {
        let knex: Knex;
        type Entity = IdStringEntity & { string2: string }
        const model = repository.createModel<Entity>({
            adapter: () => knex,
            collectionName: 'model',
            attributes: {
                id: { type: 'number' },
                string: { type: 'string' },
                string2: { type: 'string' },
            },
        });
        let record: Entity;
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
        test('Update ignores attributes not defined on the model', async () => {
            const before = await repository.detail(model, { id: record.id });
            await repository.update(model, { id: record.id }, { string: 'stringupdated', string2: 'string2updated', stringX: 'x' } as any);
            const after = await repository.detail(model, { id: record.id });
            expect(after).toMatchObject({ ...before, string: 'stringupdated', string2: 'string2updated' });
        });
        test('Update ignores undefined values', async () => {
            const before = await repository.detail(model, { id: record.id });
            await repository.update(model, { id: record.id }, { string: undefined });
            const after = await repository.detail(model, { id: record.id });
            expect(after).toMatchObject(before);
        });
    });
    describe('Single model read', () => {
        let knex: Knex;
        type Entity = { id: number, string: string, number: number }
        const model = repository.createModel<Entity, {}>({
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
            await Promise.all(inputData.map(data => repository.create(model, data)));
        });
        describe('Order', () => {
            const byProp = (prop: string) => (a: any, b: any) =>
                typeof a === 'string' ? a.localeCompare(b) : a[prop] - b[prop];
            const omitId = (a: any) => {
                const { id, ...rest } = a;
                return rest;
            };
            test('Order string', async () => {
                const result = await repository.list(model, {}, { order: 'string' });
                const resultPlus = await repository.list(model, {}, { order: '+string' as any });
                expect(result).toStrictEqual(resultPlus);
                expect(result.map(omitId)).toStrictEqual([...inputData].sort(byProp('string')));
            });
            test('Order -string', async () => {
                const result = await repository.list(model, {}, { order: '-string' as any });
                expect(result.map(omitId)).toStrictEqual([...inputData].sort(byProp('string')).reverse());
            });
            test('Order number', async () => {
                const result = await repository.list(model, {}, { order: 'number' });
                const resultPlus = await repository.list(model, {}, { order: '+number' as any });
                expect(result).toStrictEqual(resultPlus);
                expect(result.map(omitId)).toStrictEqual([...inputData].sort(byProp('number')));
            });
            test('Order -number', async () => {
                const result = await repository.list(model, {}, { order: '-number' as any });
                expect(result.map(omitId)).toStrictEqual([...inputData].sort(byProp('number')).reverse());
            });
            test('Order by multiple', async () => {
                const result = await repository.list(model, {}, { order: ['-number' as any, 'string'] });
                expect(result.map(omitId)).toStrictEqual(
                    [...inputData]
                        .sort(byProp('number'))
                        .reverse()
                        .sort(byProp('string'))
                );
            });
            test('Order by invalid key is ignored', async () => {
                await repository.list(model, {}, { order: 'whoppity-whoppity-invalid-property' as any });
            });
        });
    });
    describe('Inequality filtering', () => {
        let knex: Knex;
        type Entity = { id: number, name: string, notAge: number }
        const model = repository.createModel<Entity>({
            adapter: () => knex,
            collectionName: 'model',
            attributes: {
                id: { type: 'number' },
                name: { type: 'string' },
                notAge: { type: 'number' },
            },
        });
        let users: Entity[];
        beforeAll(async () => {
            knex = await db.reset();
            await db.createTable(model);
            await Promise.all(
                [
                    { name: 'abigail', notAge: 1 },
                    { name: 'betsy', notAge: 2 },
                    { name: 'catherine', notAge: 3 },
                    { name: 'deborah', notAge: 4 },
                ].map(user => repository.create(model, user))
            );
            users = await repository.list(model);
        });
        it('`Greater than ({ age: ">1" }` => `age > "1"`)', async () => {
            const threshold = 2;
            const expectedResult = users.filter(user => user.notAge > threshold);
            const result = await repository.list(model, { notAge: `>${threshold}` as any /* TODO Type. Oops. */ });
            expect(result).toEqual(expectedResult);
        });
        it('`Greater or equal than ({ age: ">=1" }` => `age >= "1"`)', async () => {
            const threshold = 2;
            const expectedResult = users.filter(user => user.notAge >= threshold);
            const result = await repository.list(model, { notAge: `>=${threshold}` as any /* TODO Type. Oops. */ });
            expect(result).toEqual(expectedResult);
        });
        it('`Less than ({ age: "<1" }` => `age < "1"`)', async () => {
            const threshold = 2;
            const expectedResult = users.filter(user => user.notAge < threshold);
            const result = await repository.list(model, { notAge: `<${threshold}` as any /* TODO Type. Oops. */ });
            expect(result).toEqual(expectedResult);
        });
        it('`Less or equal than ({ age: "<=1" }` => `age <= "1"`)', async () => {
            const threshold = 2;
            const expectedResult = users.filter(user => user.notAge <= threshold);
            const result = await repository.list(model, { notAge: `<=${threshold}` as any /* TODO Type. Oops. */ });
            expect(result).toEqual(expectedResult);
        });
    });
    describe('Searching (like querying)', () => {
        let knex: Knex;
        type IdNameEntity = {
            id: number;
            name: string;
        };

        const model = repository.createModel<IdNameEntity>({
            adapter: () => knex,
            collectionName: 'model',
            attributes: {
                id: { type: 'number' },
                name: { type: 'string' },
            },
        });
        let users: IdNameEntity[];
        beforeAll(async () => {
            knex = await db.reset();
            await db.createTable(model);
            await Promise.all(
                [{ name: 'abigail' }, { name: 'betsy' }, { name: 'catherine' }, { name: 'deborah' }].map(user =>
                    repository.create(model, user)
                )
            );
            users = await repository.list(model);
        });
        test('*abc => `LIKE "%abc"`', async () => {
            const q = 'ine';
            const expectedResult = users.filter(user => new RegExp(`.*${q}$`).test(user.name));
            const result = await repository.list(model, { name: `*${q}` });
            expect(result).toEqual(expectedResult);
        });
        test('abc* => `LIKE "abc%"`', async () => {
            const q = 'abi';
            const expectedResult = users.filter(user => new RegExp(`^${q}.*`).test(user.name));
            const result = await repository.list(model, { name: `${q}*` });
            expect(result).toEqual(expectedResult);
        });
        test('*abc* => `LIKE "%abc%"`', async () => {
            const q = 'bor';
            const expectedResult = users.filter(user => new RegExp(`.*${q}.*`).test(user.name));
            const result = await repository.list(model, { name: `*${q}*` });
            expect(result).toEqual(expectedResult);
        });
    });
    describe('Custom select queries', () => {
        let knex: Knex;
        type IdNameEntity = {
            id: number;
            name: string;
        };
        const model = repository.createModel<IdNameEntity>({
            adapter: () => knex,
            collectionName: 'model',
            attributes: {
                id: { type: 'number' },
                name: { type: 'string' },
            },
        });
        let users: IdNameEntity[];
        beforeAll(async () => {
            knex = await db.reset();
            await db.createTable(model);
            await Promise.all(
                [{ name: 'abigail' }, { name: 'betsy' }, { name: 'catherine' }, { name: 'deborah' }].map(user =>
                    repository.create(model, user)
                )
            );
            users = await repository.list(model);
        });
        test('Custom filtering option`', async () => {
            const threshold = 6;
            const expectedResult = users.filter(user => user.name.length > threshold);
            const result = await repository.list(
                model,
                {},
                {
                    qb: qb => {
                        qb.whereRaw(`LENGTH(name) > ${threshold}`);
                    },
                }
            );
            expect(result).toEqual(expectedResult);
        });
    });
    describe('Relation default custom queries', () => {
        let knex: Knex;
        type Author = { id: number, name: string, books: Book[] }
        type Book = { id: number, author_id: number, type: string}
        const bookModel = repository.createModel<Book>({
            adapter: () => knex,
            collectionName: 'books',
            attributes: {
                id: { type: 'number' },
                author_id: { type: 'number' },
                type: { type: 'string' },
            },
        });
        const authorModel = repository.createModel<Author, { relationKeys: 'books' }>({
            adapter: () => knex,
            collectionName: 'authors',
            attributes: {
                id: { type: 'number' },
                name: { type: 'string' },
                books: {
                    type: 'relation',
                    targetModel: () => bookModel,
                    relation: repository.bookshelfRelation.createHasMany({
                        query: books => books.where({ type: 'programming' }, false),
                    }),
                },
            },
        });
        let author: Author;
        let books: Book[];
        beforeAll(async () => {
            knex = await db.reset();
            await db.createTable(authorModel);
            await db.createTable(bookModel);
            author = await repository.create(authorModel, {});
            await Promise.all([
                repository.create(bookModel, { author_id: author.id, type: 'programming' }),
                repository.create(bookModel, { author_id: author.id, type: 'mathematics' }),
                repository.create(bookModel, { author_id: author.id, type: 'incantation' }),
            ]);
            books = await repository.list(bookModel);
        });
        it('x', async () => {
            const expectedResult = books.filter(book => book.type === 'programming');
            const result = await repository.detail(authorModel, { id: author.id }, { withRelated: ['books'] });
            expect(result.books).toEqual(expectedResult);
        });
    });
    describe('Pagination', () => {
        let knex: Knex;
        const model = repository.createModel<{id: number}>({
            adapter: () => knex,
            collectionName: 'model',
            attributes: {
                id: { type: 'number' },
            },
        });
        const data = '.'
            .repeat(100)
            .split('')
            .map((_, i) => ({ id: i + 1 }));

        beforeAll(async () => {
            knex = await db.reset();
            await db.createTable(model);
            await Promise.all(data.map(d => repository.create(model, { id: d.id })));
        });
        test('No pagination by default', async () => {
            const result = await repository.list(model);
            expect(result.length).toEqual(data.length);
        });
        test('Limit', async () => {
            const limit = 1;
            const result = await repository.list(model, {}, { limit });
            expect(result.length).toEqual(limit);
        });
        test('Offset', async () => {
            const a = await repository.list(model, {});
            const b = await repository.list(model, {}, { limit: 1, offset: 1 });
            expect(a[1]).toMatchObject(b[0]);
        });
        test('offset=0 if missing and limit is set', async () => {
            const a = await repository.list(model, {});
            const b = await repository.list(model, {}, { limit: 10 });
            expect(a[0]).toMatchObject(b[0]);
        });
        test('limit=10 if missing and offset is set', async () => {
            const a = await repository.list(model);
            const b = await repository.list(model, {}, { offset: 10 });
            expect(a.slice(10, 20)).toMatchObject(b);
        });
    });
    describe('model-hasOne', () => {
        let knex: Knex;
        type HealthRecord = { id: number, patient_id: number }
        type Patient = { id: number, clone_of_id: number, clone: Patient, healthRecord: HealthRecord }
        const HealthRecord = repository.createModel<HealthRecord>({
            adapter: () => knex,
            collectionName: 'health_records',
            attributes: {
                id: { type: 'number' },
                patient_id: { type: 'number' },
            },
        });
        const Patient = repository.createModel<Patient, { relationKeys: 'clone' | 'healthRecord' }>({
            adapter: () => knex,
            collectionName: 'patients',
            attributes: {
                id: { type: 'number' },
                clone_of_id: { type: 'number' },
                clone: {
                    type: 'relation',
                    targetModel: 'self',
                    relation: repository.bookshelfRelation.createHasOne({
                        foreignKey: 'clone_of_id',
                    }),
                },
                healthRecord: {
                    type: 'relation',
                    targetModel: () => HealthRecord,
                    relation: repository.bookshelfRelation.createHasOne(),
                },
            },
        });
        let patient: Patient;
        let patient2: Patient;
        beforeAll(async () => {
            knex = await db.reset();
            await db.createTable(Patient);
            await db.createTable(HealthRecord);
            patient = await repository.create(Patient, {});
            patient2 = await repository.create(Patient, { clone_of_id: patient.id });
            await repository.create(HealthRecord, { patient_id: patient.id });
            await repository.create(HealthRecord, { patient_id: patient2.id });
        });
        test('Default fetch is without relations', async () => {
            const results = await repository.list(Patient);
            expect(results.length).toBeGreaterThan(0);
            results.forEach(result => {
                expect(result.healthRecord).toEqual(undefined);
                expect(result.clone).toEqual(undefined);
            });
        });

        // TODO relation named `hasOne` fails due to recursive call, preferring
        // attribute over bookshelf.prototype.hasOne

        test('Fetch with related model', async () => {
            const patients = await repository.list(Patient, {}, { withRelated: ['healthRecord'] });
            const healthRecords = await repository.list(HealthRecord);
            expect(patients.length).toBeGreaterThan(0);
            patients.forEach(result => {
                const healthRecord = healthRecords.find(hc => hc.patient_id === result.id)!;
                expect(result.healthRecord.id).toEqual(healthRecord.id);
            });
        });

        test('Fetch with related model (reflexive)', async () => {
            const results = await repository.list(Patient, {}, { withRelated: ['clone'] });
            expect(results.find(x => x.id === patient.id)!).toMatchObject({
                clone_of_id: null,
                clone: patient2,
            });
            expect(results.find(x => x.id === patient2.id)!).toMatchObject({
                clone_of_id: patient.id,
                clone: {},
            });
        });
    });
    describe('model-hasMany', () => {
        let knex: Knex;
        type RelationModelEntity = {
            id: number, model_id: number
        }
        const relatedModel = repository.createModel<RelationModelEntity, {}>({
            adapter: () => knex,
            collectionName: 'related_model',
            attributes: {
                id: { type: 'number' },
                model_id: { type: 'number' },
            },
        });
        type ModelEntity = {
            id: number, model_id: number, hasManyRelationReflexive: ModelEntity[], hasManyRelation: RelationModelEntity[]
        }
        const model = repository.createModel<ModelEntity, { relationKeys: 'hasManyRelationReflexive' | 'hasManyRelation' }>({
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
        let motherRecord: ModelEntity;
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
            const result = await repository.detail(
                model,
                { id: motherRecord.id },
                { withRelated: ['hasManyRelation'] }
            );
            expect(result.hasManyRelation.length).toBeGreaterThanOrEqual(1);
            result.hasManyRelation.forEach(relation => {
                expect(relation.id).toBeDefined();
                expect(relation.model_id).toEqual(result.id);
            });
        });
        test('Fetch with related models (reflexive)', async () => {
            const result = await repository.detail(
                model,
                { id: motherRecord.id },
                { withRelated: ['hasManyRelationReflexive'] }
            );
            expect(result.hasManyRelationReflexive.length).toBeGreaterThanOrEqual(1);
            result.hasManyRelationReflexive.forEach(relation => {
                expect(relation.id).toBeDefined();
                expect(relation.model_id).toEqual(result.id);
            });
        });
    });
    describe('model-belongsTo', () => {
        let knex: Knex;
        type Author = { id: number }
        type Book = { id: number, author_id: number, next_book_id: number, nextBook: Book, author: Author }
        const authorModel = repository.createModel<Author>({
            adapter: () => knex,
            collectionName: 'authors',
            attributes: {
                id: { type: 'number' },
            },
        });
        const bookModel = repository.createModel<Book, { relationKeys: 'nextBook' | 'author' }>({
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
        let book: Book;
        let author: Author;
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
        type AccountEntity = {id: number, users: UserEntity[]}
        const accountModel: repository.Model<AccountEntity, { relationKeys: 'users' }> = repository.createModel({
            adapter: () => knex,
            collectionName: 'accounts',
            attributes: {
                id: { type: 'number' },
                users: {
                    type: 'relation',
                    targetModel: () => userModel,
                    relation: repository.bookshelfRelation.createBelongsToMany(),
                },
            },
        });
        type UserEntity = {id: number, friends: UserEntity[], accounts: AccountEntity[]}
        const userModel = repository.createModel<UserEntity, { relationKeys: 'friends' | 'accounts' }>({
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
        const usersAccountsModel = repository.createModel<{ account_id: number, user_id: number }>({
            adapter: () => knex,
            collectionName: 'accounts_users',
            attributes: {
                account_id: { type: 'number' },
                user_id: { type: 'number' },
            },
        });
        const usersUsersModel = repository.createModel<{ user_a_id: number, user_b_id: number }>({
            adapter: () => knex,
            collectionName: 'users_users',
            attributes: {
                user_a_id: { type: 'number' },
                user_b_id: { type: 'number' },
            },
        });
        let abigail: UserEntity;
        let betsy: UserEntity;
        let abigailsAccount1: AccountEntity;
        let abigailsAccount2: AccountEntity;
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
            await Promise.all(
                [
                    [abigail, abigailsAccount1],
                    [abigail, abigailsAccount2],
                ].map(([user, account]) =>
                    repository.create(usersAccountsModel, { user_id: user.id, account_id: account.id })
                )
            );
            repository.create(usersUsersModel, { user_a_id: abigail.id, user_b_id: betsy.id });
        });
        test('Fetch with related models', async () => {
            const result = await repository.detail(userModel, { id: abigail.id }, { withRelated: ['accounts'] });
            [abigailsAccount1, abigailsAccount2].forEach(account => {
                expect(!!result.accounts.find(acc => acc.id === account.id)).toEqual(true);
            });
        });
        test('Fetch with related models (reflexive', async () => {
            const result = await repository.detail(userModel, { id: abigail.id }, { withRelated: ['friends'] });
            [betsy].forEach(user => {
                expect(!!result.friends.find(friend => friend.id === user.id)).toEqual(true);
            });
        });
    });
});
