/*jshint expr:true*/
var _ = require('underscore');
var nodes = require('./nodes');

var fv = {};

/** @typedef {node.Function|node.Instance|node.Return|node.Bind|node.Do|node.Match|node.Case|node.Assignment|node.Let|node.Call|node.IfThenElse|node.Comment|node.PropertyAccess|node.Access|node.BinaryGenericOperator|node.BinaryNumberOperator|node.BinaryBooleanOperator|node.BinaryStringOperator|node.With|node.Identifier|node.Tuple|node.Number|node.String|node.Boolean|node.Array|node.Object} */
fv.Node;

/**
 * Returns free variables in given node.
 *
 * @param {fv.Node} node Subject node.
 * @return {!Object.<!string, !boolean>} A set of free variable names.
 */
function getFreeVariables(node) {
    var visitor = {
        visitFunction: function(node) {
            var bodyFreeVariables = getFreeVariablesOfBlock(node.body);

            _.each(node.whereDecls, function(whereDecl) {
                       _.extend(bodyFreeVariables, whereDecl.accept(visitor));
                   });

            delete bodyFreeVariables[node.name];

            _.each(node.args, function(arg) {
                       delete bodyFreeVariables[arg.name];
                   });

            _.each(node.whereDecls, function(whereDecl) {
                       _.each(getBindingVariables(whereDecl), function(value, name) {
                                  delete bodyFreeVariables[name];
                              });
                   });

            return bodyFreeVariables;
        },
        visitInstance: function(node) {
            return node.object.accept(visitor);
        },
        visitReturn: function(node) {
            return node.value.accept(visitor);
        },
        visitBind: function(node) {
            // Note: Bind is not recursive.
            return node.value.accept(visitor);
        },
        visitDo: function(node) {
            var variables = {};

            _.extend(variables, node.value.accept(visitor));
            _.extend(variables, getFreeVariablesOfBlock(node.body));

            return variables;
        },
        visitMatch: function(node) {
            var variables = {};

            _.extend(variables, node.value.accept(visitor));

            _.each(node.cases, function(caseNode) {
                       _.extend(variables, caseNode.accept(visitor));
                   });

            return variables;
        },
        visitCase: function(node) {
            var variables = {};

            _.extend(variables, node.value.accept(visitor));

            var variableGatherer = {
                visitIdentifier: function(identifier) {
                    if (identifier.value === '_') {
                        return [];
                    } else {
                        return [identifier.value];
                    }
                },
                visitPattern: function(pattern) {
                    return _.flatten(_.map(pattern.vars, function(subPattern) {
                                        return subPattern.accept(variableGatherer);
                                    }));
                }
            };

            _.each(node.pattern.accept(variableGatherer), function(value, variable) {
                       delete variables[variable];
                   });

            return variables;
        },
        visitAssignment: function(node) {
            var variables = node.value.accept(visitor);

            delete variables[node.name];

            return variables;
        },
        visitLet: function(node) {
            var variables = node.value.accept(visitor);

            delete variables[node.name];

            return variables;
        },
        visitCall: function(node) {
            var variables = {};

            _.extend(variables, node.func.accept(visitor));
            _.each(node.args, function(arg) {
                       _.extend(variables, arg.accept(visitor));
                   });

            return variables;
        },
        visitIfThenElse: function(node) {
            var variables = {};

            _.extend(variables, node.condition.accept(visitor));

            _.each(node.ifTrue, function(line) {
                       _.extend(variables, line.accept(visitor));
                   });
            _.each(node.ifFalse, function(line) {
                       _.extend(variables, line.accept(visitor));
                   });

            return variables;
        },
        visitComment: function(node) {
            return {};
        },
        visitPropertyAccess: function(node) {
            return node.value.accept(visitor);
        },
        visitAccess: function(node) {
            var variables = {};

            _.extend(variables, node.value.accept(visitor));
            _.extend(variables, node.property.accept(visitor));

            return variables;
        },
        visitBinaryGenericOperator: function(node) {
            var variables = {};

            _.extend(variables, node.left.accept(visitor));
            _.extend(variables, node.right.accept(visitor));

            return variables;
        },
        visitBinaryNumberOperator: function(node) {
            var variables = {};

            _.extend(variables, node.left.accept(visitor));
            _.extend(variables, node.right.accept(visitor));

            return variables;
        },
        visitBinaryBooleanOperator: function(node) {
            var variables = {};

            _.extend(variables, node.left.accept(visitor));
            _.extend(variables, node.right.accept(visitor));

            return variables;
        },
        visitBinaryStringOperator: function(node) {
            var variables = {};

            _.extend(variables, node.left.accept(visitor));
            _.extend(variables, node.right.accept(visitor));

            return variables;
        },
        visitWith: function(node) {
            var variables = {};

            _.extend(variables, node.left.accept(visitor));
            _.extend(variables, node.right.accept(visitor));

            return variables;
        },
        visitIdentifier: function(node) {
            var variables = {};

            variables[node.value] = true;

            return variables;
        },
        visitTuple: function(node) {
            var variables = {};

            _.each(node.values, function(value) {
                       _.extend(variables, value.accept(visitor));
                   });

            return variables;
        },
        visitNumber: function(node) {
            return {};
        },
        visitString: function(node) {
            return {};
        },
        visitBoolean: function(node) {
            return {};
        },
        visitArray: function(node) {
            var variables = {};

            _.each(node.values, function(value) {
                       _.extend(variables, value.accept(visitor));
                   });

            return variables;
        },
        visitObject: function(node) {
            var variables = {};

            _.each(node.values, function(value) {
                       _.extend(variables, value.accept(visitor));
                   });

            return variables;
        }
    };

    return node.accept(visitor);
}

