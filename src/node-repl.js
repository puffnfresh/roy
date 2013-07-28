var compile = require('./compile').compile,
    lexer = require('./lexer'),
    loadModule = require('./modules').loadModule,
    parser = require('../lib/parser').parser,
    _ = require('underscore');

function getSandbox() {
    var sandbox = {require: require, exports: exports},
        name;

    for(name in global) {
        sandbox[name] = global[name];
    }

    return sandbox;
}

function getFileContents(filename) {
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
    if(/\..+$/.test(filename)) {
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
}

function nodeRepl(opts) {
    var readline = require('readline'),
        fs = require('fs'),
        path = require('path'),
        vm = require('vm'),
        prettyPrint = require('./prettyprint').prettyPrint,

        prelude = fs.readFileSync(path.dirname(__dirname) + '/lib/prelude.roy', 'utf8'),

        stdout = process.stdout,
        stdin = process.openStdin(),
        repl = readline.createInterface(stdin, stdout),

        env = {},
        sources = {},
        aliases = {},
        sandbox = getSandbox();

    // Prologue
    console.log("Roy: " + opts.info.description);
    console.log(opts.info.author);
    console.log(":? for help");

    function colorLog(color) {
        var args = [].slice.call(arguments, 1);

        args[0] = '\u001b[' + color + 'm' + args[0];
        args[args.length - 1] = args[args.length - 1] + '\u001b[0m';

        console.log.apply(console, args);
    }

    // Include the standard library
    vm.runInNewContext(compile(prelude, {nodejs: true}).output, sandbox, 'eval');
    repl.setPrompt('roy> ');
    repl.on('close', function() {
        stdin.destroy();
    });
    repl.on('line', function(line) {
        var metacommand = line.replace(/^\s+/, '').split(' '),
            compiled,
            output,

            filename,
            source,

            tokens,
            ast;


        // Check for a "metacommand"
        // e.g. ":q" or ":l test.roy"
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
                compiled = compile(source, {nodejs: true, filename: ".", run: true});
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
                    } else {
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
                if(typeof ast.body[0] != 'undefined') {
                    ast.body[0].accept({
                        visitLet: function(n) {
                            sources[n.name] = n.value;
                        }
                    });
                }

                // Just eval it
                compiled = compile(line, {nodejs: true, filename: ".", run: true});
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
}

function writeModule(env, exported, filename) {
    var fs = require('fs'),
        moduleOutput = _.map(exported, function(v, k) {
            if(v instanceof types.TagType) {
                return 'type ' + v.toString().replace(/#/g, '');
            }
            return k + ': ' + v.toString();
        }).join('\n') + '\n';

    fs.writeFile(filename, moduleOutput, 'utf8');
}

function runRoy(argv, opts) {
    var fs = require('fs'),
        path = require('path'),
        vm = require('vm'),

        extensions = /\.l?roy$/,

        env = {},
        aliases = {},
        sandbox = getSandbox(),
        exported,
        modules;

    if(opts.run) {
        // Include the standard library
        if(opts.includePrelude) {
            argv.unshift(path.dirname(__dirname) + '/lib/prelude.roy');
        }
    } else {
        modules = [];
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
        var source = getFileContents(filename),
            outputPath = filename.replace(extensions, '.js'),
            SourceMapGenerator = require('source-map').SourceMapGenerator,
            sourceMap = new SourceMapGenerator({file: path.basename(outputPath)}),
            compiled;

        console.assert(filename.match(extensions), 'Filename must end with ".roy" or ".lroy"');

        exported = {};
        compiled = compile(source, {
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
            fs.writeFile(outputPath, compiled.output + '\n//@ sourceMappingURL=' + path.basename(outputPath) + '.map\n', 'utf8');
            fs.writeFile(outputPath + '.map', sourceMap.toString(), 'utf8');
            writeModule(env, exported, filename.replace(extensions, '.roym'));
        }
    });
}

function processFlags(argv, opts) {
    var source;

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
        console.log("-h --help      : show this help");
        console.log("-p             : run without prelude (standard library)");
        console.log("-r [file]      : run Roy-code without JavaScript output");
        console.log("-s --stdio     : read script from stdin and output to stdout");
        console.log("-v --version   : show current version");
        return;
    case "-s":
    case "--stdio":
        source = '';
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', function(data) {
            source += data;
        });
        process.stdin.on('end', function() {
            console.log(compile(source, opts).output);
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
        // The default now
        nodeRepl(opts);
        return;
    default:
        runRoy(argv, opts);
        return;
    }

    processFlags(argv, opts);
}

function main() {
    var argv = process.argv.slice(2),
        fs = require('fs'),
        path = require('path'),

        // Meta-commands configuration
        opts = {
            info: JSON.parse(fs.readFileSync(path.dirname(__dirname) + '/package.json', 'utf8')),
            nodejs: true,
            run: false,
            includePrelude: true,
            strict: false
        };

    processFlags(argv, opts);
}
module.exports = main;

if(module && !module.parent) {
    main();
}
