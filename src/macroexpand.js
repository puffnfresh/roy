var nodes = require('./nodes').nodes,
    _ = require('underscore');

var macros = {};
var macroexpand = function(ast, env, opts) {
    var compileNodeWithEnv = require('./compile').compileNodeWithEnv;
    return _.map(ast, function(n) {
        var replacement = n.accept({
            visitMacro: function() {
                var init = n.body.slice(0, n.body.length - 1);
                var last = n.body[n.body.length - 1];
                var code = _.map(init, function(node) {
                    return compileNodeWithEnv(node, env);
                }).join('\n') + '\nreturn ' + compileNodeWithEnv(last, env) + ';';
                macros[n.name] = code;
            },
            visitCall: function() {
                if(!macros[n.func.value]) return;

                var f = new Function('var nodes = this.nodes; ' + macros[n.func.value]);
                var tree = f.apply({nodes: nodes}, n.args);

                return tree;
            }
        });

        return replacement || n;
    });
};
exports.macroexpand = macroexpand;
