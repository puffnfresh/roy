" Vim syntax file
" Language: Roy (http://roy.brianmckenna.org/)
" Maintainer: Shigeo Esehara, Bill Casarin <bill@casarin.ca>
" Last Change: 2011.11.29

if version < 600
    syn clear
elseif exists("b:current_syntax")
    finish
endif

"keywords
syn keyword royStatement bind
syn keyword royStatement case
syn keyword royStatement data
syn keyword royStatement do 
syn keyword royStatement else
syn keyword royStatement if
syn keyword royStatement macro 
syn keyword royStatement match
syn keyword royStatement return 
syn keyword royStatement then
syn keyword royStatement type
syn keyword royStatement typeclass
syn keyword royStatement instance
syn keyword royStatement where
syn keyword royStatement with

syn keyword royConstant true false
syn keyword royImport import export
syn keyword royMacro macro

" Types {{{
syn keyword royType Boolean
syn keyword royType Either
syn keyword royType Function
syn keyword royType Maybe
syn keyword royType Native
syn keyword royType Number
syn keyword royType String
" }}}

"defined type or data
syn keyword roySymbol let nextgroup=roySymbol skipwhite
syn match   roySymbol  "\%(\%(let\s\)\s*\)\@<=\%([a-zA-Z0-9$_]\)*" contained
syn match   royLiteralTok "[<>!=/\%\+\*\-&←λ→\\⇒]"
syn match   royNumber "\<\d\+\>"
syn match   royTypeVariable "#[a-zA-Z]\+"

"Braces,Parens
syn match   roySurround "[{}]"
syn match   roySurround  "[()]"

"Comment
syn match  royComment "//.*$" display contains=royTodo,@Spell
syn keyword royTodo   FIXME NOTE NOTES TODO XXX contained

"String
syn region  royStringD	       start=+"+  skip=+\\\\\|\\"+  end=+"\|$+
syn region  royStringS	       start=+'+  skip=+\\\\\|\\'+  end=+'\|$+

if version >= 508 || !exists("did_roy_syn_inits")
  if version <= 508
    let did_roy_syn_inits = 1
    command -nargs=+ HiLink hi link <args>
  else
    command -nargs=+ HiLink hi def link <args>
  endif
  
  HiLink royComment   Comment
  HiLink royStringD    String
  HiLink royStringS    String
  HiLink royStatement Statement
  HiLink roySymbol    Function
  HiLink roySurround  Nothing
  HiLink royConstant  Constant
  HiLink royTodo      Todo
  HiLink royType      Type
  HiLink royImport    Include
  HiLink royMacro     Macro
  HiLink royLiteralTok Operator
  HiLink royNumber       Number
  HiLink royTypeVariable Type

  delcommand HiLink
endif


let b:current_syntax = "roy"
