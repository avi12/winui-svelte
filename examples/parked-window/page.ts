// noinspection JSUnresolvedReference,JSValidateTypes: the hosted page's own script, in a string
export const PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Heartbeat</title>
</head>
<body>
  <script>
    const webview = window.chrome.webview;
    let frames = 0;
    let nextIdentifier = 1;

    function countFrame() {
      frames++;
      requestAnimationFrame(countFrame);
    }

    requestAnimationFrame(countFrame);
    setInterval(() => {
      webview.postMessage({
        id: nextIdentifier++,
        type: "beat",
        data: {
          time: performance.now(),
          visibility: document.visibilityState,
          frames
        }
      });
    }, 100);
  </script>
</body>
</html>`;
