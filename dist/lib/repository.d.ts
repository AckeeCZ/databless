/**
 * Sum of two numbers
 * - Returns number or object in `{ sum, calculation }` format if `withCalculation` param is `true`
 * @param a - first number
 * @param b - second number
 * @param withCalculation
 */
declare const sum: (a: number, b: number, withCalculation?: boolean) => number | {
    sum: number;
    calculation: string;
};
export default sum;
