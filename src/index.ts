export * as db from './lib/repository';

import connect from 'knex';

const knex = connect({ client: 'sqlite3', connection: ':memory:' });


interface Cat {
    id?: string
    name: string
    whiskers: Whisker[]
}

interface Whisker {
    length: number
    color: string
}

// PgAdapter {
//     create: ...
// }

// UC01: Create a lite repository on the go, remove the need to have a singleton repository.
const WhiskerModel = {
    driver: knex,
    collectionName: 'cats',
    attributes: [
        {
            name: 'length',
            type: Number
        },
    ],
}
{
    const repository = db.repository.create<Cat>({
        driver: knex,
        collectionName: 'cats',
        attributes: {
            name: String,
            birthDate: Date,
            isNice: Boolean,
            jsonCat: (cat: Cat) => cat,
            whiskers: db.BookshelfRelation<Whisker>({
                collectionName: 'whiskers',
                foreignKey: '',
                foreignKeyTarget: '',
            })
        },
        // (-) Zcervenalo by cely pole pri chybe
        // (-) Hur se s tim pracuje v TS
        attributesLegacy: [
            {
                name: 'name',
                type: String
            },
            {
                name: 'birthDate',
                type: Date
            },
            {
                name: 'isNice',
                type: Boolean,
            },
            {
                name: '',
                type: (cat: Cat) => cat
            },
            {
                name: 'whisker',
                type: db.BookshelfRelation<Whisker>({
                    collectionName: 'whiskers',
                    foreignKey: '',
                    foreignKeyTarget: '',
                }),
            },
        ],
    })
}



// (optional) UC02: I dont want to specify driver each time I create a repository
// {
//   db.repository.setDefaults({ driver: knex })
//   const repository = db.repository.create<Cat>({ collectionName: 'cats' })
// }


// UC03: Basic CRUD
{
    const repository = db.repository.create<Cat>({ collectionName: 'cats', driver: knex });
    (async () => {
        const created = await repository.create({ name: 'Fluffy' })
        // ❓ How to name detail aka findOne aka select (knex) aka find (mongo) aka where (bookshelf)
        const read = await repository.find({ id: created.id })
    })()
}

// UC04: Supported attribute types: Number, string, Date, boolean


type Primitive = 'string' | 'number' | 'date' | 'bool' | 'object';
type PrimitiveToType<P> = P extends 'string' ? string : P extends 'date' ? Date : P extends 'number' ? number : P extends 'bool' ? boolean : P extends 'object' ? any : never;

type AttributeToType<P> = P extends { deserialize: (x: any) => infer R } ? R : P extends { type: infer X } ? PrimitiveToType<X> : never;
type Attribute = { type: Primitive, serialize?: (x: any) => PrimitiveToType<Primitive>, deserialize?: (x: any) => any };
type RepositoryConfiguration = { attributes: Record<string, Attribute>, collectionName: string, adapter: any /* TODO KNEX */ }

type Relation = { type: 'hasOne', foreignKey: string, foreignKeyTarget: string }

type CreateEntity<T> = { [key in keyof T]: T[key] extends Attribute ? AttributeToType<T[key]> : never };

const createRepo = <R extends RepositoryConfiguration>(repo: R): CreateEntity<R['attributes']> => null as any;

const whisker = createRepo({
    adapter: null,
    collectionName: 'whiskers',
    attributes: {
        length: { type: 'number' },
        color: { type: 'string' }
    },
})

// Modely namisto repozitaru
// repository.save(CatModel, catData, options)
// catRepository = repository.buildCrud(CatModel)

const Cat = db.createModel({
    adapter: null,
    collectionName: 'cats',
    attributes: {
        name: { type: 'string' },
        paws: { type: 'number' },
        birthDate: { type: 'date' },
        isNice: { type: 'bool' },
        color: { type: 'string', deserialize: (c): 'black' | 'white' => c },
        jsonCat: { type: 'object', serialize: cat => JSON.stringify(cat), deserialize: (cat: any): {
            id?: string
            name: string
        } => JSON.parse(cat) },
        anyCat: { type: 'object' },
        kittens: {
            type: 'relation',
            targetModel: () => Cat,
            relation: db.bookshelfRelation.createHasOne({
                // (optional) foreignKey
                // (optional) targetKey
            }),
            
        }
    },
})

const catModel = {
    attributes: {
        name: { type: 'string' },
    },
};

// type Cat = getType<typeof catModel>

// catModel.attributes.kittens = 

// const catBuilder = createRepoBuilder({
//     adapter: null,
//     collectionName: 'cats',
//     attributes: {
//         name: { type: 'string' },
//         paws: { type: 'number' },
//         birthDate: { type: 'date' },
//         isNice: { type: 'bool' },
//         color: { type: 'string', deserialize: (c): 'black' | 'white' => c },
//         jsonCat: { type: 'object', serialize: cat => JSON.stringify(cat), deserialize: (cat: any): {
//             id?: string
//             name: string
//         } => JSON.parse(cat) },
//         anyCat: { type: 'object' },
//     },
// })
// catBuilder.build({
//     attributes: {
        
//     }
// })