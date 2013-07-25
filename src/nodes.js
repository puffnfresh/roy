var _ = require('underscore'),
    nodes;

function attributedNode(name, properties, sequence, extend) {
    var visitHandle = 'visit' + name;

    function forProperties(f) {
        _.each(properties, function(property, i) {
            f(property, i);
        });
    }

    function create(proto) {
        function Ctor() {
        }
        Ctor.prototype = Attributed.prototype;
        return new Ctor();
    }

    function Attributed() {
        var self = this,
            args = arguments;

        if(!(self instanceof Attributed)) {
            self = create(Attributed.prototype);
        }

        forProperties(function(property, i) {
            self[property] = args[i];
        });

        self.attribute = null;

        return self;
    }
    Attributed._name = name;
    Attributed.prototype.accept = function(a) {
        if(a[visitHandle]) {
            return a[visitHandle](this);
        }
    };
    Attributed.prototype.withAttribute = function(a) {
        var self = this,
            instance = create(Attributed.prototype);

        forProperties(function(property) {
            instance[property] = self[property];
        });

        instance.attribute = a;

        return instance;
    };
    Attributed.prototype.sequence = sequence;
    Attributed.prototype.extend = extend;

    return Attributed;
}

function toObject(nodes) {
    var o = {};
    _.each(nodes, function(node) {
        var name = node._name;
        o[name] = node;
    });
    return o;
}

function singleton(k, v) {
    var r  = {};
    r[k] = v;
    return r;
}

function arrayExtend(as, f) {
    return _.map(as, function(a) {
        return a.extend(f);
    });
}

function arraySequence(A, as, f) {
    var values = A.of([]),
        i;

    function append(value) {
        return function(values) {
            return values.concat([value]);
        };
    }

    _.each(as, function(a) {
        values = f(a).map(append).ap(values);
    });

    return values;
}

function objectSequence(A, o) {
    var object = A.of({}),
        k;

    function setter(k) {
        return function(v) {
            return function(o) {
                return _.extend(
                    o,
                    singleton(k, v)
                );
            };
        };
    }

    _.each(o, function(v, k) {
        object = v.sequence(A).map(setter(k)).ap(object);
    });

    return object;
}

