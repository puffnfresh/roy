describe('type inference', function() {
    var lib = require('./SpecLib'),
        types = require('../src/types');

    beforeEach(function() {
        this.addMatchers({
            toStringEqual: function(expected) {
                return expected == this.actual.toString();
            }
        });
    });

    describe('should type function', function() {
        it('identity', function() {
            expect(lib.typecheck('let id a = a\nid 1\nid true')).toStringEqual('Boolean');
        });
        it('with multiple arguments', function() {
            expect(lib.typecheck('let f x y = x + y\nf')).toStringEqual('Number -> Number -> Number');
        });
    });

    describe('should type literal', function() {
        it('numbers', function() {
            expect(lib.typecheck('-1')).toStringEqual('Number');
            expect(lib.typecheck('-99999')).toStringEqual('Number');
            expect(lib.typecheck('0')).toStringEqual('Number');
            expect(lib.typecheck('100')).toStringEqual('Number');
        });

        it('strings', function() {
            expect(lib.typecheck('"100"')).toStringEqual('String');
            expect(lib.typecheck('""')).toStringEqual('String');
            expect(lib.typecheck("'100'")).toStringEqual('String');
            expect(lib.typecheck("''")).toStringEqual('String');
        });

        it('booleans', function() {
            expect(lib.typecheck('false')).toStringEqual('Boolean');
            expect(lib.typecheck('true')).toStringEqual('Boolean');
        });

        it('empty arrays as generic', function() {
            var type = lib.typecheck('[]');
            expect(type instanceof types.ArrayType).toBe(true);
            expect(type.type instanceof types.Variable).toBe(true);
        });

        it('structures', function() {
            expect(lib.typecheck('{}')).toStringEqual('{}');
            expect(lib.typecheck('{a: 1}')).toStringEqual('{a: Number}');
            expect(lib.typecheck('{a: 1, b: true}')).toStringEqual('{a: Number, b: Boolean}');
            expect(lib.typecheck("{'a': 1}")).toStringEqual('{"a": Number}');
            expect(lib.typecheck('{"a": 1, \'b\': true}')).toStringEqual('{"a": Number, "b": Boolean}');
            expect(lib.typecheck("{4: '1'}")).toStringEqual("{4: String}");
            expect(lib.typecheck("{4: {'1': 1}}")).toStringEqual('{4: {"1": Number}}');
        });

        describe('arrays of primitive', function() {
            it('strings', function() {
                expect(lib.typecheck('[""]')).toStringEqual('[String]');
            });
            it('booleans', function() {
                expect(lib.typecheck('[true, false]')).toStringEqual('[Boolean]');
            });
            it('numbers', function() {
                expect(lib.typecheck('[1, 2, 3]')).toStringEqual('[Number]');
            });
        });
    });

    describe("shouldn't type literal", function() {
        it('heterogeneous arrays', function() {
            expect(function() {
                lib.typecheck('[1, true]');
            }).toThrow(new Error("Type error on line 0: Number is not Boolean"));
        });
    });
});
