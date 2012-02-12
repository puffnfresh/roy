var lexer = require('./lexer'),
    typeparser = require('./typeparser').parser,
    nodes = require('./nodes').nodes,
    _ = require('underscore');

var resolveNodeModule = function(moduleName, filename) {
    var path = require('path');

    // node.js uses a few prefixes to decide where to load from:
    // http://nodejs.org/docs/latest/api/all.html#loading_from_node_modules_Folders
    var relative = _.any(['/', './', '../'], function(e) {
        return moduleName.indexOf(e) == 0;
    });

    if(relative) {
        return path.resolve(path.dirname(filename), moduleName);
    } else {
        var resolved = require.resolve(moduleName);
        return path.join(path.dirname(resolved), path.basename(resolved, '.js'));
    }
};

exports.loadModule = function(moduleName, mode, argument) {
    var source;
    switch(mode) {
    case "require":
        source = require('fs').readFileSync(resolveNodeModule(moduleName, argument) + '.roym', 'utf8');
        break;
    case "amd":
        throw new Error("TODO: Implement AMD support");
        break;
    case "browser":
    default:
        source = argument[moduleName];
        break;
    }

    var tokens = lexer.tokenise(source);
    var moduleTypes = typeparser.parse(tokens);
    return moduleTypes;
};

exports.exportType = function(arg, env, exported, nodejs) {
    var name = arg.value;
    exported[name] = env[name];
    var scope = nodejs ? "exports" : "this";
    return new nodes.Assignment(new nodes.Access(new nodes.Identifier(scope), new nodes.String(JSON.stringify(name))), arg);
};
