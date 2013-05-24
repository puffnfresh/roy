// ## Bottom-Up Type Inference
var _ = require('underscore'),
    t = require('./types');

// ### Constraints
// We generate constraints from the bottom-up over the AST. The
// type-checking phase is just trying to solve these constraints.

// #### Equality constraints
// `a` and `b` must be equal.
function EqualityConstraint(a, b, node) {
    this.a = a;
    this.b = b;
    this.node = node;

    this.cata = function(f, _a, _b, _c) {
        return f(this);
    };
}

// #### Implicit constraints
function ImplicitConstraint(a, b, monomorphic, node) {
    this.a = a;
    this.b = b;
    this.monomorphic = monomorphic;
    this.node = node;

    this.cata = function(_a, f, _b, _c) {
        return f(this);
    };
}

// #### Explicit constraints
function ExplicitConstraint(a, scheme, node) {
    this.a = a;
    this.scheme = scheme;
    this.node = node;

    this.cata = function(_a, _b, f, _c) {
        return f(this);
    };
}

// #### Predicate constraints
function PredicateConstraint(a, b) {
    this.a = a;
    this.b = b;

    this.cata = function(_a, _b, _c, f) {
        return f(this);
    };
}

function TypeClassPredicate(instances, type) {
    this.instances = instances;
    this.type = type;
}

// ### Type scheme
function Scheme(s, t) {
    this.s = s;
    this.t = t;
}

// ### Inference state
// Immutable state monoid containing both the current constraints and
// assumptions
function InferenceState(constraints, assumptions, instances) {
    this.constraints = constraints || [];
    this.assumptions = assumptions || {};
    this.instances = instances || {};
}
InferenceState.empty = new InferenceState();
InferenceState.concat = function(states) {
    return _.reduce(states, function(accum, state) {
        return accum.append(state);
    }, InferenceState.empty);
};
InferenceState.prototype.append = function(state) {
    var constraints = this.constraints.concat(state.constraints),
        assumptions = mergeAssumptions(this.assumptions, state.assumptions),
        instances = mergeInstances(this.instances, state.instances);

    return new InferenceState(
        constraints,
        assumptions,
        instances
    );
};
InferenceState.prototype.withConstraints = function(constraints) {
    return new InferenceState(
        this.constraints.concat(constraints),
        this.assumptions,
        this.instances
    );
};
InferenceState.prototype.withAssumptions = function(assumptions) {
    return new InferenceState(
        this.constraints,
        mergeAssumptions(this.assumptions, assumptions),
        this.instances
    );
};
InferenceState.prototype.withInstances = function(instances) {
    return new InferenceState(
        this.constraints,
        this.assumptions,
        mergeInstances(this.instances, instances)
    );
};

function mergeAssumptions(a1, a2) {
    var merged = _.extend(_.clone(a1), a2);
    _.each(_.intersection(_.keys(a1), _.keys(a2)), function(key) {
        merged[key] = a1[key].concat(a2[key]);
    });
    return merged;
}

function mergeInstances(i1, i2) {
    var merged = _.extend(_.clone(i1), i2);
    _.each(_.intersection(_.keys(i1), _.keys(i2)), function(key) {
        merged[key] = _.extend(merged[key], i2[key]);
    });
    return merged;
}

// ## Inference type
function StateType(state, type) {
    this.state = state;
    this.type = type;
}

// Filter out comments.
function withoutComments(nodes) {
    return _.reject(nodes, function(n) {
        return n.accept({
            visitComment: function() {
                return true;
            }
        });
    });
}