// TODO: Is possible to remove attribute duplication. Do it.
nodes = toObject([
    attributedNode(
        'Expression',
        ['value'],
        function(A) {
            return this.attribute.map(function(attribute) {
                return function(value) {
                    return nodes.Expression(value).withAttribute(attribute);
                };
            }).ap(this.value.sequence(A));
        },
        function(f) {
            return nodes.Expression(this.value.extend(f)).withAttribute(f(this));
        }
    ),
    attributedNode(
        'Function',
        ['args', 'value', 'whereDecls'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return function(value) {
                    return nodes.Function(self.args, value, undefined).withAttribute(attribute);
                };
            }).ap(arraySequence(A, this.value, function(a) {
                return a.sequence(A);
            }));
        },
        function(f) {
            return nodes.Function(this.args, arrayExtend(this.value, f), undefined).withAttribute(f(this));
        }
    ),
    attributedNode(
        'Data',
        ['name', 'args', 'tags', 'body'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return function(body) {
                    return nodes.Data(self.name, self.args, self.tags).withAttribute(attribute);
                };
            }).ap(arraySequence(A, this.body, function(a) {
                return a.sequence(A);
            }));
        },
        function(f) {
            return nodes.Data(this.name, this.args, this.tags, arrayExtend(this.body, f)).withAttribute(f(this));
        }
    ),
    attributedNode(
        'Type',
        ['name', 'value', 'body'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return function(body) {
                    return nodes.Type(self.name, self.value).withAttribute(attribute);
                };
            }).ap(arraySequence(A, this.body), function(a) {
                return a.sequence(A);
            });
        },
        function(f) {
            return nodes.Type(this.name, this.value, arrayExtend(this.body, f)).withAttribute(f(this));
        }
    ),
    attributedNode(
        'TypeClass',
        ['name', 'generic', 'types', 'body'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return function(body) {
                    return nodes.TypeClass(self.name, self.generic, self.types, body).withAttribute(attribute);
                };
            }).ap(arraySequence(A, this.body), function(a) {
                return a.sequence(A);
            });
        },
        function(f) {
            return nodes.TypeClass(this.name, this.generic, this.types, arrayExtend(this.body, f)).withAttribute(f(this));
        }
    ),
    attributedNode(
        'Instance',
        ['name', 'typeClassName', 'typeName', 'object', 'body'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return function(object) {
                    return function(body) {
                        return nodes.Instance(self.name, self.typeClassName, self.typeName, object, body).withAttribute(attribute);
                    };
                };
            }).ap(this.object.sequence(A)).ap(arraySequence(A, this.body), function(a) {
                return a.sequence(A);
            });
        },
        function(f) {
            var object = {};
            _.each(this.object, function(value, key) {
                object[key] = value.extend(f);
            });
            return nodes.Instance(this.name, this.typeClassName, this.typeName, object, arrayExtend(this.body, f)).withAttribute(f(this));
        }
    ),
    attributedNode(
        'Generic',
        ['value'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return nodes.Generic(self.value).withAttribute(attribute);
            });
        },
        function(f) {
            return nodes.Generic(this.value).withAttribute(f(this));
        }
    ),
    attributedNode(
        'TypeFunction',
        ['args'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return nodes.TypeFunction(self.args).withAttribute(attribute);
            });
        },
        function(f) {
            return nodes.TypeFunction(this.args).withAttribute(f(this));
        }
    ),
    attributedNode(
        'TypeName',
        ['value', 'args'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return nodes.TypeName(self.value, self.args).withAttribute(attribute);
            });
        },
        function(f) {
            return this.TypeName(this.value, this.args).withAttribute(f(this));
        }
    ),
    attributedNode(
        'TypeObject',
        ['values'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return nodes.TypeObject(self.values).withAttribute(attribute);
            });
        },
        function(f) {
            return nodes.TypeObject(this.values).withAttribute(f(this));
        }
    ),
    attributedNode(
        'TypeArray',
        ['value'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return nodes.TypeArray(self.value).withAttribute(attribute);
            });
        },
        function(f) {
            return nodes.TypeArray(this.value).withAttribute(f(this));
        }
    ),
    attributedNode(
        'Do',
        ['value', 'body'],
        function(A) {
            // TODO: Tricky
        },
        function(f) {
            throw new Error("TODO");
        }
    ),
    attributedNode(
        'Match',
        ['value', 'cases'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return nodes.Match(self.value, cases).withAttribute(attribute);
            }).ap(arraySequence(A, this.cases, function(a) {
                return a.value.sequence(A).map(function(v) {
                    return {
                        pattern: a.pattern,
                        value: v
                    };
                });
            }));
        },
        function(f) {
            var cases = _.map(this.cases, function(cas) {
                return {
                    pattern: cas.pattern,
                    value: cas.value.extend(f)
                };
            });
            return nodes.Match(this.value.extend(f), cases).withAttribute(f(this));
        }
    ),
    attributedNode(
        'Let',
        ['name', 'value', 'type', 'body'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return function(value) {
                    return function(body) {
                        return nodes.Let(self.name, value, self.type, body).withAttribute(attribute);
                    };
                };
            }).ap(arraySequence(A, this.value, function(a) {
                return a.sequence(A);
            })).ap(arraySequence(A, this.body, function(a) {
                return a.sequence(A);
            }));
        },
        function(f) {
            return nodes.Let(this.name, arrayExtend(this.value, f), this.type, arrayExtend(this.body, f)).withAttribute(f(this));
        }
    ),
    attributedNode(
        'Call',
        ['func', 'args'],
        function(A) {
            return this.attribute.map(function(attribute) {
                return function(func) {
                    return function(args) {
                        return nodes.Call(func, args).withAttribute(attribute);
                    };
                };
            }).ap(this.func.sequence(A)).ap(arraySequence(A, this.args, function(a) {
                return a.sequence(A);
            }));
        },
        function(f) {
            var args = _.map(this.args, function(arg) {
                return arg.extend(f);
            });
            return nodes.Call(this.func.extend(f), args).withAttribute(f(this));
        }
    ),
    attributedNode(
        'IfThenElse',
        ['condition', 'ifTrue', 'ifFalse'],
        function(A) {
            return this.attribute.map(function(attribute) {
                return function(condition) {
                    return function(ifTrue) {
                        return function(ifFalse) {
                            return nodes.IfThenElse(condition, ifTrue, ifFalse).withAttribute(attribute);
                        };
                    };
                };
            }).ap(this.condition.sequence(A)).ap(arraySequence(A, this.ifTrue, function(a) {
                return a.sequence(A);
            })).ap(arraySequence(A, this.ifFalse, function(a) {
                return a.sequence(A);
            }));
        },
        function(f) {
            return nodes.IfThenElse(this.condition.extend(f), arrayExtend(this.ifTrue, f), arrayExtend(this.ifFalse, f)).withAttribute(f(this));
        }
    ),
    attributedNode(
        'Comment',
        ['value'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return nodes.Comment(self.value).withAttribute(attribute);
            });
        },
        function(f) {
            return nodes.Comment(this.value).withAttribute(f(this));
        }
    ),
    attributedNode(
        'PropertyAccess',
        ['value', 'property'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return function(value) {
                    return nodes.PropertyAccess(value, self.property).withAttribute(attribute);
                };
            }).ap(this.value.sequence(A));
        },
        function(f) {
            return nodes.PropertyAccess(this.value.extend(f), this.property).withAttribute(f(this));
        }
    ),
    attributedNode(
        'Access',
        ['value', 'property'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return function(value) {
                    return nodes.Access(value, self.property).withAttribute(attribute);
                };
            }).ap(this.value.sequence(A));
        },
        function(f) {
            return nodes.Access(this.value.extend(f), this.property).withAttribute(f(this));
        }
    ),
    attributedNode(
        'UnaryBooleanOperator',
        ['name', 'value'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return function(value) {
                    return nodes.BinaryGenericOperator(self.name, value).withAttribute(attribute);
                };
            }).ap(this.value.sequence(A));
        },
        function(f) {
            return nodes.UnaryBooleanOperator(this.name, this.value.extend(f)).withAttribute(f(this));
        }
    ),
    attributedNode(
        'BinaryGenericOperator',
        ['name', 'left', 'right'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return function(left) {
                    return function(right) {
                        return nodes.BinaryGenericOperator(self.name, left, right).withAttribute(attribute);
                    };
                };
            }).ap(this.left.sequence(A)).ap(this.right.sequence(A));
        },
        function(f) {
            return nodes.BinaryGenericOperator(this.name, this.left.extend(f), this.right.extend(f)).withAttribute(f(this));
        }
    ),
    attributedNode(
        'BinaryNumberOperator',
        ['name', 'left', 'right'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return function(left) {
                    return function(right) {
                        return nodes.BinaryNumberOperator(self.name, left, right).withAttribute(attribute);
                    };
                };
            }).ap(this.left.sequence(A)).ap(this.right.sequence(A));
        },
        function(f) {
            return nodes.BinaryNumberOperator(this.name, this.left.extend(f), this.right.extend(f)).withAttribute(f(this));
        }
    ),
    attributedNode(
        'BinaryBooleanOperator',
        ['name', 'left', 'right'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return function(left) {
                    return function(right) {
                        return nodes.BinaryBooleanOperator(self.name, left, right).withAttribute(attribute);
                    };
                };
            }).ap(this.left.sequence(A)).ap(this.right.sequence(A));
        },
        function(f) {
            return nodes.BinaryBooleanOperator(this.name, this.left.extend(f), this.right.extend(f)).withAttribute(f(this));
        }
    ),
    attributedNode(
        'BinaryStringOperator',
        ['name', 'left', 'right'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return function(left) {
                    return function(right) {
                        return nodes.BinaryStringOperator(self.name, left, right).withAttribute(attribute);
                    };
                };
            }).ap(this.left.sequence(A)).ap(this.right.sequence(A));
        },
        function(f) {
            return nodes.BinaryStringOperator(this.name, this.left.extend(f), this.right.extend(f)).withAttribute(f(this));
        }
    ),
    attributedNode(
        'With',
        ['left', 'right'],
        function(A) {
            return this.attribute.map(function(attribute) {
                return function(left) {
                    return function(right) {
                        return nodes.With(left, right).withAttribute(attribute);
                    };
                };
            }).ap(this.left.sequence(A)).ap(this.right.sequence(A));
        },
        function(f) {
            return nodes.With(this.left.extend(f), this.right.extend(f)).withAttribute(f(this));
        }
    ),
    attributedNode(
        'Identifier',
        ['value'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return nodes.Identifier(this.value).withAttribute(attribute);
            });
        },
        function(f) {
            return nodes.Identifier(this.value).withAttribute(f(this));
        }
    ),
    attributedNode(
        'Tuple',
        ['values'],
        function(A) {
            return this.attribute.map(function(attribute) {
                return function(values) {
                    return nodes.Tuple(values).withAttribute(attribute);
                };
            }).ap(arraySequence(A, this.values, function(a) {
                return a.sequence(A);
            }));
        },
        function(f) {
            return nodes.Tuple(arrayExtend(this.values, f)).withAttribute(f(this));
        }
    ),
    attributedNode(
        'Number',
        ['value'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return nodes.Number(self.value).withAttribute(attribute);
            });
        },
        function(f) {
            return nodes.Number(this.value).withAttribute(f(this));
        }
    ),
    attributedNode(
        'String',
        ['value'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return nodes.String(self.value).withAttribute(attribute);
            });
        },
        function(f) {
            return nodes.String(this.value).withAttribute(f(this));
        }
    ),
    attributedNode(
        'Boolean',
        ['value'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return nodes.Boolean(self.value).withAttribute(attribute);
            });
        },
        function(f) {
            return nodes.Boolean(this.value).withAttribute(f(this));
        }
    ),
    attributedNode(
        'Array',
        ['values'],
        function(A) {
            return this.attribute.map(function(attribute) {
                return function(values) {
                    return nodes.Array(values).withAttribute(attribute);
                };
            }).ap(arraySequence(A, this.values, function(a) {
                return a.sequence(A);
            }));
        },
        function(f) {
            return nodes.Array(arrayExtend(this.values, f)).withAttribute(f(this));
        }
    ),
    attributedNode(
        'Object',
        ['values'],
        function(A) {
            return this.attribute.map(function(attribute) {
                return function(values) {
                    return nodes.Object(values).withAttribute(attribute);
                };
            }).ap(objectSequence(A, this.values));
        },
        function(f) {
            var values = {};
            _.each(this.values, function(value, key) {
                values[key] = value.extend(f);
            });
            return nodes.Object(values).withAttribute(f(this));
        }
    ),

    // TODO: Remove
    attributedNode('Arg', ['name', 'type']),
    attributedNode('Assignment', ['name', 'value']),
    attributedNode('Remove', ['value']),
    attributedNode('Bind', ['name', 'value']),
    attributedNode('Case', ['pattern', 'value']),
    attributedNode('Tag', ['name', 'vars']),
    attributedNode('Pattern', ['tag', 'vars']),
    attributedNode('Replacement', ['value']),
    attributedNode('Macro', ['name', 'body']),
    attributedNode('Quoted', ['value'])
]);

module.exports = nodes;
