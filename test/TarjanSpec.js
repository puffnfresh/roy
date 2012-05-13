describe('tarjan', function(){
    var tarjan = require('../src/tarjan.js'),
        stronglyConnectedComponents = tarjan.stronglyConnectedComponents,
        _ = require('underscore');

    it('should identify strongly connected components', function() {
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

        var sortedComponents = _.map(components, function(component) {
            return _.sortBy(component, function(vertex) {
                return vertex.id;
            });
        });

        expect(sortedComponents).toEqual([
            [
                {id: 'f'},
                {id: 'g'}
            ],
            [
                {id: 'c'},
                {id: 'd'},
                {id: 'h'},
            ],
            [
                {id: 'a'},
                {id: 'b'},
                {id: 'e'}
            ]
        ]);
    });
});
