import { default as connect, default as Knex } from 'knex';
import * as repository from '../lib/repository';
import createDatabase from './knexDatabase';

const db = createDatabase({ debug: false });

describe('Bulk create', () => {
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
        test('Create n elements', async () => {
            const data: Array<Partial<repository.Model2Entity<typeof model>>> = [
                { string: 'a' },
                { string: 'b' },
                { string: 'c' },
            ];
            await repository.createBulk(model, data);
            const list = await repository.list(model);
            expect(list).toMatchObject(data);
        });
    });
});
