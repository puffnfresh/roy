var _ = require('underscore');

/**
 * Decomposes a graph into strongly connected components and return them.
 *
 * @param {{vertices: !Array.<!{id: !string}>, edges: Object.<!string, Array.<!{id: !string}>}
 *     graph
 *       Graph to be decomposed.
 *       vertices are any objects with id.
 *       edges are map from id to array of vertices.
 * @return {!Array.<!Array.<!{id: !string}>>} An array of strongly connected components.
 */
function stronglyConnectedComponents(graph) {
    // Tarjan's strongly connected components algorithm
    var index = 0;
    var stack = [];
    var isInStack = [];
    var indices = [];
    var smallestReachableIndex = [];
    var components = [];

    var visit = function (vertex) {
        indices[vertex.id] = index;
        smallestReachableIndex[vertex.id] = index;
        index += 1;

        stack.push(vertex);
        isInStack[vertex.id] = true;

        _.each(graph.edges[vertex.id], function(following) {
                   if (indices[following.id] === undefined) {
                       visit(following);
                       smallestReachableIndex[vertex.id] =
                           Math.min(smallestReachableIndex[vertex.id],
                                    smallestReachableIndex[following.id]);
                   } else if (isInStack[following.id]) {
                       smallestReachableIndex[vertex.id] =
                           Math.min(smallestReachableIndex[vertex.id],
                                    indices[following.id]);
                   }
               });

        if (smallestReachableIndex[vertex.id] === indices[vertex.id]) {
            var currentComponent = [],
                popped;

            do {
                popped = stack.pop();

                isInStack[popped.id] = false;

                currentComponent.push(popped);
            } while (vertex.id != popped.id);

            components.push(currentComponent);
        }
    };

    _.each(graph.vertices, function(vertex) {
               if (indices[vertex.id] === undefined) {
                   visit(vertex);
               }
           });

    return components;
}

exports.stronglyConnectedComponents = stronglyConnectedComponents;