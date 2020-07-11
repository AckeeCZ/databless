import { default as Knex } from 'knex';
import * as repository from '../lib/repository';
import createDatabase from './knexDatabase';

const db = createDatabase({ debug: false });

describe('Exact match filter', () => {
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
    afterAll(async () => {
        await db.disconnect();
    });
    beforeAll(async () => {
        knex = await db.reset();
        await db.createTable(model);
        await Promise.all(inputData.map(data => repository.create(model, data)));
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
    test('Where in filtering', async () => {
        const filter = { string: ['hijklmn', 'abcdefg'] };
        const results = await repository.list(model, filter);
        results.forEach(result => {
            expect(filter.string).toContain(result.string);
        });
    });
    test('List returns [] for no results', async () => {
        const result = await repository.list(model, { string: 'nonexistingstringihope' });
        expect(result).toEqual([]);
    });
    test('Detail returns undefined for no result', async () => {
        const result = await repository.detail(model, { string: 'nonexistingstringihope' });
        expect(result).toEqual(undefined);
    });
    test('Filters on model-undefined attributes are ignored', async () => {
        const result = await repository.detail(model, { string: 'nonexistingstringihope', stringX: '' });
        expect(result).toEqual(undefined);
    });
    test('Filtering undefined fields are ignored', async () => {
        {
            const result = await repository.detail(model, { string: 'hijklmn', number: undefined });
            expect(result.string).toEqual('hijklmn');
        }
        {
            const result = await repository.list(model, { string: 'hijklmn', number: undefined });
            expect(result[0].string).toEqual('hijklmn');
        }
    });
});
