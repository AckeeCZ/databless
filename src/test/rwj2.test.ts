/**
 * + bookshelf through relation
 * + bookshelf hasMany with internal join
 */

import Knex from 'knex';
import { omit } from 'lodash';
import { v1 as uuid } from 'uuid';
import * as repository from '../lib/repository';
import createDatabase from './knexDatabase';
const knexStringcase = require('knex-stringcase');

describe('🚚', () => {
    const db = createDatabase({ knexStringcase, debug: false });
    let knex: Knex;
    enum TourState {
        Active = 'active',
    }

    const Tour = repository.createModel({
        adapter: () => knex,
        collectionName: 'tours',
        attributes: {
            id: { type: 'number' },
            state: { type: 'string', deserialize: (x): TourState => x },
        },
    });
    const Vehicle = repository.createModel({
        adapter: () => knex,
        collectionName: 'vehicles',
        attributes: {
            id: { type: 'number' },
            plate: { type: 'string' },
            activeTrip: {
                type: 'relation',
                targetModel: () => Tour,
                relation: repository.bookshelfRelation.createBelongsToMany({
                    query: tours => tours.through(TourVehicle.getBookshelfModel())
                        .query(qb => {
                            qb.where('tours.state', TourState.Active);
                            qb.orderBy('id', 'desc');
                        }),
                }),
            },
            activeTourPings: {
                type: 'relation',
                targetModel: () => Ping,
                relation: repository.bookshelfRelation.createHasMany({
                    query: tours => tours.through(Ping.getBookshelfModel())
                        .query((qb) => {
                            qb.leftJoin('trips', 'pingRecords.tripId', 'trips.id')
                                .where('state', TourState.Active)
                                .columns('vehiclePings.*');
                        }),
                }),
            },
        },
    });
    const TourVehicle = repository.createModel({
        adapter: () => knex,
        collectionName: 'tourVehicles',
        attributes: {
            vehcileId: { type: 'number' },
            tourId: { type: 'number' },
        },
    });
    const Ping = repository.createModel({
        adapter: () => knex,
        collectionName: 'vehiclePings',
        attributes: {
            vehcile_id: { type: 'number' },
            tour_id: { type: 'number' },
            createAt: { type: 'date' },
            lat: { type: 'number' },
            lng: { type: 'number' },
        },
    });
    afterAll(async () => {
        await db.disconnect();
    });
    beforeAll(async () => {
        knex = await db.reset();
        await knex.schema.createTable('tours', table => {
            table.bigIncrements('id')
                .unsigned()
                .primary();
            table.timestamps();
        });
        await knex.schema.createTable('vehicles', table => {
            table.bigIncrements('id')
                .unsigned()
                .primary();
            table.string('plate');
            table.timestamps();
        });
        await knex.schema.createTable('vehilcePings', table => {
            table.bigIncrements('id')
                .unsigned()
                .primary();
            table.bigInteger('tourId')
                .unsigned()
                .nullable()
                .references('tours.id')
                .onDelete('CASCADE')
                .onUpdate('CASCADE');
            table.bigInteger('vehicleId')
                .unsigned()
                .notNullable()
                .references('vehicles.id')
                .onDelete('CASCADE')
                .onUpdate('CASCADE');
            table.decimal('lat', 10, 8)
                .nullable();
            table.decimal('lng', 11, 8)
                .nullable();
            table.timestamps();
        });
    });
    test.todo('It works');
});
