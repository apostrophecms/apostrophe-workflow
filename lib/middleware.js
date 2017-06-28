var _ = require('lodash');
var async = require('async');

module.exports = function(self, options) {

  // Set `req.locale` based on `req.query.locale` or `req.session.locale`.
  // If the locale is not present or is not valid, set `req.locale` to the
  // default locale. Store the locale in `req.session.locale`. TODO: also
  // implement subdomains and URL prefixes for locales.

  self.expressMiddleware = {
    before: 'apostrophe-global',
    middleware: function(req, res, next) {
      var to, host, matches, locale, subdomain;
      if (req.query.workflowLocale) {
        // Switch locale choice in session via query string, then redirect
        var locale = self.apos.launder.string(req.query.workflowLocale);
        if (self.options.subdomains) {
          // Don't let the subdomain just switch it back
          to = req.absoluteUrl.replace(/\??workflowLocale=[^&]+&?/, '');
          matches = to.match(/^(https?\:)?\/\/([^\.]+)/);
          subdomain = matches[2];
          if (subdomain && _.has(self.locales, subdomain)) {
            to = to.replace('//' + subdomain + '.', '//' + locale + '.');
          } else {
            // We can assume it is the bare domain, add the locale
            to = to.replace('//', '//' + locale + '.');
          }
          return res.redirect(to);
        } else {
          if (_.has(self.locales, locale)) {
            req.session.locale = locale;
          }
          return res.redirect(req.url.replace(/\??workflowLocale=[^&]+&?/, ''));
        }
      }
      if (self.options.subdomains) {
        host = self.getHost(req);
        matches = host.match(/^[^\.]+/);
        if (matches) {
          subdomain = matches[0];
          if (_.has(self.locales, subdomain)) {
            req.session.locale = subdomain;
          }
        }
      } else if (self.options.prefixes) {
        matches = req.url.match(/^\/([^\/]+)/);
        if (matches) {
          locale = matches[1];
          if (_.has(self.locales, locale)) {
            req.session.locale = locale;
          }
        }
      }
      req.locale = req.session.locale;

      // Resort to the default locale if (1) there is no indication of what locale to use,
      // (2) the locale isn't configured, or (3) the locale is private and we don't have
      // permission to view private locales.
      
      if ((!req.locale) || (!_.has(self.locales, req.locale)) ||
        (self.locales[req.locale].private && (!self.apos.permissions.can(req, 'private-locales')))) {
        req.locale = self.defaultLocale;
        req.session.locale = req.locale;
      }

      if (req.user) {
        if (req.session.workflowMode === 'draft') {
          req.locale = self.draftify(req.locale);
        } else {
          // Default mode is previewing the live content, not editing
          req.session.workflowMode = 'live';
        }
      }

      if (self.options.prefixes && (req.url === '/')) {
        // With URL prefixes in effect, the home pages for the various
        // locales have different URLs. Redirect to the appropriate
        // homepage
        return res.redirect('/' + self.liveify(req.locale) + '/');
      }

      return next();
    }
  };
};
