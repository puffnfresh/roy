" Vim filetype plugin file
" Language:	Roy
" Maintainer:	Bill Casarin <bill@casarin.ca>
" Last Change: April 24, 2012  

if exists("b:did_ftplugin")
	finish
endif

let b:did_ftplugin = 1

setlocal include="^\s*import\>"
setlocal suffixesadd=.lroy,.roy,.roym
setlocal comments=://
setlocal commentstring=//%s
setlocal define="^\s*macro\>"

" Uncomment the following two lines to force julia source-code style
set shiftwidth=2
set expandtab

if has("gui_win32")
	let b:browsefilter = "Roy Source Files (*.roy)\t*.lroy\n"
endif
