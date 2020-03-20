(function() {
  console.log('executing');
  document.body.addEventListener('apos-before-get', addLocaleHeader);
  document.body.addEventListener('apos-before-post', addLocaleHeader);
  function addLocaleHeader(event) {
    console.log('in listener');
    // Easy check for same origin
    var link = document.createElement('a');
    link.href = event.uri;
    if (link.host !== location.host) {
      return;
    }
    event.request.setRequestHeader('Apostrophe-Locale', document.body.getAttribute('data-locale'));
  };
})();
