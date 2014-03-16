describe('constraint generation', function() {
    var lib = require('./SpecLib'),
        typeinference = require('../src/typeinference'),
        types = require('../src/types');

    describe('should generate constraints for', function() {
        it('identifiers', function() {
            var state = lib.generate('a');

            expect(state.constraints.length).toEqual(0);

            expect(state.assumptions['a']).not.toBeUndefined();
        });
        it('calls', function() {
            var state = lib.generate('print 100');

            expect(state.constraints.length).toEqual(1);
            expect(state.constraints[0].a instanceof types.FunctionType).toBe(true);
            expect(state.constraints[0].b instanceof types.FunctionType).toBe(true);

            // Assumption for the `print` identifier
            expect(state.assumptions['print']).not.toBeUndefined();
        });
        it('function', function() {
            var state = lib.generate('\\x -> x');
            expect(state.assumptions).toEqual({});
            expect(state.constraints.length).toEqual(1);
            expect(state.constraints[0].a instanceof types.Variable).toBe(true);
            expect(state.constraints[0].b instanceof types.Variable).toBe(true);
        });
        it('let bindings', function() {
            var state = lib.generate('let x = 100\nx');
            expect(state.assumptions).toEqual({});
            expect(state.constraints.length).toEqual(1);
            expect(state.constraints[0].a instanceof types.NumberType).toBe(true);
            expect(state.constraints[0].b instanceof types.NumberType).toBe(true);
            expect(state.constraints[0].monomorphic).toEqual([]);
        });
        it('example from "Generalizing Hindley-Milner" paper', function() {
            var state = lib.generate('\\m ->\n  let y = m\n  let x = y true\n  x');
            expect(state.assumptions).toEqual({});
            /*
              C1 = {τ2 ≡Bool→τ3}
              C2 = C1 ∪{τ4 ≤{τ5} τ3}
              C3 = C2 ∪{τ2 ≤{τ5} τ1}
              C4 = C3 ∪{τ5 ≡τ1}
            */
            expect(state.constraints.length).toEqual(4);

            expect(state.constraints[1].b instanceof types.Variable).toBe(true);
            expect(state.constraints[1].a instanceof types.FunctionType).toBe(true);
            expect(state.constraints[1].a.from instanceof types.BooleanType).toBe(true);
            expect(state.constraints[1].a.to instanceof types.Variable).toBe(true);

            // Two implicit constraints

            expect(state.constraints[3].a instanceof types.Variable).toBe(true);
            expect(state.constraints[3].b instanceof types.Variable).toBe(true);
        });
    });
});
