var roy;

//= node_modules/underscore/underscore.js

(function(){
    var module = {"parent": true};
    var modules = {"underscore": _};
    var load = {};
    var require = function(x){
        if(!modules[x]) {
            load[x](modules[x] = {})
        }
        return modules[x];
    }

    load["compile"] = function(exports) {
        //= src/compile.js
    };
    load["grammar"] = function(exports) {
        //= src/grammar.js
    };
    load["lexer"] = function(exports) {
        //= src/lexer.js
    };
    load["nodes"] = function(exports) {
        //= src/nodes.js
    };
    load["parser"] = function(exports) {
        //= src/parser.js
    };
    load["typeinference"] = function(exports) {
        //= src/typeinference.js
    };
    load["types"] = function(exports) {
        //= src/types.js
    };

    roy = require("compile");
})();
