import * as fs from 'fs';
import { default as connect, default as Knex } from 'knex';
import { format as sprintf, promisify } from 'util';
import * as repository from '../lib/repository';

const db = (dbOptions: { knexStringcase?: any, debug?: boolean } = {}) => {
    let knex: ReturnType<typeof connect>;
    if (!dbOptions.knexStringcase) {
        dbOptions.knexStringcase = (x: any) => x;
    }

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
    const reset = async (resetOpts: { database?: string } = { database: 'databless-test' }): Promise<Knex> => {
        if (knex) {
            await knex.destroy();
            knex = undefined as any;
        }
        const sqlLiteMemory: Knex.Config = { client: 'sqlite3', connection: ':memory:', pool: { min: 1, max: 1 }, debug: dbOptions.debug };
        const sqlLiteFile: Knex.Config = { client: 'sqlite3', connection: { filename: './db.sqlite' }, pool: { min: 1, max: 1 }, debug: dbOptions.debug, useNullAsDefault: true, };
        const mysql: Knex.Config = { client: 'mysql', connection: {
            user: 'root',
            server: 'localhost',
            database: resetOpts.database,
            password: '',
        }, pool: { min: 1, max: 1 }, debug: dbOptions.debug };

        const driver = mysql;
        const opts = dbOptions.knexStringcase(driver);
        if (driver === mysql) {
            const database = (mysql.connection as any).database;
            delete (mysql.connection as any).database;
            knex = connect(opts);
            await knex.raw(sprintf('DROP DATABASE `%s`', database)).catch(() => {});
            await knex.raw(sprintf('CREATE DATABASE `%s`', database));
            await knex.destroy();
            (mysql.connection as any).database = database;
            knex = connect(opts);
        }
        if (driver === sqlLiteFile) {
            const file = (sqlLiteFile.connection as any).filename;
            await promisify(fs.unlink)(file);
            knex = connect(opts);
        }
        if (driver === sqlLiteMemory) {
            knex = connect(opts);
        }
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
};

export default db;