// ## InferenceState generation
// Takes a non-empty array of AST nodes and generates a new
// InferenceType.
function generate(nodes, monomorphic) {
    var nodesWithoutComments = withoutComments(nodes),
        node = nodesWithoutComments[0];

    monomorphic = monomorphic || [];

    // For nodes that don't introduce constraints nor assumptions
    function withEmptyState(type) {
        return function() {
            return new StateType(InferenceState.empty, type);
        };
    }

    // We always return the last node in a sequence except for let
    // bindings.
    function recurseIfMoreNodes(stateType) {
        var generated;
        if(nodesWithoutComments.length > 1) {
            generated = generate(nodesWithoutComments.slice(1), monomorphic);
            return new StateType(
                stateType.state.append(generated.state),
                generated.type
            );
        }

        return stateType;
    }

    var stateType = node.accept({
        visitIdentifier: function() {
            var type = new t.Variable(),
                predicates = new t.Variable(),
                assumptions = {};

            assumptions[node.value] = [{
                node: node,
                predicates: predicates,
                type: type
            }];

            return recurseIfMoreNodes(new StateType(
                InferenceState
                    .empty
                    .withAssumptions(assumptions),
                type
            ));
        },
        visitCall: function() {
            var funcStateType = generate([node.func], monomorphic),
                nodeStateTypes = _.map(node.args, function(a) {
                    return generate([a], monomorphic);
                }),
                argTypes = _.pluck(nodeStateTypes, 'type'),
                argStates  = _.pluck(nodeStateTypes, 'state'),
                type = new t.Variable();

            return recurseIfMoreNodes(new StateType(
                InferenceState
                    .concat(argStates)
                    .append(funcStateType.state)
                    .withConstraints([
                        new EqualityConstraint(
                            funcStateType.type,
                            new t.FunctionType(argTypes.concat(type)),
                            node
                        )
                    ]),
                type
            ));
        },
        visitFunction: function() {
            var types = _.map(_.range(node.args.length), function() {
                    return new t.Variable();
                }),
                valueStateType = generate(node.value, monomorphic.concat(types)),
                argNames = _.map(node.args, function(a) {
                    return a.name;
                }),
                assumptionsNotInArgs = {},
                constraintsFromAssumptions = [];

            _.each(valueStateType.state.assumptions, function(v, k) {
                var index = argNames.indexOf(k);
                if(index != -1) {
                    _.each(v, function(assumption) {
                        constraintsFromAssumptions.push(
                            new EqualityConstraint(
                                assumption.type,
                                types[index],
                                node
                            )
                        );
                    });
                } else if(k != node.name) {
                    assumptionsNotInArgs[k] = v;
                }
            });

            return recurseIfMoreNodes(new StateType(
                InferenceState
                    .empty
                    .withAssumptions(assumptionsNotInArgs)
                    .withConstraints(valueStateType.state.constraints)
                    .withConstraints(constraintsFromAssumptions),
                new t.FunctionType(types.concat(valueStateType.type))
            ));
        },
        visitLet: function() {
            var value = generate(node.value, monomorphic),
                predicates = [],
                body,
                name,
                assumptionsWithoutLet,
                constraintsFromLet,
                result;

            if(nodesWithoutComments.length == 1) {
                return new StateType(
                    value.state,
                    new t.Variable()
                );
            }

            for(name in value.state.assumptions) {
                predicates = [].concat.apply(predicates, _.map(value.state.assumptions[name], function(a) {
                    return a.predicates;
                }));
            }

            body = generate(nodesWithoutComments.slice(1), monomorphic);
            assumptionsWithoutLet = _.omit(
                body.state.assumptions,
                node.name
            );
            constraintsFromLet =
                _.map(body.state.assumptions[node.name] || [], function(assumption) {
                    return new ImplicitConstraint(
                        assumption.type,
                        value.type,
                        monomorphic,
                        node
                    );
                });

            return new StateType(
                value.state
                    .withAssumptions(assumptionsWithoutLet)
                    .withConstraints(body.state.constraints)
                    .withConstraints(constraintsFromLet),
                body.type
            );
        },
        visitData: function() {
            var body,
                assumptionsWithoutTags,
                constraintsFromTags;

            if(nodesWithoutComments.length == 1) {
                return new StateType(
                    InferenceState
                        .empty,
                    new t.Variable()
                );
            }

            body = generate(nodesWithoutComments.slice(1), monomorphic);
            assumptionsWithoutTags = _.pick(
                body.state.assumptions,
                _.difference(
                    _.keys(body.state.assumptions),
                    _.pluck(node.tags, 'name')
                )
            );

            constraintsFromTags = _.reduce(node.tags, function(accum, tag) {
                var vars = {},
                    args = {},
                    tagType;

                _.each(node.args, function(v) {
                    vars[v.name] = new t.Variable();
                });

                _.each(tag.vars, function(v) {
                    args[v.value] = _.has(vars, v.value) ? vars[v.value] : (function() {
                        throw new Error("TODO: Data declaration using another declaration");
                    })();
                });

                tagType = new t.TagType(node.name, _.map(node.args, function(a) {
                    return _.has(args, a.name) ? args[a.name] : new t.Variable();
                }));

                return accum.concat(_.map(
                    body.state.assumptions[tag.name] || [],
                    function(assumption) {
                        return new ImplicitConstraint(
                            assumption.type,
                            new t.FunctionType(_.values(args).concat(tagType)),
                            monomorphic,
                            node
                        );
                    }
                ));
            }, []);

            return new StateType(
                InferenceState
                    .empty
                    .withAssumptions(assumptionsWithoutTags)
                    .withConstraints(body.state.constraints)
                    .withConstraints(constraintsFromTags),
                body.type
            );
        },
        visitMatch: function() {
            var valueStateType = generate([node.value], monomorphic),
                casesType = new t.Variable();

            casesState = _.reduce(node.cases, function(accum, c) {
                var patternAssumptions = {},
                    patternType = {},
                    varTypes,
                    caseValueStateType,
                    assumptionsWithoutVars,
                    caseConstraints;

                varTypes = _.map(c.pattern.vars, function() {
                    return new t.Variable();
                });

                patternType = new t.FunctionType(varTypes.concat([valueStateType.type]));

                patternAssumptions[c.pattern.tag.value] = [patternType];

                caseValueStateType = generate([c.value], monomorphic.concat(varTypes));

                assumptionsWithoutVars = _.pick(
                    caseValueStateType.state.assumptions,
                    _.difference(
                        _.keys(caseValueStateType.state.assumptions),
                        _.pluck(c.pattern.vars, 'value')
                    )
                );

                caseConstraints = _.reduce(c.pattern.vars, function(accum, varName) {
                    return {
                        index: accum.index + 1,
                        constraints: accum.constraints.concat(_.map(
                            caseValueStateType.state.assumptions[varName.value] || [],
                            function(assumption) {
                                return new EqualityConstraint(
                                    assumption.type,
                                    patternType.types[accum.index],
                                    node
                                );
                            }
                        ))
                    };
                }, {
                    index: 0,
                    constraints: []
                }).constraints;

                return accum
                    .withAssumptions(assumptionsWithoutVars)
                    .withAssumptions(patternAssumptions)
                    .withConstraints(caseValueStateType.state.constraints)
                    .withConstraints(caseConstraints)
                    .withConstraints([
                        new EqualityConstraint(
                            caseValueStateType.type,
                            casesType,
                            node
                        )
                    ]);
            }, InferenceState.empty);

            return recurseIfMoreNodes(new StateType(
                valueStateType.state
                    .append(casesState),
                casesType
            ));
        },
        visitDo: function() {
            // Can be simplified; desugar the AST before typechecking
            var instanceState = generate([node.value], monomorphic).state,
                last = _.last(node.body),
                init = _.initial(node.body),
                lastStateType;

            function returnGenerate(n) {
                // Return
                var returnInput = new t.Variable(),
                    returnOutput = new t.Variable(),
                    instanceExpectedType = new t.RowObjectType(new t.Variable(), {
                        'return': new t.FunctionType([returnInput, returnOutput])
                    }),
                    instanceStateType = generate([node.value], monomorphic),
                    stateType = generate([n.value], monomorphic);

                return new StateType(
                    stateType.state
                        .append(instanceStateType.state)
                        .withConstraints([
                            new EqualityConstraint(
                                returnInput,
                                stateType.type,
                                node
                            ),
                            new EqualityConstraint(
                                instanceExpectedType,
                                instanceStateType.type,
                                node
                            )
                        ]),
                    returnOutput
                );
            }

            function returnNodeGenerate(n) {
                if(n.isReturn)
                    return returnGenerate(n);

                // Normal statements
                return generate([n], monomorphic);
            }

            function bindGenerate(accum, name, value) {
                // Bind
                var valueStateType = returnNodeGenerate(value),
                    bindInput = new t.Variable(),
                    bindFunctionInput = new t.Variable(),
                    bindOutput = new t.Variable(),
                    instanceExpectedType = new t.RowObjectType(new t.Variable(), {
                        'bind': new t.FunctionType([
                            bindInput,
                            new t.FunctionType([
                                bindFunctionInput,
                                bindOutput
                            ]),
                            bindOutput
                        ])
                    }),
                    instanceStateType = generate([node.value], monomorphic),
                    constraintsFromAssumptions = _.flatten(_.map(
                        accum.state.assumptions[name] || [],
                        function(assumption) {
                            return [
                                new EqualityConstraint(
                                    assumption.type,
                                    bindFunctionInput,
                                    node
                                ),
                                new EqualityConstraint(
                                    valueStateType.type,
                                    bindInput,
                                    node
                                )
                            ];
                        }
                    )),
                    assumptionsWithoutBind = _.omit(
                        accum.state.assumptions,
                        name
                    );

                return new StateType(
                    valueStateType.state
                        .append(instanceStateType.state)
                        .withConstraints(accum.state.constraints)
                        .withAssumptions(assumptionsWithoutBind)
                        .withConstraints(constraintsFromAssumptions)
                        .withConstraints([
                            new EqualityConstraint(
                                valueStateType.type,
                                bindInput,
                                node
                            ),
                            new EqualityConstraint(
                                accum.type,
                                bindOutput,
                                node
                            ),
                            new EqualityConstraint(
                                instanceExpectedType,
                                instanceStateType.type,
                                node
                            )
                        ]),
                    accum.type
                );
            }

            lastStateType = returnNodeGenerate(last);

            return recurseIfMoreNodes(_.reduceRight(init, function(accum, line) {
                var stateType;
                if(line.isBind)
                    return bindGenerate(accum, line.name, line.value);

                stateType = returnNodeGenerate(line);
                return new StateType(
                    accum.state
                        .append(stateType.state),
                    accum.type
                );
            }, new StateType(
                instanceState
                    .append(lastStateType.state),
                lastStateType.type
            )));
        },

        visitIfThenElse: function() {
            var condition = generate([node.condition], monomorphic),
                ifTrue = generate(node.ifTrue, monomorphic),
                ifFalse = generate(node.ifFalse, monomorphic);

            return recurseIfMoreNodes(new StateType(
                condition.state
                    .append(ifTrue.state)
                    .append(ifFalse.state)
                    .withConstraints([
                        new EqualityConstraint(
                            condition.type,
                            new t.BooleanType(),
                            node
                        ),
                        new EqualityConstraint(
                            ifTrue.type,
                            ifFalse.type,
                            node
                        )
                    ]),
                ifTrue.type
            ));
        },
        visitPropertyAccess: function() {
            var value = generate([node.value], monomorphic),
                type = new t.Variable(),
                objectTypes = {};

            objectTypes[node.property] = type;

            return recurseIfMoreNodes(new StateType(
                value.state
                    .withConstraints([
                        new EqualityConstraint(
                            value.type,
                            new t.RowObjectType(
                                new t.Variable(),
                                objectTypes
                            ),
                            node
                        )
                    ]),
                type
            ));
        },
        visitAccess: function() {
            var value = generate([node.value], monomorphic),
                property = generate([node.property], monomorphic),
                type = new t.Variable();

            return recurseIfMoreNodes(new StateType(
                value.state
                    .withConstraints([
                        new EqualityConstraint(
                            value.type,
                            new t.ArrayType(type),
                            node
                        ),
                        new EqualityConstraint(
                            property.type,
                            new t.NumberType(),
                            node
                        )
                    ]),
                type
            ));
        },

        visitTypeClass: function() {
            var body = generate(nodesWithoutComments.slice(1), monomorphic),
                vars = {},
                typeClassVariable = nodeToType(node.generic, vars),
                predicateConstraints = [],
                memberConstraints = [];

            _.each(node.types, function(v, k) {
                var describedType = nodeToType(v, _.clone(vars));
                _.each(body.state.assumptions[k], function(assumption) {
                    // Should solve member constraint before predicate
                    // constraint.
                    predicateConstraints.push(new PredicateConstraint(
                        assumption.node,
                        new TypeClassPredicate(body.state.instances[node.name], typeClassVariable)
                    ));

                    memberConstraints.push(new EqualityConstraint(
                        describedType,
                        assumption.type,
                        node
                    ));
                });
            });

            return recurseIfMoreNodes(new StateType(
                body.state
                    .withConstraints(predicateConstraints)
                    .withConstraints(memberConstraints),
                body.type
            ));
        },
        visitInstance: function() {
            var body = generate(nodesWithoutComments.slice(1), monomorphic),
                instance = {},
                instances = {};

            instance[node.name] = _.pick(node, ['typeName', 'object']);
            instances[node.typeClassName] = instance;

            return recurseIfMoreNodes(new StateType(
                body.state
                    .withInstances(instances),
                body.type
            ));
        },

        visitExpression: function() {
            var value = generate([node.value], monomorphic);
            return recurseIfMoreNodes(value);
        },
        visitBinaryNumberOperator: function() {
            var a = generate([node.left], monomorphic),
                b = generate([node.right], monomorphic);

            return recurseIfMoreNodes(new StateType(
                InferenceState
                    .empty
                    .append(a.state)
                    .append(b.state)
                    .withConstraints([
                        new EqualityConstraint(
                            a.type,
                            new t.NumberType(),
                            node
                        ),
                        new EqualityConstraint(
                            b.type,
                            new t.NumberType(),
                            node
                        )
                    ]),
                new t.NumberType()
            ));
        },
        visitBinaryStringOperator: function() {
            var a = generate([node.left], monomorphic),
                b = generate([node.right], monomorphic);

            return recurseIfMoreNodes(new StateType(
                InferenceState
                    .empty
                    .append(a.state)
                    .append(b.state)
                    .withConstraints([
                        new EqualityConstraint(
                            a.type,
                            new t.StringType(),
                            node
                        ),
                        new EqualityConstraint(
                            b.type,
                            new t.StringType(),
                            node
                        )
                    ]),
                new t.StringType()
            ));
        },
        visitBinaryGenericOperator: function() {
            var a = generate([node.left], monomorphic),
                b = generate([node.right], monomorphic);

            return recurseIfMoreNodes(new StateType(
                InferenceState
                    .empty
                    .append(a.state)
                    .append(b.state)
                    .withConstraints([
                        new EqualityConstraint(
                            a.type,
                            b.type,
                            node
                        )
                    ]),
                new t.BooleanType()
            ));
        },

        visitObject: function() {
            var objectTypes = {},
                objectStates = [];

            _.each(node.values, function(v, k) {
                var stateType = generate([v], monomorphic);
                objectTypes[k] = stateType.type;
                objectStates.push(stateType.state);
            });

            return recurseIfMoreNodes(new StateType(
                InferenceState
                    .concat(objectStates),
                new t.ObjectType(objectTypes)
            ));
        },
        visitArray: function() {
            var valueStateTypes = _.map(node.values, function(v) {
                    return generate([v], monomorphic);
                }),
                valueStates = _.pluck(valueStateTypes, 'state'),
                type = valueStateTypes.length ? valueStateTypes[0].type : new t.Variable(),
                equalityConstraints = _.map(valueStateTypes.slice(1), function(v) {
                    return new EqualityConstraint(v.type, type, node);
                });

            return recurseIfMoreNodes(new StateType(
                InferenceState
                    .concat(valueStates)
                    .withConstraints(equalityConstraints),
                new t.ArrayType(type)
            ));
        },
        visitBoolean: withEmptyState(new t.BooleanType()),
        visitNumber: withEmptyState(new t.NumberType()),
        visitString: withEmptyState(new t.StringType())
    });

    if(!stateType) throw new Error("No StateType for: " + node.accept.toString().match(/visit([A-Za-z]+)/)[1]);
    return stateType;
}
exports.generate = generate;

