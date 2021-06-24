/**
 * + custom entity serialization/deserialization
 * + custom update attributes
 * + custom ID via UUID
 */
import { Knex } from 'knex';
import { omit } from 'lodash';
import { v1 as uuidv1 } from 'uuid';
import * as repository from '../lib/repository';
import createDatabase from './knexDatabase';
const knexStringcase = require('knex-stringcase');

describe('🚗', () => {
    const uuid = () => uuidv1().replace(/-/g, '');
    const db = createDatabase({ knexStringcase, debug: false });
    let knex: Knex;
    enum UserRole {
        courier = 'courier',
        customer = 'customer',
        admin = 'admin',
        partner = 'partner',
        support = 'support',
    }
    type User = {
        id: string,
        eulaAgreedAt: Date,
        firstName: string,
        isCourier: boolean,
        isCustomer: boolean,
        isAdmin: boolean,
        isSupport: boolean,
        isPartner: boolean,
    }
    const User = repository.createModel<User>({
        adapter: () => knex,
        collectionName: 'users',
        attributes: {
            id: { type: 'string' },
            eulaAgreedAt: { type: 'date' },
            firstName: { type: 'string' },
            isCourier: { type: 'bool' },
            isCustomer: { type: 'bool' },
            isAdmin: { type: 'bool' },
            isSupport: { type: 'bool' },
            isPartner: { type: 'bool' },
        },
    });
    const Users = repository.createRepository(User);
    const serializeUser = (user: Partial<Omit<User, 'isCourier' | 'isCustomer' | 'isAdmin' | 'isSupport' | 'isPartner'> & { eulaAgreed: boolean, roles: UserRole[] }>): Partial<User> => {
        return {
            ...user,
            isAdmin: user.roles && user.roles.indexOf(UserRole.admin) > -1,
            isCourier: user.roles && user.roles.indexOf(UserRole.courier) > -1,
            isCustomer: user.roles && user.roles.indexOf(UserRole.customer) > -1,
            isSupport: user.roles && user.roles.indexOf(UserRole.support) > -1,
            isPartner: user.roles && user.roles.indexOf(UserRole.partner) > -1,
            // Q: Support nullable fields to enable null set. For this purposes, should be allowed on model directly.
            eulaAgreedAt: user.eulaAgreed ? new Date() : (null as any as Date),
        };
    };
    const deserializeUser = (user: Partial<ReturnType<typeof serializeUser>>): Partial<Omit<User, 'isCourier' | 'isCustomer' | 'isAdmin' | 'isSupport' | 'isCourier'> & { roles: UserRole[]}> => {
        return omit({
            ...user,
            roles: [
                user.isCourier && UserRole.courier,
                user.isCustomer && UserRole.customer,
                user.isAdmin && UserRole.admin,
                user.isPartner && UserRole.partner,
                user.isSupport && UserRole.support,
            ].filter((x): x is UserRole => !!x),
        }, ['isCourier', 'isCustomer', 'isAdmin', 'isPartner', 'isSupport']);
    };
    afterAll(async () => {
        await db.disconnect();
    });
    beforeAll(async () => {
        knex = await db.reset();
        await knex.schema.createTable('users', table => {
            table.binary('id', 32)
                .primary();
            table.string('email');
            table.string('userTag');
            table.string('firstName');
            table.string('lastName');
            table.string('phoneNumber');
            table.boolean('isCourier');
            table.boolean('isCustomer');
            table.boolean('isPartner');
            table.boolean('isSupport');
            table.boolean('isAdmin');
            table.timestamps();
            table.dateTime('eulaAgreedAt');
        });
    });
    test('It works', async () => {
        const admin = deserializeUser(await Users.create(serializeUser({ id: uuid(), roles: [UserRole.admin] })));
        expect(admin.roles![0]).toEqual(UserRole.admin);
        let customer = deserializeUser(await Users.create(serializeUser({ id: uuid(), roles: [UserRole.customer] })));
        expect(customer.roles![0]).toEqual(UserRole.customer);

        // Q: Maybe add required data? Otherwise this is valid and does nothing.
        // await Users.update(serializeUser({ eulaAgreed: true }));

        // Set Field by AnotherField on update serialization
        expect(customer.eulaAgreedAt).toEqual(null);
        // Q: When using custom IDs, I have to tell a serialization function to ignore it
        await Users.update({ id: customer.id }, serializeUser({ id: customer.id, eulaAgreed: true, firstName: 'Abc' }));
        customer = deserializeUser(await Users.detail({ id: customer.id }));
        expect(customer.eulaAgreedAt).toBeInstanceOf(Date);

        // Q: I need to call seri/desrialization function on every op :(
    });
});
