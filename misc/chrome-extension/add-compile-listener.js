chrome.extension.onRequest.addListener(function(request, sender, sendResponse) {
  var js;
  try {
    js = roy.compile(request.code).output;
  } catch(e) {
    js = e.toString();
  }
  sendResponse({js: js});
});
