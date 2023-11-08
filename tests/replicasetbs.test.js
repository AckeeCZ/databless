const databless = require('../index');
const { replicaset } = require('../index');
const { format: sprintf } = require('util')

describe.skip('Replicaset - Bookshelf', () => {
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
                },
            ],
            readNodes: [
                {
                    client: 'pg',
                    connection: {
                        host: 'localhost',
                        port: '10001',
                        database: 'databless',
                        user: 'databless',
                        password: 'databless',
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
                replicaset.writeReplicas(knex)
            ]
                .map(async ([knex]) => {
                    await knex.raw(`
                        DROP SCHEMA public CASCADE;
                        CREATE SCHEMA public;
                    `);
                })
        );
    });
    afterAll(async () => {
        await knex.destroy();
    });
    describe('Bookshelf integration', () => {
        let Model;
        beforeAll(async () => {
            await knex.schema.createTable('records', table => {
                table.increments('id').primary();
                table.string('title');
            });
            const registerModel = (bookshelf) => {
                const Model = databless.getBookshelf().Model.extend({
                    tableName: 'records',
            
                    tags() {
                        return this.belongsToMany(Tag);
                    }
                });
                return bookshelf.model('Model', Model);
            }
            const bookshelf = databless.initBookshelf(knex);
            Model = registerModel(bookshelf);
        });

        afterAll(async () => {
            await knex.destroy();
        });
        test('CRUD', async () => {
            let createId;
            // Create
            {
                const result = (await Model.forge({ title: 'bs-model-insert' }).save()).toJSON();
                expect(result.id).not.toBeUndefined();
                createId = result.id;
                await mirror(knex);
            }
            // Read
            {
                const result = (await Model.forge({ id: createId }).fetch());
                expect(result.id).toEqual(createId);
            }
            // Update
            {
                (await Model.forge({ id: createId })
                    .save({ title: 'bs-model-insert-updated' })).toJSON();
                await mirror(knex);
                const result = (await Model.where({ id: createId }).fetch()).toJSON();
                expect(result.title).toEqual('bs-model-insert-updated');
            }
            {
                await Model.where({ id: createId }).destroy();
                await mirror(knex);
                const result = (await Model.where({ id: createId }).fetch());
                expect(result).toEqual(null);
            }
        });
        // Unksip when MIGRATION_DIR and SEED_DIR is provided
        describe.skip('Seeds', () => {
            beforeAll(async () => {
                await knex.migrate.latest({ directory: process.env.MIGRATION_DIR });
            });
            afterAll(() => {
                // Maybe your seeds create always a new instance and cannot exist gracefully
                process.exit(0);
            });
            test('Run seeds', async () => {
                await knex.seed.run({ directory: process.env.SEED_DIR });
            })
        });
    });
});

async function mirror(replicaKnex) {
    const source = replicaset.writeReplicas(replicaKnex)[0]; // ! only one
    const dests = replicaset.readReplicas(replicaKnex);
    const records = await source('records');
    await Promise.all(
        dests.map(async dest => {
            await dest.raw(sprintf('TRUNCATE TABLE %s', 'records'));
            await Promise.all(
                records.map(record => dest('records').insert(record))
            );
        })
    );
}