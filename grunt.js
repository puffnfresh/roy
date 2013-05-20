module.exports = function(grunt) {
    grunt.initConfig({
        lint: {
            src: ['./src/*.js']
        },
        jison: {
            './lib/typeparser.js': './src/typegrammar.js',
            './lib/parser.js': './src/grammar.js'
        },
        rigger: {
            'roy.js': 'rigger-roy.js'
        },
        jasmine: {
            specs: {
                src: './test',
                cache: ['./test', './src']
            }
        },
        min: {
            'roy-min.js': 'roy.js'
        },
        watch: {
            parsers: {
                files: './src/*grammar.js',
                tasks: 'jison'
            },
            jasmine: {
                files: ['./src/*.js', './test/*Spec.js'],
                tasks: 'jasmine'
            }
        }
    });

    grunt.registerMultiTask('jison', 'Parser generator by jison.', function() {
        var Parser = require('jison').Parser,
            grammar = require(this.data).grammar;
            parser = new Parser(grammar, {debug: true}),
            fs = require('fs');

        fs.writeFileSync(this.target, parser.generate());
    });

    grunt.registerMultiTask('rigger', 'File concatentation by rigger.', function() {
        var rigger = require('rigger'),
            fs = require('fs'),
            done = this.async(),
            target = this.target;

        rigger(this.data, function(err, output) {
            if(err) return grunt.log.error(err);
            fs.writeFileSync(target, output);
            done(true);
        });
    });

    grunt.registerMultiTask('jasmine', 'Testing by jasmine.', function() {
        var path = require('path'),
            specDir = this.file.src,
            badCache = grunt.utils._.map(this.data.cache || [], function(p) { return path.resolve(p); }),
            jasmine,
            done = this.async(),
            key;

        // Would be nice to use grunt.file.clearRequireCache
        grunt.utils._.each(require.cache, function(v, k) {
            var isBad = grunt.utils._.any(badCache, function(dir) {
                return k.indexOf(path.resolve(dir)) === 0;
            });
            if(!isBad) return;
            delete require.cache[k];
        });

        jasmine = require("jasmine-node");

        // Not nice (necessary for jasmine-node's asyncSpecWait, etc)
        for(key in jasmine) if(jasmine[key] instanceof Function) global[key] = jasmine[key];

        jasmine.executeSpecsInFolder({
            specFolders: [specDir],
            regExpSpec: /Comp.*Spec\.js/,
            onComplete: function(runner) {
                if (runner.results().failedCount > 0) {
                    grunt.log.error();
                }
                done(true);
            },
            isVerbose: true,
            showColors: true
        });
    });

    grunt.registerTask('default', 'jison lint jasmine rigger min');
};
