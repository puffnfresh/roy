function updateOutput() {
    chrome.extension.sendRequest({
        code: document.getElementById('input').value
    }, function(response) {
        document.getElementById('output').innerText = response.js;
    });
}

function runOutput() {
    var script = document.createElement('script');
    script.type= 'text/javascript';
    script.innerHTML = document.getElementById('output').innerText;
    document.body.appendChild(script);
}

var source = document.body.innerText;
document.body.innerHTML = '<h1>Roy</h1><textarea id="input"></textarea><h1>JavaScript</h1><pre><code id="output"></code></pre><input id="compile" type="button" value="Compile" /><input id="run" type="button" value="Run" />';
document.getElementById('input').value = source;
document.getElementById('compile').addEventListener('click', updateOutput);
document.getElementById('run').addEventListener('click', runOutput);
updateOutput();