/**
 * Returns free variables in given block.
 *
 * @param {Array.<fv.Node>} block Subject block.
 * @return {!Object.<!string, !boolean>} A set of free variable names.
 */
function getFreeVariablesOfBlock(block) {
    var freeVariables = {};
    var boundVariables = {};

    _.each(block, function(line) {
               var bindingVariables = getBindingVariables(line);

               _.extend(boundVariables, bindingVariables);

               _.each(getFreeVariables(line), function(value, variable) {
                          if (!boundVariables[variable]) {
                              freeVariables[variable] = true;
                          }
                      });
           });

    return freeVariables;
}

/**
 * Returns variables bound in current environment by given node.
 *
 * For example, let expressions bind variables in current environment.
 *
 * @param {fv.Node} node Subject node
 * @return {!Object.<!string, !boolean>} A set of variable names bound in current environment by given node
 */
function getBindingVariables(node) {
    var returnEmpty = function(node) {
        return {};
    };

    var singleton = function(name) {
        var variables = {};

        variables[name] = true;

        return variables;
    };

    var returnName = function(node) {
        return singleton(node.name);
    };

    var visitor = {
        visitData: function(node) {
            var variables = {};

            variables[node.name] = true;

            _.each(node.tags, function(tag) {
                       _.extend(variables, tag.accept(visitor));
                   });

            return variables;
        },
        visitFunction: returnName,
        visitInstance: returnName,
        visitBind: returnName,
        visitTag: returnName,
        visitAssignment: returnName,
        visitLet: returnName,

        // all others don't bind variables in current environment;
        // they bind no variables or bind in their own environment.
        visitExpression: returnEmpty,
        visitType: returnEmpty,
        visitTypeClass: returnEmpty,
        visitGeneric: returnEmpty,
        visitReturn: returnEmpty,
        visitDo: returnEmpty,
        visitMatch: returnEmpty,
        visitCall: returnEmpty,
        visitIfThenElse: returnEmpty,
        visitComment: returnEmpty,
        visitPropertyAccess: returnEmpty,
        visitAccess: returnEmpty,
        visitBinaryGenericOperator: returnEmpty,
        visitBinaryNumberOperator: returnEmpty,
        visitBinaryBooleanOperator: returnEmpty,
        visitBinaryStringOperator: returnEmpty,
        visitWith: returnEmpty,
        visitIdentifier: returnEmpty,
        visitTuple: returnEmpty,
        visitNumber: returnEmpty,
        visitString: returnEmpty,
        visitBoolean: returnEmpty,
        visitArray: returnEmpty,
        visitObject: returnEmpty
    };

    return node.accept(visitor);
}

exports.getFreeVariables = getFreeVariables;
