var fs = require('fs');
var path = require('path');

var dir = 'src';
var files = fs.readdirSync(dir);

var underscore = fs.readFileSync('node_modules/underscore/underscore-min.js', 'utf8');
var output = underscore + '\nvar roy;(function(){var module={parent:true};var modules={"underscore": _};var load={};var require=function(x){if(!modules[x]){load[x](modules[x] = {})};return modules[x]}\n';
files.forEach(function(file) {
    var input = fs.readFileSync(path.join(dir, file), 'utf8');
    var name = JSON.stringify(path.basename(file, '.js'));
    output += 'load[' + name + '] = function(exports){' + input + '}\n';
});
output += '\nroy=require("compile")})()'

fs.writeFile('bundled-roy.js', output);
