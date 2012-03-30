var lexer = require('./lexer'),
    typeparser = require('./typeparser').parser,
    nodes = require('./nodes').nodes,
    types = require('./types'),
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

exports.loadModule = function(moduleName, opts) {
    if(!opts.modules) opts.modules = {};
    var path = require('path'),
        targetFile = resolveNodeModule(moduleName, opts.filename) + '.roym',
        source = '';
    
    if (path.existsSync(targetFile)) {
        source = opts.modules[moduleName] || require('fs').readFileSync(targetFile, 'utf8');
    }
    
    var tokens = lexer.tokenise(source);
    var moduleTypes = typeparser.parse(tokens);
    return moduleTypes;
};

exports.exportType = function(arg, env, exported, nodejs) {
    var name = arg.value;
    exported[name] = env[name];
    if(env[name] instanceof types.TagType) {
        return new nodes.Comment("// Exported type: " + name);
    }
    var scope = nodejs ? "exports" : "this";
    return new nodes.Assignment(new nodes.Access(new nodes.Identifier(scope), new nodes.String(JSON.stringify(name))), arg);
};
