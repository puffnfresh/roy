describe('constraint generation', function(){
    var typeinference = require('../src/typeinference'),
        lexer = require('../src/lexer');
        parser = require('../src/parser');

    // TODO: Remove
    var compile = require('../src/compile');

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
            var generated = generate('a');
            var constraints = generated.constraints;
            var assumptions = generated.assumptions;
            expect(constraints.length).toEqual(0);
            expect(assumptions['a']).toNotEqual(null);
        });
    });
});
