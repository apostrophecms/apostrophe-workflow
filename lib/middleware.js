var _ = require('@sailshq/lodash');

module.exports = function(self, options) {

  // Set `req.locale` based on `req.query.workflowLocale`, `req.session.locale`,
  // the hostname and/or the URL prefix.
  //
  // If the locale is not present or is not valid, set `req.locale` to the
  // default locale by calling `self.guessLocale`.
  //
  // Store the locale in `req.session.locale` as well unless disabled.

  self.expressMiddleware = {
    before: 'apostrophe-global',
    middleware: function(req, res, next) {
      var to, host, matches, locale, prefix, hostname, subdomain, domain, candidates, setByUs;

      function setLocale(locale) {
        req.locale = locale;
        if (locale) {
          setByUs = true;
        }
        if (self.localeInSession(req)) {
          req.session.locale = locale;
        }
        if (self.apos.hasOwnProperty('i18n')) {
          self.apos.i18n.setLocale(req, locale);
        }
      }

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
          setLocale(locale);
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

      // test reqs might not have a headers object
      if (req.headers && req.headers['apostrophe-locale']) {
        // API calls use apostrophe-locale headers
        if (_.has(self.locales, req.headers['apostrophe-locale'])) {
          // To avoid race conditions that can break locale switching,
          // we don't modify the session based on the header
          if (self.apos.hasOwnProperty('i18n')) {
            // Careful, i18n.setLocale does not grasp draft locales
            self.apos.i18n.setLocale(req, self.liveify(req.headers['apostrophe-locale']));
          }
          req.locale = req.headers['apostrophe-locale'];
          return next();
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
            if (self.locales[candidate] && self.locales[candidate].private) {
              if (!self.apos.permissions.can(req, 'private-locales')) {
                return false;
              }
            }
            return self.hostnames[candidate] === hostname;
          });
        }
      }

      function extractRootLevelLocale(candidates) {
        return _.filter(candidates, function (candidate) {
          const locale = self.locales[candidate];
          return (!locale.private) && (!_.has(self.prefixes, candidate));
        });
      }

      // If we're not down to one yet, winnow it down by prefix
      if ((candidates.length > 1) && self.prefixes) {
        // If we're dealing with a locale which shares the hostname
        // with other locales, but doesn't have a prefix, (i.e. it
        // exists at the root level of the hostname), figure out
        // that locale and set that as the current session's locale.
        if (req.url.match(/^\/(\?|$)/)) {
          // a locale which resides at the root level of a shared
          // hostname won't have a prefix. So we select the candidate
          // which doesn't have a prefix in this case.
          candidates = extractRootLevelLocale(candidates);
        } else {
          matches = req.url.match(/^\/[^/]+/);
          if (matches) {
            prefix = matches[0];

            var filteredCandidates = _.filter(candidates, function (candidate) {
              return self.prefixes[candidate] === prefix;
            });

            // At this stage, if the list of filtered candidates is
            // empty, it means the first fragment of the URI didn't
            // match any of the candidates' locale prefixes.
            //
            // We're here because the hostname filter did not narrow
            // the candidates to one, so this is likely to be a URI
            // for a root-level locale among candidates filtered by
            // hostname.
            //
            // However, it could also be an API URL which doesn't care
            // about the locale or is counting on the existing value
            // of req.locale. To resolve this ambiguity we check for
            // a standardized list of URI prefixes that do not
            // imply a locale. This list can be extended.

            if (filteredCandidates.length === 0) {
              if (!self.isApiCall(req)) {
                candidates = extractRootLevelLocale(candidates);
              }
            } else {
              // if the candidates list isn't empty, the URI's first fragment
              // matched the locale prefix for one of the candidates, in which
              // case it's fairly clear how to proceed.
              candidates = filteredCandidates;
            }
          }
        }
      }

      // If we made it down to one locale, that's the winner
      if (candidates.length === 1) {
        var privateLocale = self.locales[candidates[0]] && self.locales[candidates[0]].private;
        if (privateLocale) {
          if (self.apos.permissions.can(req, 'private-locales')) {
            setLocale(candidates[0]);
          }
        } else {
          setLocale(candidates[0]);
        }
      }
      const hostnameDefaultLocale = self.getLocaleViaHostnameDefault(req);
      if (hostnameDefaultLocale && (!setByUs)) {
        if (self.locales[hostnameDefaultLocale] && self.locales[hostnameDefaultLocale].private) {
          if (self.apos.permissions.can(req, 'private-locales')) {
            setLocale(hostnameDefaultLocale);
          }
        } else {
          setLocale(hostnameDefaultLocale);
        }
      }

      req.locale = self.localeInSession(req) ? req.session.locale : req.locale;
      // Resort to the default locale if (1) there is no indication of what locale to use,
      // (2) the locale isn't configured, or (3) the locale is private and we don't have
      // permission to view private locales.

      if ((!req.locale) || (!_.has(self.locales, req.locale)) ||
        (self.locales[req.locale].private && (!self.apos.permissions.can(req, 'private-locales')))) {
        self.guessLocale(req);
        setLocale(req.locale);
      }

      if (req.user) {
        // Handle preview mode first
        if (!req.session.workflowMode && self.defaultMode === 'preview') {
          req.session.workflowPreview = true;
        }

        req.session.workflowMode = req.session.workflowMode || self.defaultMode;
        if (req.session.workflowMode === 'live') {
          req.locale = self.liveify(req.locale);
          req.session.workflowMode = 'live';
        } else {
          req.locale = self.draftify(req.locale);
          req.session.workflowMode = 'draft';
        }
      }

      if (self.prefixes && self.prefixes[self.liveify(req.locale)] && req.url.match(/^\/(\?|$)/)) {
        // Redirect to home page of appropriate locale
        let newUrl = self.prefixes[self.liveify(req.locale)] + '/';
        const matches = req.url.match(/^\/(\?.*)$/);
        if (matches) {
          newUrl += matches[1];
        }
        return res.redirect(self.options.missingPrefixRedirectStatusCode || 302, newUrl);
      }

      return next();
    }
  };

};
