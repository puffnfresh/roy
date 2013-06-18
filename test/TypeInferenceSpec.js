describe('type inference', function(){
    var typeinference = require('../src/typeinference'),
        types = require('../src/types');
        lexer = require('../src/lexer');
        parser = require('../lib/parser');

    beforeEach(function() {
        this.addMatchers({
            toStringEqual: function(expected) {
                return expected == this.actual.toString();
            }
        });
    });

    function parseCode(s) {
        return parser.parse(lexer.tokenise(s)).body;
    }

    function typeOfCode(s) {
        return typeinference.typecheck(parseCode(s), {}, {});
    }

    describe('should type literal', function() {
        it('numbers', function(){
            expect(typeOfCode('-1')).toStringEqual('Number');
            expect(typeOfCode('-99999')).toStringEqual('Number');
            expect(typeOfCode('0')).toStringEqual('Number');
            expect(typeOfCode('100')).toStringEqual('Number');
        });

        it('strings', function(){
            expect(typeOfCode('"100"')).toStringEqual('String');
            expect(typeOfCode('""')).toStringEqual('String');
            expect(typeOfCode("'100'")).toStringEqual('String');
            expect(typeOfCode("''")).toStringEqual('String');
        });

        it('booleans', function(){
            expect(typeOfCode('false')).toStringEqual('Boolean');
            expect(typeOfCode('true')).toStringEqual('Boolean');
        });

        it('arrays of primitives', function(){
            expect(typeOfCode('[""]')).toStringEqual('[String]');
            expect(typeOfCode('[true, false]')).toStringEqual('[Boolean]');
            expect(typeOfCode('[1, 2, 3]')).toStringEqual('[Number]');
        });

        it('empty arrays as generic', function() {
            var type = typeOfCode('[]');
            expect(type instanceof types.ArrayType).toBe(true);
            expect(type.type instanceof types.Variable).toBe(true);
        });

        it('structures', function() {
            expect(typeOfCode('{}')).toStringEqual('{}');
            expect(typeOfCode('{a: 1}')).toStringEqual('{a: Number}');
            expect(typeOfCode('{a: 1, b: true}')).toStringEqual('{a: Number, b: Boolean}');
            expect(typeOfCode("{'a': 1}")).toStringEqual('{"a": Number}');
            expect(typeOfCode('{"a": 1, \'b\': true}')).toStringEqual('{"a": Number, "b": Boolean}');
            expect(typeOfCode("{4: '1'}")).toStringEqual("{4: String}");
            expect(typeOfCode("{4: {'1': 1}}")).toStringEqual('{4: {"1": Number}}');
        });
    });

    describe("shouldn't type literal", function() {
        it('heterogeneous arrays', function() {
            expect(function() {
                typeOfCode('[1, true]');
            }).toThrow(new Error("Type error on line 0: Number is not Boolean"));
        });
    });
});
