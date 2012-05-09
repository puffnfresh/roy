describe('compiler', function(){
    var roy = require('../../src/compile');

    function compilerOutput(s) {
        return roy.compile(s, {}, {}, {nodejs: true}).output;
    }

    it('should preserve comments', function(){
        expect(compilerOutput('// HELLO')).toEqual('// HELLO\n');
    });
});
