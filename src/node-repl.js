var compile = require('./compile').compile,
    lexer = require('./lexer'),
    parser = require('../lib/parser').parser;

var getSandbox = function() {
    var sandbox = {require: require, exports: exports};

    var name;
    for(name in global) {
        sandbox[name] = global[name];
    }

    return sandbox;
};

var getFileContents = function(filename) {
    var fs = require('fs'),
        exts = ["", ".roy", ".lroy"],
        filenames = _.map(exts, function(ext){
            return filename + ext;
        }),
        foundFilename,
        source,
        err,
        i;

    // Check to see if an extension is specified, if so, don't bother
    // checking others
    if (/\..+$/.test(filename)) {
        source = fs.readFileSync(filename, 'utf8');
        filenames = [filename];
    } else {
        foundFilename = _.find(filenames, function(filename) {
            return fs.existsSync(filename);
        });
        if(foundFilename) {
            source = fs.readFileSync(foundFilename, 'utf8');
        }
    }

    if(!source) {
        throw new Error("File(s) not found: " + filenames.join(", "));
    }

    return source;
};

var nodeRepl = function(opts) {
    var readline = require('readline'),
        path = require('path'),
        vm = require('vm'),
        prettyPrint = require('./prettyprint').prettyPrint;

    var stdout = process.stdout;
    var stdin = process.openStdin();
    var repl = readline.createInterface(stdin, stdout);

    var env = {};
    var sources = {};
    var aliases = {};
    var sandbox = getSandbox();

    // Prologue
    console.log("Roy: " + opts.info.description);
    console.log(opts.info.author);
    console.log(":? for help");

    var colorLog = function(color) {
        var args = [].slice.call(arguments, 1);

        if(opts.colorConsole) {
            args[0] = '\u001b[' + color + 'm' + args[0];
            args[args.length - 1] = args[args.length - 1] + '\u001b[0m';
        }

        console.log.apply(console, args);
    };

    // Include the standard library
    var fs = require('fs');
    var prelude = fs.readFileSync(path.dirname(__dirname) + '/lib/prelude.roy', 'utf8');
    vm.runInNewContext(compile(prelude, env, {}, {nodejs: true}).output, sandbox, 'eval');
    repl.setPrompt('roy> ');
    repl.on('close', function() {
        stdin.destroy();
    });
    repl.on('line', function(line) {
        var compiled;
        var output;

        var filename;
        var source;

        var tokens;
        var ast;

        // Check for a "metacommand"
        // e.g. ":q" or ":l test.roy"
        var metacommand = line.replace(/^\s+/, '').split(' ');
        try {
            switch(metacommand[0]) {
            case ":q":
                // Exit
                process.exit();
                break;
            case ":l":
                // Load
                filename = metacommand[1];
                source = getFileContents(filename);
                compiled = compile(source, env, aliases, {nodejs: true, filename: ".", run: true});
                break;
            case ":t":
                if(metacommand[1] in env) {
                    console.log(env[metacommand[1]].toString());
                } else {
                    colorLog(33, metacommand[1], "is not defined.");
                }
                break;
            case ":s":
                // Source
                if(sources[metacommand[1]]) {
                    colorLog(33, metacommand[1], "=", prettyPrint(sources[metacommand[1]]));
                } else {
                    if(metacommand[1]){
                        colorLog(33, metacommand[1], "is not defined.");
                    }else{
                        console.log("Usage :s command ");
                        console.log(":s [identifier] :: show original code about identifier.");
                    }
                }
                break;
            case ":?":
                // Help
                colorLog(32, "Commands available from the prompt");
                console.log(":l -- load and run an external file");
                console.log(":q -- exit REPL");
                console.log(":s -- show original code about identifier");
                console.log(":t -- show the type of the identifier");
                console.log(":? -- show help");
                break;
            default:
                // The line isn't a metacommand

                // Remember the source if it's a binding
                tokens = lexer.tokenise(line);
                ast = parser.parse(tokens);
                ast.body[0].accept({
                    visitLet: function(n) {
                        sources[n.name] = n.value;
                    }
                });

                // Just eval it
                compiled = compile(line, env, aliases, {nodejs: true, filename: ".", run: true});
                break;
            }

            if(compiled) {
                output = vm.runInNewContext(compiled.output, sandbox, 'eval');

                if(typeof output != 'undefined') {
                    colorLog(32, (typeof output == 'object' ? JSON.stringify(output) : output) + " : " + compiled.type);
                }
            }
        } catch(e) {
            colorLog(31, (e.stack || e.toString()));
        }
        repl.prompt();
    });
    repl.prompt();
};

