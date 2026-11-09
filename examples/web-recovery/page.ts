// The hosted page: posts a message to the app every second and answers "ping"
// with "pong", so the app can tell the page's window.chrome.webview works.
// noinspection JSUnresolvedReference,JSValidateTypes: the hosted page's own script, in a string
export const PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Recovery page</title>
</head>
<body>
  <h1>Recovery page</h1>
  <script>
    const webview = window.chrome.webview;
    setInterval(() => webview.postMessage({ type: "tick" }), 1000);
    webview.addEventListener("message", event => {
      if (event.data === "ping") {
        webview.postMessage({ type: "pong" });
      }
    });
  </script>
</body>
</html>`;