function nodeToType(node, vars) {
    if(!vars) vars = {};

    function recurse(n) {
        return nodeToType(n, vars);
    }

    return node.accept({
        visitGeneric: function() {
            if(!vars[node.value]) vars[node.value] = new t.Variable();
            return vars[node.value];
        },
        visitTypeFunction: function() {
            return new t.FunctionType(_.map(node.args, recurse));
        },
        visitTypeName: function() {
            if(!node.args.length) {
                switch(node.value) {
                case 'String':
                    return new t.StringType();
                case 'Number':
                    return new t.NumberType();
                case 'Boolean':
                    return new t.BooleanType();
                case 'Unit':
                    return new t.UnitType();
                }
            }
            // TODO: Lookup name from aliases and data
            throw new Error("TODO #1: visitTypeName");
        },
        visitTypeArray: function() {
            throw new Error("TODO #1: visitTypeArray");
        },
        visitTypeObject: function() {
            throw new Error("TODO #1: visitTypeObject");
        }
    });
}

function tails(xs) {
    return _.map(_.range(xs.length), function(i) {
        return xs.slice(i);
    });
}

function isSolvable(constraints) {
    // Find first unsolvable.
    return !_.find(tails(constraints), function(tail) {
        var constraint = tail[0],
            rest = tail.slice(1),
            solvable = constraint.cata(function() {
                // Equality
                return true;
            }, function() {
                // Implicit
                return !_.intersection(
                    _.difference(
                        free(constraint.b),
                        constraint.monomorphic
                    ),
                    _.union.apply(_, _.map(rest, active))
                ).length;
            }, function() {
                // Explicit
                return true;
            }, function() {
                // Predicate
                return true;
            });

        return !solvable;
    });
}

