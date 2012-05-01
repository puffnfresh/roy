var stronglyConnectedComponents = require('../src/tarjan.js').stronglyConnectedComponents;
var _ = require('underscore');

var a = {id: "a"};
var b = {id: "b"};
var c = {id: "c"};
var d = {id: "d"};
var e = {id: "e"};
var f = {id: "f"};
var g = {id: "g"};
var h = {id: "h"};
var vertices = [a, b, c, d, e, f, g, h];
var edges = {
    "a": [b],
    "b": [c, e, f],
    "c": [d, g],
    "d": [c, h],
    "e": [a, f],
    "f": [g],
    "g": [f],
    "h": [d, g]
};

var components = stronglyConnectedComponents({vertices: vertices, edges: edges});

_.each(components, function(component) {
           component = _.sortBy(component, function(vertex) {
                                    return vertex.id;
                                });

           _.each(component, function(vertex) {
                      console.log(vertex.id);
                  });
           console.log();
       });