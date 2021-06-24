/**
 * + bookshelf through relation
 * + bookshelf hasMany with internal join
 */

import { Knex } from 'knex';
import * as repository from '../lib/repository';
import * as bookshelfUtil from '../lib/bookshelfUtil';
import createDatabase from './knexDatabase';
const knexStringcase = require('knex-stringcase');

describe('🚚', () => {
    const db = createDatabase({ knexStringcase: repository.patchStringcaseForBookshelf(knexStringcase), debug: false });
    let knex: Knex;
    enum TourState {
        Active = 'active',
        Inactive = 'inactive',
    }

    type Tour = {
        id: number
        state: string
    }
    const Tour = repository.createModel<Tour>({
        adapter: () => knex,
        collectionName: 'tours',
        attributes: {
            id: { type: 'number' },
            state: { type: 'string' },
        },
    });
    type Vehicle = {
        id: number
        plate: string
        activeTours: Tour[]
        activeTourPings: Ping[]
    }
    const Vehicle = repository.createModel<Vehicle, { relationKeys: 'activeTours' | 'activeTourPings', customFilters: { tourState: TourState[] } }>({
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
        filters: {
            tourState: (states: TourState[], options) => {
                options.qb = bookshelfUtil.composeQb(options.qb, (qb) => {
                    qb.join('tours', 'tours.id', 'vehicles.tourId')
                    qb.whereIn('tours.state', states)
                })
            },
        }
    });
    type TourVehicle = {
        vehicleId: number
        tourId: number
    }
    const TourVehicle = repository.createModel<TourVehicle>({
        adapter: () => knex,
        collectionName: 'tourVehicles',
        attributes: {
            vehicleId: { type: 'number' },
            tourId: { type: 'number' },
        },
    });
    type Ping = {
        vehicleId: number,
        tourId: number,
        createAt: Date,
        lat: number,
        lng: number,
    }
    
    const Ping = repository.createModel<Ping>({
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
    test("_getQueryBuilder returns QueryBuilder with applied filters & options", async () => {
        const vehicle = await Vehicles.create({});
        const vehiclesQb = Vehicles.getListQueryBuilder({ id: vehicle.id, tourState: [TourState.Active] }, { limit: 10 })
        // Check that we have a valid QueryBuilder
        expect(vehiclesQb.toSQL()).toHaveProperty('method')
        expect(vehiclesQb.toSQL().method).toBe('select')
        // Check if raw query includes all filters, joins, options, etc.
        const rawQuery = vehiclesQb.toQuery()
        expect(rawQuery).toMatch(new RegExp("`vehicles`.`id` = \\d"))
        expect(rawQuery).toMatch(new RegExp("inner join `tours` on `tours`\\.`id` = `vehicles`\\.`tour_id`"))
        expect(rawQuery).toMatch(new RegExp("`tours`\\.`state` in \\('active'\\)"))
        expect(rawQuery).toMatch(new RegExp('limit 10'))
    })
});
