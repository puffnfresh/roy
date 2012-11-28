var _ = require('underscore');

var prettyPrint = function(n) {
    return n.accept({
        visitFunction: function() {
            return "\\" + _.map(n.args, prettyPrint).join(" ") + " -> " + _.map(n.body, prettyPrint);
        },
        visitArg: function() {
            return n.name;
        },
        visitLet: function() {
            return "let " + n.name + " = " + prettyPrint(n.value);
        },
        visitCall: function() {
            return prettyPrint(n.func) + " " + _.map(n.args, prettyPrint).join(" ");
        },
        visitAccess: function() {
            return prettyPrint(n.value) + "." + n.property;
        },
        visitBinaryGenericOperator: function() {
            return [prettyPrint(n.left), n.name, prettyPrint(n.right)].join(" ");
        },
        visitBinaryNumberOperator: function() {
            return [prettyPrint(n.left), n.name, prettyPrint(n.right)].join(" ");
        },
        visitBinaryBooleanOperator: function() {
            return [prettyPrint(n.left), n.name, prettyPrint(n.right)].join(" ");
        },
        visitBinaryStringOperator: function() {
            return [prettyPrint(n.left), n.name, prettyPrint(n.right)].join(" ");
        },
        visitComment: function() {
            return n.value;
        },
        visitIdentifier: function() {
            return n.value;
        },
        visitNumber: function() {
            return n.value;
        },
        visitString: function() {
            return n.value;
        },
        visitBoolean: function() {
            return n.value;
        },
        visitUnit: function() {
            return "()";
        },
        visitArray: function() {
            return '[' + _.map(n.values, prettyPrint).join(', ') + ']';
        },
        visitTuple: function() {
            return '(' + _.map(n.values, prettyPrint).join(', ') + ')';
        },
        visitObject: function() {
            var key;
            var pairs = [];
            for(key in n.values) {
                pairs.push(key + ": " + prettyPrint(n.values[key]));
            }
            return "{" + pairs.join(", ") + "}";
        }
    });
};

exports.prettyPrint = prettyPrint;
