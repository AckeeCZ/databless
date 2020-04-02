import { inspectWithPreamble, setOptions } from 'intspector';
setOptions({ noErrorTruncation: true });

const inspectType = inspectWithPreamble(`
import * as repository from './src/lib/repository';
const whiskerModel = repository.createModel({
    adapter: () => null as any,
    collectionName: 'whiskers',
    attributes: {
        length: { type: 'number' },
        color: { type: 'string' },
        cat_id: { type: 'number' },
    },
});
const catModel = repository.createModel({
    adapter: () => null as any,
    attributes: {
        name: { type: 'string' },
        paws: { type: 'number' },
        birthDate: { type: 'date' },
        isNice: { type: 'bool' },
        color: { type: 'object', deserialize: (c): 'black' | 'white' => c },
        jsonCat: { type: 'object', serialize: cat => JSON.stringify(cat), deserialize: (cat: any): {
            id?: string
            name: string
        } => JSON.parse(cat) },
        whisker: {
            type: 'relation',
            relation: repository.bookshelfRelation.createHasOne({}),
            targetModel: () => whiskerModel,
        },
        mother: {
            type: 'relation',
            relation: repository.bookshelfRelation.createHasOne({}),
            targetModel: 'self',
        },
        whiskers: {
            type: 'relation',
            relation: repository.bookshelfRelation.createHasMany({}),
            targetModel: () => whiskerModel,
        },
        mothers: {
            type: 'relation',
            relation: repository.bookshelfRelation.createHasMany({}),
            targetModel: 'self',
        },
    },
    collectionName: 'cats',
});
const catRepository = repository.createRepository(catModel);
const listReturn = catRepository.list({}, {});
const countReturn = catRepository.list({}, { count: true });
type Cat = repository.Model2Entity<typeof catModel>;
type Relations = repository.Model2RelationKeys<typeof catModel>
`);
describe('Model types', () => {
    test('Basic fields', () => {
        expect(inspectType(`Cat['name']`)).toMatchInlineSnapshot(`"string"`);
    });
    test('Basic fields with serialization', () => {
        expect(inspectType(`Cat['color']`)).toMatchInlineSnapshot(`"\\"black\\" | \\"white\\""`);
        expect(inspectType(`Cat['jsonCat']`)).toMatchInlineSnapshot(`"{ id?: string | undefined; name: string; }"`);
    });
    test('toOne and toMany relation work as expected', () => {
        expect(inspectType(`Cat['whisker']`)).toBe(inspectType(`Cat['whiskers'][0]`));
        expect(inspectType(`Cat['whisker']`)).toMatchInlineSnapshot(
            `"{ length: number; color: string; cat_id: number; }"`
        );
    });
    test('toOne and toMany reflexive relation work as expected', () => {
        expect(inspectType(`Cat`)).toBe(inspectType(`Cat['mother']`));
    });
    test('Can retrieve keys for relation attributes', () => {
        expect(inspectType('Relations')).toMatchInlineSnapshot(
            `"\\"whiskers\\" | \\"whisker\\" | \\"mother\\" | \\"mothers\\""`
        );
    });
    test('List with and without count has correct return type', () => {
        // List returns list of cats
        expect(
            inspectType(
                `(typeof listReturn) extends Promise<(infer X)[]> ? X extends Record<'name', any> ? X['name'] : never : never`
            )
        ).toMatchInlineSnapshot(`"string"`);
        // List with count returns number
        expect(inspectType('typeof countReturn')).toMatchInlineSnapshot(`"Promise<number>"`);
    });
});
