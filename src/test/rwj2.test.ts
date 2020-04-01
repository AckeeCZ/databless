/**
 * + bookshelf through relation
 * + bookshelf hasMany with internal join
 */

import Knex from 'knex';
import * as repository from '../lib/repository';
import createDatabase from './knexDatabase';
const knexStringcase = require('knex-stringcase');

describe('🚚', () => {
    const db = createDatabase({ knexStringcase: repository.patchStringcaseForBookshelf(knexStringcase), debug: false });
    let knex: Knex;
    enum TourState {
        Active = 'active',
        Inactive = 'inactive',
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
            activeTours: {
                type: 'relation',
                targetModel: () => Tour,
                relation: repository.bookshelfRelation.createBelongsToMany({
                    foreignKey: 'vehicleId',
                    otherKey: 'tourId',
                    query: tours => tours.through(TourVehicle.getBookshelfModel(), 'tourId', 'vehicleId')
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
                    foreignKey: 'tourId',
                    query: pings => pings
                        .query((qb) => {
                            qb.leftJoin('tours', 'vehiclePings.tourId', 'tours.id')
                                .where('state', TourState.Active);
                        }),
                }),
            },
        },
    });
    const TourVehicle = repository.createModel({
        adapter: () => knex,
        collectionName: 'tourVehicles',
        attributes: {
            vehicleId: { type: 'number' },
            tourId: { type: 'number' },
        },
    });
    const Ping = repository.createModel({
        adapter: () => knex,
        collectionName: 'vehiclePings',
        attributes: {
            vehicleId: { type: 'number' },
            tourId: { type: 'number' },
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
            table.string('state');
            table.timestamps();
        });
        await knex.schema.createTable('vehicles', table => {
            table.bigIncrements('id')
                .unsigned()
                .primary();
            table.string('plate');
            table.timestamps();
        });
        await knex.schema.createTable('vehiclePings', table => {
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
        await knex.schema.createTable('tourVehicles', table => {
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
            table.timestamps();
        });
    });
    const Tours = repository.createRepository(Tour);
    const Vehicles = repository.createRepository(Vehicle);
    const TourVehicles = repository.createRepository(TourVehicle);
    const Pings = repository.createRepository(Ping);
    test('It works', async () => {
        await Promise.all([
            Tours.create({ state: TourState.Active }),
            Tours.create({ state: TourState.Inactive }),
        ]);
        const tours = await Tours.list();
        const vehicle = await Vehicles.create({});
        await Promise.all([
            TourVehicles.create({ vehicleId: vehicle.id, tourId: tours[0].id }),
            TourVehicles.create({ vehicleId: vehicle.id, tourId: tours[1].id }),
        ]);
        await Promise.all([
            Pings.create({ vehicleId: vehicle.id, tourId: tours[0].id }),
            Pings.create({ vehicleId: vehicle.id, tourId: tours[1].id }),
        ]);
        const pings = await Pings.list();
        {
            // Q: To have TypeExtractor for Model2WithRelated to have types when creating enum variable?

            const activeTours = (await Vehicles.detail({ id: vehicle.id }, { withRelated: ['activeTours'] })).activeTours;
            // TODO: Is empty! SQL query seems ok.. problem with snakecase BS pairing?
            expect(activeTours).toEqual(tours.filter(x => x.state === TourState.Active));
        }
        {
            const activeTourPings = (await Vehicles.detail({ id: vehicle.id }, { withRelated: ['activeTourPings' ]})).activeTourPings;
            // TODO: Is empty! SQL query seems ok.. problem with snakecase BS pairing?
            expect(activeTourPings).toMatchObject(pings.filter(x => !!tours.find(tour => (tour.state === TourState.Active && tour.id === x.tourId))));
        }
    });
});
