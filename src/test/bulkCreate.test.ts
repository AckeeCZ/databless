import { default as Knex } from 'knex';
import { pick } from 'lodash';
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
        beforeEach(async () => {
            await repository.delete(model);
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
        test('Create elements with fields not defined on the model', async () => {
            const data: Array<Partial<repository.Model2Entity<typeof model>>> = [
                { string: 'a', notdefined: 'avalue' } as any /* Override not-defined field*/,
            ];
            await repository.createBulk(model, data);
            const list = await repository.list(model);
            expect(list).toMatchObject(data.map(d => pick(d, model.attributeNames)));
        });
        test('Create elements with undefined fields are ignored', async () => {
            const data: Array<Partial<repository.Model2Entity<typeof model>>> = [{ string: undefined }];
            await repository.createBulk(model, data);
            const list = await repository.list(model);
            expect(list).toMatchInlineSnapshot(`
                Array [
                  Object {
                    "id": 5,
                    "string": null,
                  },
                ]
            `);
        });
    });
});
