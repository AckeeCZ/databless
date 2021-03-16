import { default as Knex } from 'knex';
import * as repository from '../lib/repository';
import createDatabase from './knexDatabase';

const db = createDatabase({ debug: false });

describe('Count', () => {
    let knex: Knex;
    const model = repository.createModel<{ id: number, string: string }>({
        adapter: () => knex,
        collectionName: 'model',
        attributes: {
            id: { type: 'number' },
            string: { type: 'string' },
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
    afterAll(async () => {
        await db.disconnect();
    });
    test('Count with on filtering', async () => {
        const result = await repository.list(model, {}, { count: true });
        expect(result).toEqual(inputData.length);
    });
    test('Count using filters', async () => {
        const filter = { number: 10, string: 'hijklmn' };
        const result = await repository.list(model, filter, { count: true });
        expect(result).toEqual(
            inputData.filter(data => data.number === filter.number).filter(data => data.string === filter.string).length
        );
    });
});