var writeModule = function(env, exported, filename) {
    var fs = require('fs');

    var moduleOutput = _.map(exported, function(v, k) {
        if(v instanceof types.TagType) {
            return 'type ' + v.toString().replace(/#/g, '');
        }
        return k + ': ' + v.toString();
    }).join('\n') + '\n';
    fs.writeFile(filename, moduleOutput, 'utf8');
};

var importModule = function(name, env, opts) {
    var addTypesToEnv = function(moduleTypes) {
        _.each(moduleTypes, function(v, k) {
            var dataType = [new types.TagNameType(k)];
            _.each(function() {
                dataType.push(new types.Variable());
            });
            env[k] = new types.TagType(dataType);
        });
    };

    var moduleTypes;
    if(opts.nodejs) {
        // Need to convert to absolute paths for the CLI
        if(opts.run) {
            var path = require("path");
            name = path.resolve(path.dirname(opts.filename), name);
        }

        moduleTypes = loadModule(name, opts);
        addTypesToEnv(moduleTypes.types);
        var variable = name.substr(name.lastIndexOf("/") + 1);
        env[variable] = new types.Variable();
        var props = {};
        _.each(moduleTypes.env, function(v, k) {
            props[k] = nodeToType(v, env, {});
        });
        env[variable] = new types.ObjectType(props);

        console.log("Using sync CommonJS module:", name);

        return variable + " = require(" + JSON.stringify(name) + ")";
    } else {
        moduleTypes = loadModule(name, opts);
        addTypesToEnv(moduleTypes.types);
        _.each(moduleTypes.env, function(v, k) {
            env[k] = nodeToType(v, env, {});
        });

        if(console) console.log("Using browser module:", name);

        return "";
    }
};

var runRoy = function(argv, opts) {
    var fs = require('fs');
    var path = require('path');
    var vm = require('vm');

    var extensions = /\.l?roy$/;
    var literateExtension = /\.lroy$/;

    var exported;
    var env = {};
    var aliases = {};
    var sandbox = getSandbox();

    if(opts.run) {
        // Include the standard library
        if(opts.includePrelude) {
            argv.unshift(path.dirname(__dirname) + '/lib/prelude.roy');
        }
    } else {
        var modules = [];
        if(!argv.length || argv[0] != 'lib/prelude.roy') {
            modules.push(path.dirname(__dirname) + '/lib/prelude');
        }
        _.each(modules, function(module) {
            var moduleTypes = loadModule(module, {filename: '.'});
            _.each(moduleTypes.env, function(v, k) {
                env[k] = new types.Variable();
                env[k] = nodeToType(v, env, aliases);
            });
        });
    }

    _.each(argv, function(filename) {
        // Read the file content.
        var source = getFileContents(filename);

        if(filename.match(literateExtension)) {
            // Strip out the Markdown.
            source = source.match(/^ {4,}.+$/mg).join('\n').replace(/^ {4}/gm, '');
        } else {
            console.assert(filename.match(extensions), 'Filename must end with ".roy" or ".lroy"');
        }

        exported = {};
        var outputPath = filename.replace(extensions, '.js');
        var SourceMapGenerator = require('source-map').SourceMapGenerator;
        var sourceMap = new SourceMapGenerator({file: path.basename(outputPath)});

        var compiled = compile(source, env, aliases, {
            nodejs: opts.nodejs,
            filename: filename,
            run: opts.run,
            exported: exported,
            sourceMap: sourceMap
        });
        if(opts.run) {
            // Execute the JavaScript output.
            output = vm.runInNewContext(compiled.output, sandbox, 'eval');
        } else {
            // Write the JavaScript output.
            fs.writeFile(outputPath, compiled.output + '//@ sourceMappingURL=' + path.basename(outputPath) + '.map\n', 'utf8');
            fs.writeFile(outputPath + '.map', sourceMap.toString(), 'utf8');
            writeModule(env, exported, filename.replace(extensions, '.roym'));
        }
    });
};

var processFlags = function(argv, opts) {
    if(argv.length === 0) {
        nodeRepl(opts);
        return;
    }

    switch(argv[0]) {
    case "-v":
    case "--version":
        console.log("Roy: " + opts.info.description);
        console.log(opts.info.version);
        process.exit();
         break;
    case "-h":
    case "--help":
        console.log("Roy: " + opts.info.description + "\n");
        console.log("-b --browser   : wrap the output in a top level function");
        console.log("   --strict    : include \"use strict\";");
        console.log("-c --color     : colorful REPL mode");
        console.log("-h --help      : show this help");
        console.log("-p             : run without prelude (standard library)");
        console.log("-r [file]      : run Roy-code without JavaScript output");
        console.log("-s --stdio     : read script from stdin and output to stdout");
        console.log("-v --version   : show current version");
        return;
    case "-s":
    case "--stdio":
        var source = '';
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', function(data) {
            source += data;
        });
        process.stdin.on('end', function() {
            console.log(compile(source, null, null, opts).output);
        });
        return;
    case "-p":
        opts.includePrelude = false;
        /* falls through */
    case "-r":
        opts.run = true;
        argv.shift();
        break;
    case "-b":
    case "--browser":
        opts.nodejs = false;
        argv.shift();
        break;
    case "--strict":
        opts.strict = true;
        argv.shift();
        break;
    case "-c":
    case "--color":
        opts.colorConsole = true;
        nodeRepl(opts);
        return;
    default:
        runRoy(argv, opts);
        return;
    }

    processFlags(argv, opts);
};

var main = function() {
    var argv = process.argv.slice(2);

    // Roy package information
    var fs = require('fs');
    var path = require('path');

    // Meta-commands configuration
    var opts = {
        colorConsole: false,
        info: JSON.parse(fs.readFileSync(path.dirname(__dirname) + '/package.json', 'utf8')),
        nodejs: true,
        run: false,
        includePrelude: true,
        strict: false
    };

    processFlags(argv, opts);
};
module.exports = main;

if(module && !module.parent) {
    main();
}
