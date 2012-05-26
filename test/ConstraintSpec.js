describe('constraint generation', function() {
    var lib = require('./SpecLib'),
        types = require('../src/types');

    // TODO: Remove
    var compile = require('../src/compile');

    describe('should generate constraints for', function() {
        it('identifiers', function(){
            var state = lib.generate('a');

            expect(state.constraints.length).toEqual(0);

            expect(state.assumptions['a']).toNotEqual(undefined);
        });
        it('calls', function(){
            var state = lib.generate('print 100');

            expect(state.constraints.length).toEqual(1);
            expect(state.constraints[0].a instanceof types.Variable).toBe(true);
            expect(state.constraints[0].b instanceof types.FunctionType).toBe(true);

            // Assumption for the `print` identifier
            expect(state.assumptions['print']).not.toBeUndefined(undefined);
        });
        it('function', function() {
            var state = lib.generate('\\x -> x');
            expect(state.constraints.length).toEqual(1);
            expect(state.constraints[0].a instanceof types.Variable).toBe(true);
            expect(state.constraints[0].b instanceof types.Variable).toBe(true);
        });
        it('let bindings', function() {
            var state = lib.generate('let x = 100\nx');
            expect(state.constraints.length).toEqual(1);
            expect(state.constraints[0].a instanceof types.NumberType).toBe(true);
            expect(state.constraints[0].b instanceof types.Variable).toBe(true);
            expect(state.constraints[0].s).toEqual([]);
        });
    });
});
