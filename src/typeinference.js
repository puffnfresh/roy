// ## Bottom-Up Type Inference
var _ = require('underscore'),
    t = require('./types');

// ### Constraints
function Constraint() {}
Constraint.prototype.constructor = Constraint;

// #### Equality constraints
// `a` and `b` must be equal.
function EqualityConstraint(a, b) {
    this.a = a;
    this.b = b;
}
EqualityConstraint.prototype.constructor = EqualityConstraint;


function generate(node, constraints, assumptions) {
    function nothingNew() {
        return {
            constraints: constraints,
            assumptions: assumptions
        };
    };

    function addAssumptions(f) {
        return function() {
            return {
                constraints: constraints,
                assumptions: f(node)
            };
        };
    }

    return node.accept({
        visitIdentifier: addAssumptions(function() {
            var assumptions = {};
            assumptions[node.value] = new t.Variable();
            return assumptions;
        }),
        visitBoolean: nothingNew,
        visitNumber: nothingNew,
        visitString: nothingNew
    });
}

// Run inference on an array of AST nodes.
var typecheck = function(nodes) {
    var result = _.reduce(nodes, function(accum, node) {
        return generate(node, accum.constraints, accum.assumptions);
    }, {
        constraints: [],
        assumptions: {}
    });
    return result;
};
exports.typecheck = typecheck;
