CodeMirror.defineMode("roy", function(config, parserConfig) {
  return {
    token: function(stream, state) {
      var token, sliced = stream.string.slice(stream.pos);
      try {
        token = roy.lexer.tokenise(sliced)[0];
        if(!token[1].length) {
          stream.next();
          return;
        }
        stream.pos += sliced.match(/\s*/)[0].length + token[1].length;
      } catch(e) {
        stream.next();
        return;
      }

      switch(token[0]) {
      case 'LET':
      case 'IF':
      case 'THEN':
      case 'ELSE':
      case 'DATA':
      case 'TYPE':
      case 'MATCH':
      case 'CASE':
      case 'DO':
      case 'RETURN':
      case 'MACRO':
      case 'WITH':
      case 'WHERE':
          return 'keyword';
      case 'BOOLEAN':
          return 'builtin';
      }
      return token[0].toLowerCase();
    }
  };
});
