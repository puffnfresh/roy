var nodes = require('./nodes').nodes,
    types = require('./types'),
    nodeToType = require('./typeinference').nodeToType,
    loadModule = require('./modules').loadModule,
    _ = require('underscore');

var macros = {
    'import': [
        'var name = JSON.parse(arguments[0].value);',
        'if(internals.opts.nodejs) {',
        '    // Need to convert to absolute paths for the CLI',
        '    if(internals.opts.run) {',
        '        var path = internals.require("path");',
        '        name = path.resolve(path.dirname(internals.opts.filename), name);',
        '    }',
        '',
        '    var moduleTypes = internals.loadModule(name, "require", internals.opts.filename);',
        '    var variable = name.substr(name.lastIndexOf("/") + 1);',
        '    internals.env[variable] = new internals.types.Variable();',
        '    var props = {};',
        '    internals._.each(moduleTypes.env, function(v, k) {',
        '        props[k] = internals.nodeToType(v, internals.env, {});',
        '    });',
        '    internals.env[variable] = new internals.types.ObjectType(props);',
        '',
        '    console.log("Using sync CommonJS module:", name);',
        '',
        '    return new nodes.Let(variable, new nodes.Call(new nodes.Identifier("require"), [new nodes.String(JSON.stringify(name))]), new nodes.TypeObject(moduleTypes.env));',
        '} else {',
        '    var moduleTypes = internals.loadModule(name, "browser", internals.opts.modules);',
        '    internals._.each(moduleTypes.env, function(v, k) {',
        '        internals.env[k] = internals.nodeToType(v, internals.env, {});',
        '    });',
        '    return new nodes.Comment("// Using browser module: " + arguments[0].value);',
        '}'].join('\n')
};
var macroexpand = function(ast, env, opts) {
    return _.map(ast, function(n) {
        var replacement = n.accept({
            visitMacro: function() {
                var init = n.body.slice(0, n.body.length - 1);
                var last = n.body[n.body.length - 1];
                var code = _.map(init, compileNode).join('\n') + '\nreturn ' + compileNode(last) + ';';
                macros[n.name] = code;
            },
            visitCall: function() {
                if(!macros[n.func.value]) return;

                var f = new Function('var nodes = this.nodes; var internals = this.internals; ' + macros[n.func.value]);
                var tree = f.apply({
                    nodes: nodes,
                    internals: {
                        require: require,
                        env: env,
                        loadModule: loadModule,
                        types: types,
                        nodeToType: nodeToType,
                        opts: opts,
                        "_": _
                    }
                }, n.args);

                return tree;
            }
        });

        return replacement || n;
    });
};
exports.macroexpand = macroexpand;
