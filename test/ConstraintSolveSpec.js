describe('constraint solving', function() {
    var lib = require('./SpecLib'),
        types = require('../src/types');

    describe('should properly type', function() {
        it('identifiers', function() {
            var type = lib.typecheck('x');
            expect(type instanceof types.Variable).toBe(true);
        });
        it('calls', function() {
            var type = lib.typecheck('print 100');
            expect(type instanceof types.Variable).toBe(true);
        });
        it('let bindings', function() {
            var type = lib.typecheck('let x = 100\nx');
            expect(type instanceof types.NumberType).toBe(true);
        });
        describe('functions that implement', function() {
            it('identity', function() {
                var type = lib.typecheck('\\x -> x');
                expect(type instanceof types.FunctionType).toBe(true);
                expect(type.types[0] instanceof types.Variable).toBe(true);
                expect(type.types[1] instanceof types.Variable).toBe(true);
                expect(type.types[0].id).toEqual(type.types[1].id);
            });
            it('returning primitives', function() {
                var type = lib.typecheck('\\x -> 100');
                expect(type.types[0] instanceof types.Variable).toBe(true);
                expect(type.types[1] instanceof types.NumberType).toBe(true);
            });
        });
    });
});