function solve(constraints) {
    // Constraints need to be in a particular order to be solvable.
    // Randomly shuffle the constraints until in an order that is solvable.
    // TODO: Don't use bogosort.
    var solvableConstraints = (function() {
            var groupedConstraints = _.groupBy(constraints, function(constraint) {
                    return constraint.cata(function() {
                        return 'other';
                    }, function() {
                        return 'implicit';
                    }, function() {
                        return 'other';
                    }, function() {
                        return 'other';
                    });
                }),
                implicitConstraints = groupedConstraints.implicit || [];

            while(!isSolvable(implicitConstraints)) {
                implicitConstraints = _.shuffle(implicitConstraints);
            }

            return (groupedConstraints.other || []).concat(implicitConstraints);
        })(),
        rest = solvableConstraints.slice(1),
        constraint;

    if(!constraints.length)
        return {};

    if(!solvableConstraints)
        throw new Error('Unsolvable constraints');

    constraint = solvableConstraints[0];
    return constraint.cata(function() {
        // Equality constraints
        // Use the Most General Unifier (mgu)
        var m = mostGeneralUnifier(constraint.a, constraint.b, constraint.node),
            s = solve(_.map(rest, function(r) {
                return constraintSubstitute(m, r, constraint.node);
            })),
            r = {};
        _.each(_.extend(m, s), function(v, k) {
            r[k] = typeSubstitute(s, v);
        });
        return r;
    }, function() {
        // Implicit constraints
        return solve([new ExplicitConstraint(
            constraint.a,
            generalize(constraint.b, constraint.monomorphic),
            constraint.node
        )].concat(rest));
    }, function() {
        // Explicit constraints
        return solve([new EqualityConstraint(
            constraint.a,
            instantiate(constraint.scheme),
            constraint.node
        )].concat(rest));
    }, function() {
        // Predicate constraint
        var s = solve(rest),
            a = typeSubstitute(s, constraint.b.type),
            name,
            b;

        for(name in constraint.b.instances) {
            b = nodeToType(constraint.b.instances[name].typeName);
            mostGeneralUnifier(a, b);
            constraint.a.typeClassInstance = name;
            return s;
        }

        throw new TypeError('Could not find an instance of URGH for ' + a.toString());
    });
}

