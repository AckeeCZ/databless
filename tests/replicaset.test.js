const databless = require('../index');
const { replicaset } = require('../index');

describe.skip('Replicaset', () => {
    let knex;
    beforeAll(async () => {
        replicaset.initKnex({
            writeNodes: [
                {
                    client: 'pg',
                    connection: {
                        host: 'localhost',
                        port: '10001',
                        database: 'databless',
                        user: 'databless',
                        password: 'databless',
                    },
                    // debug: true,
                },
            ],
            readNodes: [
                {
                    client: 'pg',
                    connection: {
                        host: 'localhost',
                        port: '10002',
                        user: 'databless',
                        password: 'databless',
                        database: 'databless',
                    },
                },
                {
                    client: 'pg',
                    connection: {
                        host: 'localhost',
                        port: '10003',
                        user: 'databless',
                        password: 'databless',
                        database: 'databless',
                    },
                },
            ],
            proxy: {
                client: 'pg',
            },
            select: replicaset.createRoundRobinSelectionStrategy(),
        });

        knex = databless.getKnex();
        // Prepare instances - purge & create some schema with a one row
        // to identify an instance
        await Promise.all(
            [
                ['readInstance1', replicaset.readReplicas(knex)[0]],
                ['readInstance2', replicaset.readReplicas(knex)[1]],
                ['writeInstance1', replicaset.writeReplicas(knex)[0]],
            ]
                .map(async ([instance, knex]) => {
                    await knex.raw(`
                        DROP SCHEMA public CASCADE;
                        CREATE SCHEMA public;
                    `);
                    await knex.schema.createTable('records', table => {
                        table.increments('id').primary();
                        table.string('title');
                    });
                    await knex('records').insert({ title: instance });
                })
        );
    });
    afterAll(async () => {
        await knex.destroy();
    });
    test('RR for reads', async () => {
        {
            const result = await knex('records');
            // 1st read -> readInstance1
            expect(result.find(x => x.title === 'readInstance1')).not.toBeUndefined();
        }
        {
            const result = await knex('records');
            // 2nd read -> readInstance2
            expect(result.find(x => x.title === 'readInstance2')).not.toBeUndefined();
        }
        {
            const result = await knex('records');
            // 3rd read -> readInstance1
            expect(result.find(x => x.title === 'readInstance1')).not.toBeUndefined();
        }
        {
            await knex('records').insert({ title: 'inserted' });
            const result = await replicaset.writeReplicas(knex)[0]('records');
            // 1st write -> writeInstance1
            expect(result.find(x => x.title === 'inserted')).not.toBeUndefined();
            expect(result.find(x => x.title === 'writeInstance1')).not.toBeUndefined();
        }
        {
            const result = await knex('records');
            // 4th read -> readInstance2
            expect(result.find(x => x.title === 'readInstance2')).not.toBeUndefined();
        }
    });
    test('Transacted queries always use write instances', async () => {
        const TRX_INSERT = { title: 'trx-insert' };
        await knex.transaction(async trx => {
            await knex('records').transacting(trx)
                .insert(TRX_INSERT);
            {
                const result = await knex('records').transacting(trx);
                expect(result.find(x => x.title === TRX_INSERT.title)).not.toBeUndefined();
                expect(result.find(x => x.title === 'writeInstance1')).not.toBeUndefined();
            }
        });
        // And non-trx queries are again from read instances
        {
            const result = await knex('records');
            expect(result.find(x => x.title === 'writeInstance1')).toBeUndefined();
        }
    });
});
