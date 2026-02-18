(function () {
  function appendError(message) {
    var panelId = 'BootErrorPanel';
    var panel = document.getElementById(panelId);
    if (!panel) {
      panel = document.createElement('pre');
      panel.id = panelId;
      panel.style.position = 'fixed';
      panel.style.left = '8px';
      panel.style.right = '8px';
      panel.style.bottom = '8px';
      panel.style.maxHeight = '40%';
      panel.style.overflow = 'auto';
      panel.style.margin = '0';
      panel.style.padding = '10px';
      panel.style.background = 'rgba(0,0,0,0.75)';
      panel.style.color = '#ffb4b4';
      panel.style.font = '12px/1.4 Menlo, Monaco, monospace';
      panel.style.border = '1px solid rgba(255,180,180,0.5)';
      panel.style.borderRadius = '8px';
      panel.style.zIndex = '2147483647';
      panel.textContent = '[boot] runtime error\n';
      document.body.appendChild(panel);
    }
    panel.textContent += '\n' + message;
  }

  var originalConsoleError = console.error ? console.error.bind(console) : null;
  console.error = function () {
    var parts = [];
    for (var i = 0; i < arguments.length; i += 1) {
      var item = arguments[i];
      parts.push(String(item && item.stack ? item.stack : item));
    }
    appendError('[console.error] ' + parts.join(' | '));
    if (originalConsoleError) {
      originalConsoleError.apply(console, arguments);
    }
  };

  window.addEventListener('error', function (event) {
    var msg = event && (event.message || (event.error && event.error.stack));
    if (msg) appendError('[window.error] ' + msg);
  });

  window.addEventListener('unhandledrejection', function (event) {
    var reason = event && event.reason;
    appendError('[unhandledrejection] ' + String(reason && reason.stack ? reason.stack : reason));
  });

  var gameCanvas = document.getElementById('GameCanvas');
  if (gameCanvas) {
    gameCanvas.addEventListener('contextmenu', function (event) {
      event.preventDefault();
    });
  }

  if (typeof System === 'undefined') {
    appendError('SystemJS is unavailable');
    return;
  }

  System.import('./index.js').catch(function (err) {
    appendError('[System.import] ' + String(err && err.stack ? err.stack : err));
    console.error(err);
  });
})();