function free(type) {
    if(type instanceof t.Variable) {
        return [type.id];
    } else if(type instanceof t.FunctionType) {
        return [].concat.apply([], _.map(type.types, free));
    } else if(type instanceof t.ObjectType) {
        return [].concat.apply([], _.map(type.props, free));
    } else if(type instanceof t.RowObjectType) {
        return free(type.row).concat.apply([], _.map(type.props, free));
    } else if(type instanceof t.ArrayType) {
        return free(type.type);
    } else if(type instanceof t.TagType) {
        return [].concat.apply([], _.map(type.vars, free));
    }
    return [];
}

function instantiate(scheme) {
    var substitutions = {};
    _.each(scheme.s, function(id) {
        substitutions[id] = new t.Variable();
    });
    return typeSubstitute(substitutions, scheme.t);
}

function generalize(type, monomorphic) {
    return new Scheme(_.difference(free(type), monomorphic), type);
}

function variableBind(a, b) {
    var substitution = {};
    if(b instanceof t.Variable && a.id == b.id) {
        return substitution;
    }
    substitution[a.id] = b;
    return substitution;
}

function mostGeneralUnifier(a, b, node) {
    function typeError() {
        throw new Error('Type error on line ' + node.lineno + ': ' + b.toString() + ' is not ' + a.toString());
    }

    if(a instanceof t.Variable) {
        return variableBind(a, b);
    } else if(b instanceof t.Variable) {
        return variableBind(b, a);
    } else if(a instanceof t.FunctionType && b instanceof t.FunctionType && a.types.length == b.types.length) {
        return _.reduce(_.zip(a.types, b.types), function(accum, pair) {
            var a = typeSubstitute(accum, pair[0]),
                b = typeSubstitute(accum, pair[1]);
            return _.extend(accum, mostGeneralUnifier(a, b, node));
        }, {});
    } else if(a instanceof t.RowObjectType && b instanceof t.RowObjectType) {
        return mostGeneralUnifier(a, b.row, node);
    } else if(a instanceof t.RowObjectType && b instanceof t.ObjectType) {
        return (function() {
            var row = a,
                props = [],
                keys = [];

            while(row instanceof t.RowObjectType) {
                props.push(row.props);
                keys = keys.concat(_.keys(row.props));
                row = row.row;
            }

            if(_.difference(keys, _.keys(b.props)).length)
                typeError();

            return _.reduce(props, function(accum, prop) {
                return _.reduce(_.keys(prop), function(accum, key) {
                    var c = typeSubstitute(accum, prop[key]),
                        d = typeSubstitute(accum, b.props[key]);

                    return _.extend(accum, mostGeneralUnifier(c, d, node));
                }, accum);
            }, {});
        })();
    } else if(a instanceof t.ArrayType && b instanceof t.ArrayType) {
        return mostGeneralUnifier(a.type, b.type);
    } else if(a instanceof t.TagType && b instanceof t.TagType && a.name == b.name && a.vars.length == b.vars.length) {
        return _.reduce(_.range(a.vars.length), function(accum, i) {
            return _.extend(
                accum,
                mostGeneralUnifier(a.vars[i], b.vars[i], node)
            );
        }, {});
    } else if(a instanceof t.NumberType && b instanceof t.NumberType) {
        return {};
    } else if(a instanceof t.StringType && b instanceof t.StringType) {
        return {};
    } else if(a instanceof t.BooleanType && b instanceof t.BooleanType) {
        return {};
    }
    typeError();
}

