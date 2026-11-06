// The hosted web content, as the page's own script sees the link: plain
// window.chrome.webview and messaging's frames, no bundle (an app that bundles
// its page imports createPageTransport from winui-svelte/messaging/page).
// noinspection JSUnresolvedReference,JSValidateTypes: the hosted page's own script, in a string
export const PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Hosted page</title>
</head>
<body>
  <h1>Hosted page</h1>
  <p id="reply">waiting for the host</p>
  <script>
    const webview = window.chrome.webview;
    let nextIdentifier = 1;
    const pending = new Map();

    function request(type, data) {
      const id = nextIdentifier++;
      webview.postMessage({ id, type, data });
      return new Promise(resolve => pending.set(id, resolve));
    }

    webview.addEventListener("message", event => {
      const frame = event.data;
      if (frame.type === undefined) {
        pending.get(frame.id)?.(frame.response);
        pending.delete(frame.id);
        return;
      }

      if (frame.type === "title") {
        webview.postMessage({ id: frame.id, response: document.title });
      }
    });

    request("greet", "page").then(reply => {
      document.getElementById("reply").textContent = reply;
      return request("ready");
    });
  </script>
</body>
</html>`;
