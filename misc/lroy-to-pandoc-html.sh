# Usage: ./misc/lroy-to-pandoc-html.sh examples/sqrt.lroy
#
# Generates a nice-looking .htm document from a specified .lroy file.
#
# Uses Kevin Burke's Markdown.css

pandoc -s -5 -f markdown -c "http://kevinburke.bitbucket.org/markdowncss/markdown.css" $1 -o $(dirname $1)/$(basename $1 lroy)htm
