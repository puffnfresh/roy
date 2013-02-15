var roy = {};

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

    load["unicode-categories"] = function(exports) {
        //= node_modules/unicode-categories/index.js
    };

    load["./compile"] = function(exports) {
        //= src/compile.js
    };
    load["./lexer"] = function(exports) {
        //= src/lexer.js
    };
    load["./nodes"] = function(exports) {
        //= src/nodes.js
    };
    load["./modules"] = function(exports) {
        //= src/modules.js
    };
    load["./macroexpand"] = function(exports) {
        //= src/macroexpand.js
    };
    load["../lib/typeparser"] = function(exports) {
        //= lib/typeparser.js
    };
    load["../lib/parser"] = function(exports) {
        //= lib/parser.js
    };
    load["./typeinference"] = function(exports) {
        //= src/typeinference.js
    };
    load["./types"] = function(exports) {
        //= src/types.js
    };
    load["./tarjan"] = function(exports) {
        //= src/tarjan.js
    };
    load["./freeVariables"] = function(exports) {
        //= src/freeVariables.js
    };

    roy.lexer = require("./lexer");
    roy.compile = require("./compile").compile;
})();
