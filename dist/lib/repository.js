"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Sum of two numbers
 * - Returns number or object in `{ sum, calculation }` format if `withCalculation` param is `true`
 * @param a - first number
 * @param b - second number
 * @param withCalculation
 */
var sum = function (a, b, withCalculation) {
    if (withCalculation === void 0) { withCalculation = false; }
    var sum = a + b;
    if (!withCalculation) {
        return sum;
    }
    return {
        sum: sum,
        calculation: a + " + " + b + " = " + sum,
    };
};
exports.default = sum;
//# sourceMappingURL=repository.js.map