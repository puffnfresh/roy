describe('constraint generation', function(){
    var typeinference = require('../src/typeinference'),
        lexer = require('../src/lexer');
        parser = require('../src/parser'),
        types = require('../src/types');

    // TODO: Remove
    var compile = require('../src/compile');

    function parseCode(s) {
        return parser.parse(lexer.tokenise(s));
    }

    function generate(c) {
        return typeinference.typecheck(parseCode(c));
    }

    describe('should generate constraints for', function() {
        it('identifiers', function(){
            var state = generate('a');

            expect(state.constraints.length).toEqual(0);

            expect(state.assumptions['a']).toNotEqual(undefined);
        });
        it('calls', function(){
            var state = generate('print 100');

            expect(state.constraints.length).toEqual(1);
            expect(state.constraints[0].a instanceof types.Variable).toBe(true);
            expect(state.constraints[0].b instanceof types.FunctionType).toBe(true);
            expect(state.constraints[0].b instanceof types.FunctionType).toBe(true);

            // Assumption for the `print` identifier
            expect(state.assumptions['print']).toNotEqual(undefined);
        });
    });
});
