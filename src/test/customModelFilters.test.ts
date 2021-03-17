import { default as connect, default as Knex } from 'knex';
import * as repository from '../lib/repository';
import createDatabase from './knexDatabase';
import { composeQb } from '../lib/bookshelfUtil';


const db = createDatabase({ debug: false });

describe('Custom model filters', () => {
    let knex: Knex;
    const model = repository.createModel<{ id: number, name: string }, { customFilters: { nameReverso: string } }>({
        adapter: () => knex,
        collectionName: 'model',
        attributes: {
            id: { type: 'number' },
            name: { type: 'string' },
        },
        filters: {
            nameReverso: (value: string, options) => {
                options.qb = composeQb(options.qb, qb => {
                    qb.where('name', value.split('').reverse().join(''))
                });
            }
        }
    });
    beforeAll(async () => {
        knex = await db.reset();
        await db.createTable(model);
        await Promise.all(
            [
                { name: 'FOO' },
                { name: 'bar' },
            ]
                .map(user => repository.create(model, user))
        );
    });
    afterAll(() => db.disconnect());
    test('Custom filtering option`', async () => {
        const [hit, miss] = [
            await repository.detail(model, { name: 'foo' }),
            await repository.detail(model, { name: 'oof' }),
        ];
        const [miss2, hit2] = [
            await repository.detail(model, { nameReverso: 'foo' }),
            await repository.detail(model, { nameReverso: 'oof' }),
        ];
        expect(hit).toBeTruthy();
        expect(miss).toBeFalsy();
        expect(hit).toStrictEqual(hit2);
        expect(miss).toStrictEqual(miss2);
    });
});
