var _ = require('lodash');

module.exports = function(self, options) {

  // Set `req.locale` based on `req.query.workflowLocale`, `req.session.locale`,
  // the hostname and/or the URL prefix.
  //
  // If the locale is not present or is not valid, set `req.locale` to the
  // default locale by calling `self.guessLocale`.
  //
  // Store the locale in `req.session.locale` as well.

  self.expressMiddleware = {
    before: 'apostrophe-global',
    middleware: function(req, res, next) {
      var to, host, matches, locale, prefix, hostname, subdomain, domain, candidates;

      req.data = req.data || {};
      req.data.workflow = req.data.workflow || {};
      _.assign(req.data.workflow, _.pick(self, 'locales', 'nestedLocales'));

      // Hack to implement bc with the subdomains option
      // by populating self.hostnames for each prefix, as soon as we
      // actually know what the domain name is
      if (self.options.subdomains && (!self.hostnames)) {
        host = self.getHost(req);
        self.hostnames = {};
        matches = host.match(/^([^:.]+)(\.([^:]+))?:?/);
        subdomain = matches[1];
        domain = matches[3];
        if (!_.has(self.locales, subdomain)) {
          domain = host;
          if (domain.match(/(:80|:443)$/)) {
            domain = domain.replace(/:\d+$/, '');
          }
        }
        _.each(self.locales, function(locale, name) {
          if (!name.match(/-draft$/)) {
            if (!locale.private) {
              self.hostnames[name] = name + '.' + domain;
            } else {
              self.hostnames[name] = domain;
            }
          }
        });
      }

      if (req.query.workflowLocale) {
        // Switch locale choice in session via query string, then redirect
        locale = self.apos.launder.string(req.query.workflowLocale);
        if (_.has(self.locales, locale)) {
          req.session.locale = locale;
        }
        if (self.hostnames) {
          // Don't let a stale hostname just switch it back
          to = req.absoluteUrl.replace(/\??workflowLocale=[^&]+&?/, '');
          matches = to.match(/^(https?:)?\/\/([^/:]+)/);
          hostname = matches[2];
          if (hostname) {
            to = to.replace('//' + hostname, '//' + self.hostnames[self.liveify(req.query.workflowLocale)]);
          }
          return res.redirect(to);
        } else {
          return res.redirect(req.url.replace(/\??workflowLocale=[^&]+&?/, ''));
        }
      }

      // Start with all of the non-draft locales as candidates
      // (we implement draft vs. live at the end)

      candidates = _.filter(_.keys(self.locales), function(locale) {
        return locale === self.liveify(locale);
      });

      // Winnow it down by hostname

      if (self.hostnames) {
        host = self.getHost(req);
        matches = host.match(/^[^:]+/);
        if (matches) {
          hostname = matches[0];
          candidates = _.filter(candidates, function(candidate) {
            return self.hostnames[candidate] === hostname;
          });
        }
      }

      // If we're not down to one yet, winnow it down by prefix
      if ((candidates.length > 1) && self.prefixes) {
        matches = req.url.match(/^\/[^/]+/);
        if (matches) {
          prefix = matches[0];
          candidates = _.filter(candidates, function(candidate) {
            return self.prefixes[candidate] === prefix;
          });
        }
      }

      // If we made it down to one locale, that's the winner
      if (candidates.length === 1) {
        req.session.locale = candidates[0];
      }
      req.locale = req.session.locale;

      // Resort to the default locale if (1) there is no indication of what locale to use,
      // (2) the locale isn't configured, or (3) the locale is private and we don't have
      // permission to view private locales.

      if ((!req.locale) || (!_.has(self.locales, req.locale)) ||
        (self.locales[req.locale].private && (!self.apos.permissions.can(req, 'private-locales')))) {

        self.guessLocale(req);
        req.session.locale = req.locale;
      }

      if (req.user) {
        if (req.session.workflowMode === 'draft') {
          req.locale = self.draftify(req.locale);
        } else {
          req.locale = self.liveify(req.locale);
          // Default mode is previewing the live content, not editing
          req.session.workflowMode = 'live';
        }
      }

      if (self.prefixes && self.prefixes[self.liveify(req.locale)] && (req.url === '/')) {
        // Redirect to home page of appropriate locale
        return res.redirect(self.prefixes[self.liveify(req.locale)]);
      }

      return next();
    }
  };

};