function active(constraint) {
    return constraint.cata(function() {
        // Equality
        return _.union(
            free(constraint.a),
            free(constraint.b)
        );
    }, function() {
        // Implicit
        return _.union(
            free(constraint.a),
            _.intersection(
                constraint.monomorphic,
                free(constraint.b)
            )
        );
    }, function() {
        // Explicit
        return _.union(
            free(constraint.a),
            _.difference(
                free(constraint.scheme.t),
                constraint.scheme.s
            )
        );
    }, function() {
        // Predicate
        throw new Error("TODO");
    });
}

function constraintSubstitute(substitutions, constraint) {
    return constraint.cata(function() {
        return new EqualityConstraint(
            typeSubstitute(substitutions, constraint.a),
            typeSubstitute(substitutions, constraint.b),
            constraint.node
        );
    }, function() {
        return new ImplicitConstraint(
            typeSubstitute(substitutions, constraint.a),
            typeSubstitute(substitutions, constraint.b),
            constraint.monomorphic,
            constraint.node
        );
    }, function() {
        return new ExplicitConstraint(
            typeSubstitute(substitutions, constraint.a),
            schemeSubstitute(substitutions, constraint.scheme),
            constraint.node
        );
    }, function() {
        return new PredicateConstraint(
            constraint.a,
            {
                instances: constraint.b.instances,
                predicates: constraint.b.predicates,
                type: typeSubstitute(substitutions, constraint.b.type)
            }
        );
    });
}

