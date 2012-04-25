" Vim indent file
" Language:	Roy
" Maintainer:	Bill Casarin <bill@casarin.ca>
" Last Change:	April 24, 2012
" Notes:        based on Bram Moneaar's indent file for vim

"set nocindent
"set smartindent
set autoindent

setlocal indentexpr=GetRoyIndent()
setlocal indentkeys+==end,=else,=catch,=}

" Only define the function onceo
if exists("*GetRoyIndent")
endif

function! GetRoyIndent()
  " Find a non-blank line above the current line.
  let lnum = prevnonblank(v:lnum - 1)

  " At the start of the file use zero indent.
  if lnum == 0
    return 0
  endif

  " Add a 'shiftwidth' after matched strings
  let ind = indent(lnum)
  let line = getline(lnum)

  let i = match(line, '\.*\(if\)\.*') 
  if i >= 0
    let ind = i + &sw
  endif

  if match(line, '\.*{\s*$') >= 0
    let ind += &sw
  endif

  if match(line, '\.*=\s*$') >= 0
    let ind += &sw
  endif

  let i = match(line, '^\s*\(where\|else\|do\)')
  if i >= 0
    let ind += &sw
  endif

  " Subtract a 'shiftwidth' on a end, catch, else and elseif
  if getline(v:lnum) =~ '^\s*\(else\|}\)'
    let ind -= &sw
  endif

  return ind
endfunction
