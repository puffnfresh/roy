describe('compiler', function(){
    var roy = require('../src/compile'),
        fs = require('fs'),
        path = require('path'),
        child_process = require('child_process'),
        processBin = process.argv[0];

    function compilerOutput(s) {
        return roy.compile(s, {}, {}, {nodejs: true}).output;
    }

    function fixtureCompilerOutput(s) {
        return compilerOutput(fs.readFileSync(path.join('test', 'fixtures', s + '.roy'), 'utf8'));
    }

    function fixtureExpectedOutput(s) {
        return fs.readFileSync(path.join('test', 'fixtures', s + '.out'), 'utf8');
    }

    function expectExecutionToHaveExpectedOutput(s) {
        var expected = fixtureExpectedOutput(s);
        var compiled = fixtureCompilerOutput(s);

        var child = child_process.spawn(processBin);
        child.stdin.write(compiled, 'utf8');
        child.stdin.end();
        child.stdout.setEncoding('utf8');

        var actual = '';
        asyncSpecWait();
        child.stdout.on('data', function(d) {
            actual += d;
        });
        child.stdout.on('end', function() {
            expect(actual).toEqual(expected);
            asyncSpecDone();
        });
    }

    it('should preserve comments', function(){
        expect(compilerOutput('// HELLO')).toEqual('// HELLO\n');
    });

    describe('should execute', function() {
        it('accessors.roy with expected output', function() {
            expectExecutionToHaveExpectedOutput('good/accessors');
        });
        it('coercing_native_to_any.roy with expected output', function() {
            expectExecutionToHaveExpectedOutput('good/coercing_native_to_any');
        });
        it('conditionals.roy with expected output', function() {
            expectExecutionToHaveExpectedOutput('good/conditionals');
        });
        it('deep_matching.roy with expected output', function() {
            expectExecutionToHaveExpectedOutput('good/deep_matching');
        });
        it('functions.roy with expected output', function() {
            expectExecutionToHaveExpectedOutput('good/functions');
        });
        it('list_comprehension.roy with expected output', function() {
            expectExecutionToHaveExpectedOutput('good/list_comprehension');
        });
        it('map.roy with expected output', function() {
            expectExecutionToHaveExpectedOutput('good/map');
        });
        it('monoid.roy with expected output', function() {
            expectExecutionToHaveExpectedOutput('good/monoid');
        });
        it('option_monad.roy with expected output', function() {
            expectExecutionToHaveExpectedOutput('good/option_monad');
        });
        it('primitive_types.roy with expected output', function() {
            expectExecutionToHaveExpectedOutput('good/primitive_types');
        });
        it('tagged_unions.roy with expected output', function() {
            expectExecutionToHaveExpectedOutput('good/tagged_unions');
        });
        it('trace_monad.roy with expected output', function() {
            expectExecutionToHaveExpectedOutput('good/trace_monad');
        });
        it('unicode.roy with expected output', function() {
            expectExecutionToHaveExpectedOutput('good/unicode');
        });
        it('where.roy with expected output', function() {
            expectExecutionToHaveExpectedOutput('good/where');
        });
    });
});