function schemeSubstitute(substitutions, scheme) {
    var substitutionsWithoutScheme = {};

    _.each(substitutions, function(v, k) {
        if(_.contains(scheme.s, k)) return;
        substitutionsWithoutScheme[k] = v;
    });

    return new Scheme(
        scheme.s,
        typeSubstitute(substitutionsWithoutScheme, scheme.t)
    );
}

function typeSubstitute(substitutions, type) {
    var substituted;
    if(type instanceof t.Variable) {
        if(_.has(substitutions, type.id)) {
            return substitutions[type.id];
        }
        return type;
    } else if(type instanceof t.FunctionType) {
        return new t.FunctionType(_.map(type.types, function(t) {
            return typeSubstitute(substitutions, t);
        }));
    } else if(type instanceof t.ArrayType) {
        return new t.ArrayType(typeSubstitute(substitutions, type.type));
    } else if(type instanceof t.ObjectType) {
        substituted = {};
        _.each(type.props, function(v, k) {
            substituted[k] = typeSubstitute(substitutions, v);
        });
        return new t.ObjectType(substituted);
    } else if(type instanceof t.RowObjectType) {
        substituted = {};
        _.each(type.props, function(v, k) {
            substituted[k] = typeSubstitute(substitutions, v);
        });
        return new t.RowObjectType(typeSubstitute(substitutions, type.row), substituted);
    } else if(type instanceof t.TagType) {
        return new t.TagType(type.name, _.map(type.vars, function(v) {
            return typeSubstitute(substitutions, v);
        }));
    } else if(type instanceof t.ArrayType) {
        throw new Error("Not handled: " + type.toString());
    } else if(type instanceof t.NumberType) {
        return type;
    } else if(type instanceof t.StringType) {
        return type;
    } else if(type instanceof t.BooleanType) {
        return type;
    }
    throw new Error("Not handled: " + type.toString());
}
exports.substitute = typeSubstitute;

// Run inference on an array of AST nodes.
function typecheck(nodes) {
    var stateType = generate(nodes),
        constraints = stateType.state.constraints,
        substitutions = solve(constraints);

    return typeSubstitute(substitutions, stateType.type);
}
exports.typecheck = typecheck;
