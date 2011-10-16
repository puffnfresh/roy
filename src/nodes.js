exports.nodes = {
    Arg: function(name, type) {
        this.name = name;

        // Optional
        this.type = type;

        this.accept = function(a) {
            if(a.visitArg) {
                return a.visitArg(this);
            }
        };
    },
    Function: function(name, args, body, type) {
        this.name = name;
        this.args = args;
        this.body = body;

        // Optional
        this.type = type;

        this.accept = function(a) {
            if(a.visitFunction) {
                return a.visitFunction(this);
            }
        };
    },
    Data: function(name, args, tags) {
        this.name = name;
        this.args = args;
        this.tags = tags;

        this.accept = function(a) {
            if(a.visitData) {
                return a.visitData(this);
            }
        };
    },
    Return: function(value) {
        this.value = value;

        this.accept = function(a) {
            if(a.visitReturn) {
                return a.visitReturn(this);
            }
        };
    },
    Bind: function(name, value) {
        this.name = name;
        this.value = value;

        // Set in compile stage
        this.rest = [];

        this.accept = function(a) {
            if(a.visitBind) {
                return a.visitBind(this);
            }
        };
    },
    Do: function(value, body) {
        this.value = value;
        this.body = body;

        this.accept = function(a) {
            if(a.visitDo) {
                return a.visitDo(this);
            }
        };
    },
    Match: function(value, cases) {
        this.value = value;
        this.cases = cases;

        this.accept = function(a) {
            if(a.visitMatch) {
                return a.visitMatch(this);
            }
        };
    },
    Case: function(pattern, value) {
        this.pattern = pattern;
        this.value = value;

        this.accept = function(a) {
            if(a.visitCase) {
                return a.visitCase(this);
            }
        };
    },
    Tag: function(name, vars) {
        this.name = name;
        this.vars = vars;

        this.accept = function(a) {
            if(a.visitTag) {
                return a.visitTag(this);
            }
        };
    },
    Pattern: function(tag, vars) {
        this.tag = tag;
        this.vars = vars;

        this.accept = function(a) {
            if(a.visitPattern) {
                return a.visitPattern(this);
            }
        };
    },
    Let: function(name, value, type) {
        this.name = name;
        this.value = value;

        // Optional
        this.type = type;

        this.accept = function(a) {
            if(a.visitLet) {
                return a.visitLet(this);
            }
        };
    },
    Call: function(func, args) {
        this.func = func;
        this.args = args;

        this.accept = function(a) {
            if(a.visitCall) {
                return a.visitCall(this);
            }
        };
    },
    IfThenElse: function(condition, ifTrue, ifFalse) {
        this.condition = condition;
        this.ifTrue = ifTrue;
        this.ifFalse = ifFalse;

        this.accept = function(a) {
            if(a.visitIfThenElse) {
                return a.visitIfThenElse(this);
            }
        };
    },
    Comment: function(value) {
        this.value = value;

        this.accept = function(a) {
            if(a.visitComment) {
                return a.visitComment(this);
            }
        };
    },
    Access: function(value, property) {
        this.value = value;
        this.property = property;

        this.accept = function(a) {
            if(a.visitAccess) {
                return a.visitAccess(this);
            }
        };
    },
    BinaryGenericOperator: function(name, left, right) {
        this.name = name;
        this.left = left;
        this.right = right;

        this.accept = function(a) {
            if(a.visitBinaryGenericOperator) {
                return a.visitBinaryGenericOperator(this);
            }
        };
    },
    BinaryNumberOperator: function(name, left, right) {
        this.name = name;
        this.left = left;
        this.right = right;

        this.accept = function(a) {
            if(a.visitBinaryNumberOperator) {
                return a.visitBinaryNumberOperator(this);
            }
        };
    },
    BinaryStringOperator: function(name, left, right) {
        this.name = name;
        this.left = left;
        this.right = right;

        this.accept = function(a) {
            if(a.visitBinaryStringOperator) {
                return a.visitBinaryStringOperator(this);
            }
        };
    },
    With: function(left, right) {
        this.left = left;
        this.right = right;

        this.accept = function(a) {
            if(a.visitWith) {
                return a.visitWith(this);
            }
        };
    },
    Replacement: function(value) {
        this.value = value;

        this.accept = function(a) {
            if(a.visitReplacement) {
                return a.visitReplacement(this);
            }
        };
    },
    Macro: function(name, body) {
        this.name = name;
        this.body = body;

        this.accept = function(a) {
            if(a.visitMacro) {
                return a.visitMacro(this);
            }
        };
    },
    Quoted: function(value) {
        this.value = value;

        this.accept = function(a) {
            if(a.visitQuoted) {
                return a.visitQuoted(this);
            }
        };
    },
    Identifier: function(value) {
        this.value = value;

        this.accept = function(a) {
            if(a.visitIdentifier) {
                return a.visitIdentifier(this);
            }
        };
    },
    Tuple: function(values) {
        this.values= values;

        this.accept = function(a) {
            if(a.visitTuple) {
                return a.visitTuple(this);
            }
        };
    },
    Number: function(value) {
        this.value = value;

        this.accept = function(a) {
            if(a.visitNumber) {
                return a.visitNumber(this);
            }
        };
    },
    String: function(value) {
        this.value = value;

        this.accept = function(a) {
            if(a.visitString) {
                return a.visitString(this);
            }
        };
    },
    Boolean: function(value) {
        this.value = value;

        this.accept = function(a) {
            if(a.visitBoolean) {
                return a.visitBoolean(this);
            }
        };
    },
    Array: function(values) {
        this.values = values;

        this.accept = function(a) {
            if(a.visitArray) {
                return a.visitArray(this);
            }
        };
    },
    Object: function(values) {
        this.values = values;

        this.accept = function(a) {
            if(a.visitObject) {
                return a.visitObject(this);
            }
        };
    }
};
